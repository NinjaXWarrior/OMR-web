"""FastAPI backend for OMR (bubble sheet) grading.

Accepts an answer key CSV, a template pickle, and a batch of sheet photos;
grades them in a background thread and streams progress/previews to the
browser. See architecture.md for the full request/response flow.
"""
import os
import time
import uuid
import threading
import csv
import io
import base64
import pickle
from typing import List, Optional, Dict, Any

import cv2
import numpy as np
from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

from backend_core.omr_engine_fast import OMRProcessorFast, load_answers_from_csv_bytes

app = FastAPI(
    title="OMR Grading API",
    description="Grades scanned bubble-sheet answer sheets against a template and answer key.",
    version="1.0.0",
)
# Allow your frontend to call backend (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")


class RunResponse(BaseModel):
    job_id: str


class ProgressResponse(BaseModel):
    state: str  # running | done | error | unknown
    done: int = 0
    total: int = 0
    last: str = ""
    elapsed: float = 0.0
    ips: float = 0.0
    eta: float = 0.0
    error: Optional[str] = None
    has_preview: bool = False
    preview_count: int = 0
    record_count: int = 0


class PreviewItem(BaseModel):
    index: int
    name: str
    status: str
    score: Any


class PreviewListResponse(BaseModel):
    items: List[PreviewItem]


@app.get("/", response_class=HTMLResponse, tags=["Pages"], summary="Upload page")
def home(request: Request):
    """Render the main page for uploading answers, template, and sheet images."""
    return templates.TemplateResponse(request, "index.html")


@app.get("/checked-sheets/{job_id}", response_class=HTMLResponse, tags=["Pages"], summary="Sheet review page")
def checked_sheets_page(request: Request, job_id: str):
    """Render the page that lets a user page through every graded sheet in a job."""
    return templates.TemplateResponse(request, "checked_sheets.html", {"job_id": job_id})

# job_id -> job info
jobs: Dict[str, Dict[str, Any]] = {}
jobs_lock = threading.Lock()
def run_job(job_id, image_names, image_arrays, answers_payload, template_payload):
    """
    Background worker.
    Process uploaded images using uploaded answer and template files.
    """
    total = len(image_names)
    t0 = time.time()

    with jobs_lock:
        jobs[job_id] = {
            "state": "running",
            "done": 0,
            "total": total,
            "preview": None,
            "previews": [],
            "last": "",
            "t0": t0,
            "records": [],
            "rows": [],      # store per-image results for CSV
            "error": None,   # store error text if something fails
        }

    try:
        processor = OMRProcessorFast(
            template_bytes=template_payload["content"],
            answers_csv_bytes=answers_payload["content"],
            template_name=template_payload["filename"],
            answers_name=answers_payload["filename"],
        )
        for i, (name, img) in enumerate(zip(image_names, image_arrays), start=1):
            with jobs_lock:
                jobs[job_id]["last"] = os.path.basename(name)
            result=processor.process_image(name,img)
            status = result["status"]
            score = result["score"]
            records = result["records"]
            preview_b64 = result["preview_b64"]
            with jobs_lock:
                jobs[job_id]["done"] = i
                jobs[job_id]["rows"].append([name, score, status])
                jobs[job_id]["preview"] = preview_b64
                jobs[job_id]["previews"].append({
                    "name": os.path.basename(name),
                    "status": status,
                    "score": score,
                    "image_b64": preview_b64,
                })
                jobs[job_id]["records"] = records

        with jobs_lock:
            jobs[job_id]["state"] = "done"

    except Exception as e:
        with jobs_lock:
            jobs[job_id]["state"] = "error"
            failed_name = jobs[job_id].get("last", "")
            if failed_name:
                jobs[job_id]["error"] = f"{failed_name}: {e}"
            else:
                jobs[job_id]["error"] = str(e)
            # print('error',e)

