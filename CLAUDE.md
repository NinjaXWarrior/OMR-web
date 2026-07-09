# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A FastAPI web app that grades OMR (bubble sheet) answer sheets from photos. A user uploads a template
(`.pickle`, produced by an external template-builder tool, not part of this repo), an answer key CSV, and a
batch of sheet images. The backend calibrates/deskews each photo against the template, reads which bubbles
are filled, scores against the answer key, and streams progress + live previews to the browser.

## Running

```bash
source venv/bin/activate          # venv already exists in this repo checkout
uvicorn app:app --reload          # not in requirements.txt but present in venv; add it if recreating the venv
```

Then open `http://127.0.0.1:8000/`.

There is no test suite, linter, or build step configured in this repo.

## Architecture

Three layers, each a single file:

- **`app.py`** — FastAPI app. Holds an in-memory `jobs` dict (`job_id -> state`) guarded by `jobs_lock`.
  `POST /run` validates the uploaded answers CSV and template pickle, spawns a **daemon thread** running
  `run_job`, and returns immediately with a `job_id`. The frontend polls `GET /progress/{job_id}` for status
  and `GET /preview/{job_id}` (latest) or `GET /preview/{job_id}/{index}` (specific sheet) for JPEG previews.
  `GET /report/{job_id}` builds the CSV export on demand from accumulated `records`. Jobs live only in
  process memory — restarting the server loses all job history.

- **`backend_core/omr_engine_fast.py`** — `OMRProcessorFast` does the actual grading, one instance per job
  (constructed once in `run_job`, reused across all images in that job). Key points:
  - Template pickle (see "Template format" below) is loaded once in `__init__`; per-image work is in
    `process_image()`.
  - Bubble detection is vectorized: build `(x1,y1,x2,y2)` boxes around every roll-number and answer bubble
    center from the template grid, compute a `cv2.integral()` image over the thresholded sheet, then sum
    pixel intensity per box (`_ellipse_sum_integral`, an ellipse inscribed in each box) in one pass rather
    than iterating bubbles individually. A bubble counts as "marked" when filled-ratio exceeds
    `cfg.fill_ratio` (0.3).
  - `_decode_single_choice` turns a row of marked bubbles into one of: selected index, `-1` skipped, `-2`
    invalid (multiple marks).
  - Scoring reads `Marks_Correct` / `Negative_Percent` per question from the answer key and accumulates
    both an overall score and per-subject (`marks_<Subject>`) totals.
  - `process_image` always renders an annotated JPEG preview (bubbles boxed, correct/incorrect/invalid
    labels, roll no./score overlay) and appends the result to `self.records`, which is what
    `/report/{job_id}` exports.
  - `load_answers_from_csv_bytes` / `load_answers_from_csv` parse the answer key; required columns are
    `Question, Subject, Marks_Correct, Negative_Percent, Answer`.

- **`calibration.py`** — `calibrate(gray_image, dimeninfo)` finds four corner registration marks (small
  near-circular contours matching an expected area-% range of the page) via `cv2.findContours`, orders them
  tl/tr/br/bl, perspective-warps the photo to the template's canonical size (`warp_crop_gray`), and
  auto-detects/corrects 180° rotation by comparing ink density above vs. below the sheet's midline. Returns
  `None` on failure, which `omr_engine_fast.py` treats as an invalid sheet (saved to `Invalid_sheets/`).

Processing pipeline per image: raw photo → grayscale → `calibrate()` (find markers, perspective-correct,
fix rotation) → threshold → integral image → per-bubble fill ratios → decode → score → annotate → JPEG preview.

## Template format (`template.pickle`)

A pickled dict describing bubble positions in the *calibrated* (post-warp) coordinate space:

```
{
  "image_size": {"width": int, "height": int},   # calibration target size
  "inputs": {"roll_rows": int, "roll_cols": int, "num_questions": int, "num_options": int},
  "rollno": {"grid": [...], "avg_width": float, "avg_height": float},  # roll digit bubble centers
  "answer": {"grid": [...], "avg_width": float, "avg_height": float}, # question bubble centers, (Nq, 4, 2)
  "passed_counts": {...},
}
```
`rollno.grid` is transposed in `OMRProcessorFast.__init__` from (10 x Ndigits) to (Ndigits x 10). This repo
does not contain the tool that generates template pickles — treat them as an external input.

## Frontend

Plain JS, no build step or framework (`static/app.js`, `static/checked_sheets.js`). `app.js` drives the main
page: file pickers for answers/template/image-folder, `POST /run`, then polls `/progress` every 300ms,
swapping in new preview JPEGs as the job advances. `checked_sheets.js` (served at
`/checked-sheets/{job_id}`, a separate tab) lets the user page back and forth through every graded sheet via
`/previews/{job_id}` (list) and `/preview/{job_id}/{index}` (image).

## Known rough edges (don't "fix" silently, they may be relied upon)

- `requirements.txt` omits `uvicorn`, `python-multipart` is listed but `pydantic`/starlette version pins are
  absent — dependency versions are unconstrained.
- Job state is a plain in-memory dict with no TTL/cleanup, so long-running processes accumulate memory.
- `save_invalid_sheet` writes to `Invalid_sheets/<filename>` relative to the process's CWD.
