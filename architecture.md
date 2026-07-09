# Architecture

OMR (bubble sheet) grading web app. FastAPI backend, plain-JS frontend, no
build step, no database. This document describes the system as it exists in
this repo today — see `CLAUDE.md` for day-to-day dev instructions.

## Components

```
Browser (static/app.js, checked_sheets.js)
   |  multipart/form-data POST /run
   |  poll GET /progress/{job_id}
   |  GET /preview/{job_id}[/{index}], /previews/{job_id}
   |  GET /report/{job_id}
   v
app.py (FastAPI)
   - in-memory `jobs` dict, guarded by `jobs_lock`
   - POST /run spawns a daemon thread -> run_job()
   v
backend_core/omr_engine_fast.py
   - OMRProcessorFast: one instance per job, loads template.pickle once
   - process_image(): per-sheet grading, called from run_job() in a loop
   v
calibration.py
   - calibrate(): corner-mark detection, perspective warp, rotation fix
```

There is no ORM, no database, no message queue, no auth layer. State lives
only in the `jobs` dict in process memory.

## Request flow

1. **Upload** — user picks an answers CSV, a `template.pickle`, and a folder
   of sheet images in `templates/index.html`; `static/app.js` posts them as
   `multipart/form-data` to `POST /run`.
2. **Validation** — `start_run()` in `app.py` decodes every image with
   OpenCV, parses the answers CSV, and unpickles the template — all before
   any background work starts, so bad uploads fail fast with a 4xx.
3. **Job dispatch** — a `job_id` (UUID4) is created, an entry is added to the
   `jobs` dict, and a daemon `threading.Thread` running `run_job()` is
   started. The HTTP response returns immediately with `{"job_id": ...}`.
4. **Grading loop** — `run_job()` constructs one `OMRProcessorFast` for the
   whole job (template load is expensive; do it once) and calls
   `process_image()` once per uploaded sheet, updating `jobs[job_id]` under
   `jobs_lock` after each image.
5. **Per-image grading** (`OMRProcessorFast.process_image`):
   - grayscale → `calibration.calibrate()` (find 4 corner marks, perspective
     warp to the template's canonical size, auto-fix 180° rotation)
   - threshold → `cv2.integral()` → per-bubble fill ratio via
     `_ellipse_sum_integral` (vectorized: all bubble boxes summed in one pass)
   - `_decode_single_choice` per row of bubbles → selected option / skipped
     (`-1`) / multi-marked-invalid (`-2`)
   - score against the answer key (`Marks_Correct` / `Negative_Percent` per
     question, overall + per-subject totals)
   - render an annotated JPEG preview, append a result dict to
     `self.records`
   - a failed calibration returns `None` from `calibrate()`; the caller
     writes the raw photo to `Invalid_sheets/` and raises, which `run_job()`
     catches and turns into `jobs[job_id]["state"] = "error"`.
6. **Progress + previews** — the browser polls `GET /progress/{job_id}`
   every 300ms for counters (`done`, `total`, `eta`, ...) and pulls preview
   JPEGs via `GET /preview/{job_id}` (latest) or `GET /preview/{job_id}/{n}`
   (specific sheet, used by the `checked-sheets` review page).
7. **Export** — once a job reaches `done`/`error`, `GET /report/{job_id}`
   builds a CSV on demand from `jobs[job_id]["records"]` (never persisted to
   disk).

## Template format (`template.pickle`)

Produced by an external template-builder tool not in this repo. A pickled
dict of bubble center coordinates in the *calibrated* (post-warp) coordinate
space — see `CLAUDE.md` → "Template format" for the exact schema.

## API surface

Auto-generated interactive docs: `GET /docs` (Swagger UI) and `GET /redoc`.
Grouped by tag:

| Tag | Endpoints | Purpose |
|---|---|---|
| Pages | `GET /`, `GET /checked-sheets/{job_id}` | server-rendered HTML shell |
| Jobs | `POST /run`, `GET /progress/{job_id}` | start a job, poll its status |
| Previews | `GET /preview/{job_id}`, `GET /preview/{job_id}/{index}`, `GET /previews/{job_id}` | annotated sheet JPEGs + listing |
| Reports | `GET /report/{job_id}` | CSV export |

Request/response shapes for the JSON endpoints are Pydantic models in
`app.py` (`RunResponse`, `ProgressResponse`, `PreviewListResponse`); the
image and CSV endpoints return raw bytes with an explicit `media_type`.
Errors (bad job id, empty upload, bad CSV/pickle) are raised as
`HTTPException`, so they show up in Swagger's response docs and arrive at
the browser as `{"detail": "..."}`.

## Threading and state model

- One daemon thread per job; threads are never joined or cancelled — a
  client that never polls again just leaves the thread running to
  completion in the background.
- All reads/writes to `jobs[...]` go through `jobs_lock`, but the lock is
  per-dict, not per-job — fine at current scale (few concurrent jobs),
  would serialize progress polling under heavy concurrent load.
- Nothing is persisted. Restarting the process drops every job, preview,
  and report in memory.

## Known constraints

See `CLAUDE.md` → "Known rough edges" for things that look like bugs but are
current, relied-upon behavior (unpinned dependency versions, no job
TTL/cleanup, `Invalid_sheets/` written relative to CWD). Don't silently
"fix" those — see the improvement suggestions below instead.

## Suggested improvements

Not implemented — flagging for a decision, in rough priority order:

1. **Pin dependency versions** in `requirements.txt` (`fastapi`, `uvicorn`,
   `opencv-python`, `numpy`) and add `uvicorn` itself, which is currently
   only present because the venv happens to have it installed.
2. **Job TTL / cleanup** — `jobs` grows forever (JPEGs are stored as base64
   in memory per sheet, per job). A background sweep of jobs older than N
   minutes, or an LRU cap, would stop this from being a slow memory leak
   under real usage.
3. **`Invalid_sheets/` path** — currently relative to process CWD
   (`OMRProcessorFast.save_invalid_sheet`), so where it lands depends on how
   the server was launched. Make it configurable / anchored to a fixed data
   directory.
4. **Job persistence** — a server restart mid-batch silently drops results.
   If grading runs are long or valuable, even a simple SQLite table for job
   metadata + a results dir for CSVs would survive restarts.
5. **`_ellipse_sum_integral` is a Python `for` loop over rows inside a
   per-box loop** — the rest of the pipeline is vectorized with NumPy but
   this function isn't; for large question counts this is the likely
   hotspot. Worth profiling before touching, but it's the obvious place a
   speedup would come from.
6. **Concurrency ceiling** — `run_job` threads are unbounded; uploading many
   large batches concurrently spawns unbounded OS threads. A small
   `ThreadPoolExecutor`/semaphore would cap concurrent grading jobs.
7. **`pdf` upload field is dead code** — accepted by `POST /run` and sent by
   the frontend, but never read in `start_run`. Either wire it up or drop it
   from both ends.
8. **Auth / rate limiting** — none today. Fine for a trusted internal tool,
   worth flagging if this is ever exposed beyond a local network.