@app.post("/run", response_model=RunResponse, tags=["Jobs"], summary="Start a grading job")
async def start_run(
    answers: UploadFile = File(..., description="Answer key CSV (Question, Subject, Marks_Correct, Negative_Percent, Answer)"),
    template: UploadFile = File(..., description="Template .pickle produced by the template-builder tool"),
    images: List[UploadFile] = File(..., description="One or more photographed answer sheets"),
    pdf: Optional[UploadFile] = File(None, description="Accepted from the UI but not currently processed by the grading pipeline"),
):
    """Validate the uploads, spawn a background grading thread, and return its job_id."""
    if not images:
        raise HTTPException(status_code=400, detail="No images uploaded")

    job_id = str(uuid.uuid4())

    image_names = []
    image_arrays = []

    for f in images:
        content = await f.read()

        # Convert to OpenCV image
        nparr = np.frombuffer(content, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            continue  # skip invalid images

        image_names.append(f.filename)
        image_arrays.append(img)

    answers_content = await answers.read()
    if not answers_content:
        raise HTTPException(status_code=400, detail="Answers file is empty")

    try:
        load_answers_from_csv_bytes(answers_content, answers.filename or "answers.csv")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid answers file: {exc}")

    template_content = await template.read()
    if not template_content:
        raise HTTPException(status_code=400, detail="Template file is empty")

    try:
        pickle.loads(template_content)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid template file: {exc}")

    answers_payload = {
        "filename": answers.filename or "answers.csv",
        "content": answers_content,
    }
    template_payload = {
        "filename": template.filename or "template.pickle",
        "content": template_content,
    }

    threading.Thread(
        target=run_job,
        args=(job_id, image_names, image_arrays, answers_payload, template_payload),
        daemon=True
    ).start()


    return RunResponse(job_id=job_id)


@app.get("/progress/{job_id}", response_model=ProgressResponse, tags=["Jobs"], summary="Poll job progress")
def get_progress(job_id: str):
    """Return current progress counters for a job. Frontend polls this every 300ms."""
    with jobs_lock:
        j = jobs.get(job_id)

    if not j:
        return ProgressResponse(state="unknown")

    elapsed = max(0.001, time.time() - j["t0"])
    preview = j["preview"]
    done = int(j.get("done", 0))
    total = int(j.get("total", 0)) or 1
    ips = done / elapsed
    eta = (total - done) / ips if ips > 0 else 0.0

    return ProgressResponse(
        state=j["state"],
        done=done,
        total=total,
        last=j.get("last", ""),
        elapsed=elapsed,
        ips=ips,
        eta=eta,
        error=j.get("error", None),
        has_preview=bool(preview),
        preview_count=len(j.get("previews", [])),
        record_count=len(j.get("records", [])),
    )


@app.get(
    "/preview/{job_id}",
    tags=["Previews"],
    summary="Latest sheet preview (JPEG)",
    responses={200: {"content": {"image/jpeg": {}}}},
)
def preview(job_id: str):
    """Return the most recently graded sheet's annotated preview image."""
    with jobs_lock:
        j = jobs.get(job_id)

    if not j:
        raise HTTPException(status_code=404, detail="job not found")

    preview_b64 = j.get("preview")
    if not preview_b64:
        raise HTTPException(status_code=404, detail="preview not ready")

    try:
        preview_bytes = base64.b64decode(preview_b64)
    except Exception:
        raise HTTPException(status_code=500, detail="invalid preview data")

    return Response(
        content=preview_bytes,
        media_type="image/jpeg",
        headers={"Cache-Control": "no-store"},
    )


@app.get("/previews/{job_id}", response_model=PreviewListResponse, tags=["Previews"], summary="List graded sheets")
def preview_list(job_id: str):
    """Return the name/status/score of every sheet graded so far in a job, in order."""
    with jobs_lock:
        j = jobs.get(job_id)

    if not j:
        raise HTTPException(status_code=404, detail="job not found")

    previews = j.get("previews", [])
    return PreviewListResponse(
        items=[
            PreviewItem(
                index=index,
                name=item.get("name", f"sheet_{index + 1}"),
                status=item.get("status", ""),
                score=item.get("score", ""),
            )
            for index, item in enumerate(previews)
        ]
    )


@app.get(
    "/preview/{job_id}/{index}",
    tags=["Previews"],
    summary="Sheet preview by index (JPEG)",
    responses={200: {"content": {"image/jpeg": {}}}},
)
def preview_by_index(job_id: str, index: int):
    """Return the annotated preview image for one specific sheet in a job."""
    with jobs_lock:
        j = jobs.get(job_id)

    if not j:
        raise HTTPException(status_code=404, detail="job not found")

    previews = j.get("previews", [])
    if index < 0 or index >= len(previews):
        raise HTTPException(status_code=404, detail="preview not found")

    preview_b64 = previews[index].get("image_b64")
    if not preview_b64:
        raise HTTPException(status_code=404, detail="preview not ready")

    try:
        preview_bytes = base64.b64decode(preview_b64)
    except Exception:
        raise HTTPException(status_code=500, detail="invalid preview data")

    return Response(
        content=preview_bytes,
        media_type="image/jpeg",
        headers={"Cache-Control": "no-store"},
    )


@app.get(
    "/report/{job_id}",
    tags=["Reports"],
    summary="Export graded results as CSV",
    responses={200: {"content": {"text/csv": {}}}},
)
def report(job_id: str):
    """Build and return a CSV of every graded sheet's answers and score for a job."""
    with jobs_lock:
        j = jobs.get(job_id)

    if not j:
        raise HTTPException(status_code=404, detail="job not found")

    if j["state"] not in ("done", "error"):
        raise HTTPException(status_code=400, detail="job not finished")

    records = j.get("records", [])
    if not records:
        raise HTTPException(status_code=400, detail="no records to export")

    r0 = records[0]

    # 1) question keys are ints: 1..N
    q_int_keys = sorted([k for k in r0.keys() if isinstance(k, int)])

    # 2) subject-wise keys: marks_Science, marks_Maths, ...
    subj_keys = sorted([k for k in r0.keys() if isinstance(k, str) and k.startswith("marks_")])

    # 3) build export records with Q1..QN string keys
    export_records = []
    for rec in records:
        new_rec = dict(rec)  # copy
        for q in q_int_keys:
            new_rec[f"Q{q}"] = rec.get(q, "")
        export_records.append(new_rec)

    # 4) columns order
    columns = (
        ["File_name", "Rollno"]
        + [f"Q{q}" for q in q_int_keys]
        + subj_keys
        + ["correct", "wrong", "skipped", "Invalid", "score", "total_questions"]
    )

    # 5) write CSV in memory
    out = io.StringIO()
    w = csv.DictWriter(out, fieldnames=columns)
    w.writeheader()

    for r in export_records:
        row = {k: r.get(k, "") for k in columns}
        w.writerow(row)

    # Optional: if error state, append error info
    if j["state"] == "error":
        out.write("\n")
        out.write(f"ERROR,{j.get('error','unknown error')}\n")

    csv_bytes = out.getvalue().encode("utf-8")

    return Response(
        content=csv_bytes,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="omr_report.csv"'},
    )
