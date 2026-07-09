// ---------- Helpers ----------
const $ = (id) => document.getElementById(id);

const ui = {
  status: $("statusText"),
  progress: $("progressInner"),
  elapsed: $("elapsed"),
  ips: $("ips"),
  eta: $("eta"),
  last: $("last"),
  previewEmpty: $("previewEmpty"),
  previewImg: $("previewImg"),
  btnRun: $("btnRun"),
  btnExport: $("btnExport"),
  btnPreviewChecked: $("btnPreviewChecked"),

  fileAnswers: $("fileAnswers"),
  filePDF: $("filePDF"),
  fileFolder: $("fileFolder"),
  fileTemplate: $("fileTemplate"),
  btnSelectFolder: $("btnSelectFolder"),
  btnSelectPDF: $("btnSelectPDF"),
  btnLoadAnswers: $("btnLoadAnswers"),
  btnSelectTemplate: $("btnSelectTemplate"),

  answersPath: $("answersPath"),
  folderPath: $("folderPath"),
  templatePath: $("templatePath"),
};

// ---------- Config ----------
const API_BASE = "";

// ---------- State ----------
let jobId = null;
let pollTimer = null;
let running = false;
let t0 = 0;
let previewUrl = null;
let lastPreviewKey = null;
let previewRequestId = 0;

// ---------- UI setters ----------
function setStatus(s) { ui.status.textContent = s; }
function setProgress(p) {
  ui.progress.style.width = `${Math.max(0, Math.min(100, p))}%`;
}

// ---------- Preview helpers ----------
function clearPreviewUrl() {
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }
}

function hidePreview(message = "Preview will appear here") {
  clearPreviewUrl();
  ui.previewImg.removeAttribute("src");
  ui.previewImg.style.display = "none";
  ui.previewEmpty.textContent = message;
  ui.previewEmpty.style.display = "block";
}

function showPreviewSrc(src) {
  if (!src) return;
  ui.previewImg.src = src;
  ui.previewImg.style.display = "block";
  ui.previewEmpty.style.display = "none";
}

function showLocalPreview(file) {
  if (!file) {
    hidePreview();
    return;
  }

  clearPreviewUrl();
  previewUrl = URL.createObjectURL(file);
  showPreviewSrc(previewUrl);
}

function showPreviewFromBackend(previewB64) {
  if (!previewB64) return; // nothing yet

  clearPreviewUrl();
  const src = previewB64.startsWith("data:")
    ? previewB64
    : "data:image/jpeg;base64," + previewB64;
  showPreviewSrc(src);
}

async function loadPreviewFromBackend(jobIdValue, cacheKey) {
  if (!jobIdValue) return false;

  const requestId = ++previewRequestId;
  const suffix = cacheKey ? `?v=${encodeURIComponent(cacheKey)}` : "";
  const res = await fetch(`${API_BASE}/preview/${jobIdValue}${suffix}`, {
    cache: "no-store",
  });

  if (!res.ok) {
    const message = await res.text().catch(() => "");
    throw new Error(`Preview failed: ${res.status}${message ? ` ${message}` : ""}`);
  }

  const blob = await res.blob();
  if (!blob.size) {
    throw new Error("Preview failed: empty image");
  }

  if (requestId !== previewRequestId) {
    return false;
  }

  clearPreviewUrl();
  previewUrl = URL.createObjectURL(blob);
  showPreviewSrc(previewUrl);
  return true;
}

function updateActionButtons({ running: isRunning = false, canExport = false, canPreview = false } = {}) {
  ui.btnRun.disabled = isRunning;
  ui.btnExport.disabled = isRunning || !canExport;
  ui.btnPreviewChecked.disabled = isRunning || !canPreview;
}

async function showCheckedSheets() {
  if (ui.btnPreviewChecked.disabled || !jobId) return;
  window.open(`${API_BASE}/checked-sheets/${jobId}`, "_blank", "noopener");
}

// ---------- Polling ----------
function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

// ---------- Validation ----------
function validateInputs() {
  const hasAnswers = ui.fileAnswers.files?.length > 0;
  const hasTemplate = ui.fileTemplate.files?.length > 0;
  const hasFolder = ui.fileFolder.files?.length > 0;

  if (!hasFolder) return "Select a folder of images first.";
  if (!hasAnswers) return "Load the answer key file first.";
  if (!hasTemplate) return "Select a template file first.";

  // Require at least 1 image file
  const folderFiles = ui.fileFolder.files || [];
  const hasImage = [...folderFiles].some((f) => /^image\//.test(f.type));
  if (!hasImage) return "Folder contains no image files.";

  return null;
}

// ---------- Progress polling ----------
async function pollProgress() {
  if (!jobId) return;

  try {
    const res = await fetch(`${API_BASE}/progress/${jobId}`);
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Progress failed: ${res.status} ${txt}`);
    }

    const p = await res.json();

    if (p.state === "unknown") {
      stopPolling();
      running = false;
      setStatus("job not found");
      updateActionButtons({ running: false, canExport: false, canPreview: false });
      return;
    }

    const elapsed = (typeof p.elapsed === "number")
      ? p.elapsed
      : (performance.now() - t0) / 1000;

    const doneNum = Number(p.done || 0);
    const totalNum = Number(p.total || 0);
    const totalSafe = Math.max(1, totalNum);

    const ips = (typeof p.ips === "number")
      ? p.ips
      : (doneNum / Math.max(0.001, elapsed));

    const eta = (typeof p.eta === "number")
      ? p.eta
      : (ips > 0 ? ((totalSafe - doneNum) / ips) : 0);

    ui.elapsed.textContent = `${elapsed.toFixed(1)}s`;
    ui.ips.textContent = `${ips.toFixed(1)}`;
    ui.eta.textContent = p.state === "done" ? "0.0s" : `${eta.toFixed(1)}s`;
    ui.last.textContent = p.last || "-";

    setProgress((doneNum / totalSafe) * 100);
    let previewLoaded = false;
    if (p.has_preview) {
      const previewKey = `${jobId}:${doneNum}:${p.last || ""}`;
      if (previewKey === lastPreviewKey) {
        previewLoaded = true;
      } else {
        previewLoaded = await loadPreviewFromBackend(jobId, previewKey);
        if (previewLoaded) {
          lastPreviewKey = previewKey;
        }
      }
    }
    if (p.state === "error") {
      stopPolling();
      running = false;
      setStatus(p.error || "Backend processing failed");
      updateActionButtons({
        running: false,
        canExport: Number(p.record_count || 0) > 0,
        canPreview: Number(p.preview_count || 0) > 0,
      });
      return;
    }

    if (p.state === "done" && (!p.has_preview || previewLoaded)) {
      stopPolling();
      running = false;
      setStatus("done");
      updateActionButtons({
        running: false,
        canExport: Number(p.record_count || 0) > 0,
        canPreview: Number(p.preview_count || 0) > 0,
      });
    }

  } catch (e) {
    stopPolling();
    running = false;
    updateActionButtons({ running: false, canExport: false, canPreview: false });
    hidePreview(e?.message || "Preview error");
    setStatus(e?.message || "Progress error");
  }
}

// ---------- Start backend run ----------
async function startBackendRun() {
  // stop polling from any previous run
  stopPolling();
  jobId = null;
  lastPreviewKey = null;
  previewRequestId += 1;

  const err = validateInputs();
  if (err) {
    setStatus(err);
    return;
  }

  running = true;
  t0 = performance.now();
  setStatus("starting...");
  updateActionButtons({ running: true, canExport: false, canPreview: false });

  try {
    const fd = new FormData();

    // Required: answers file
    const answersFile = ui.fileAnswers.files[0];
    fd.append("answers", answersFile);
    fd.append("template", ui.fileTemplate.files[0]);

    // Optional: PDF
    const pdfFile = ui.filePDF.files?.[0];
    if (pdfFile) fd.append("pdf", pdfFile);

    // Folder images (send only image/*)
    const folderFiles = ui.fileFolder.files;
    let countImages = 0;

    for (const f of folderFiles) {
      if (!/^image\//.test(f.type)) continue;
      countImages++;
      fd.append("images", f, f.webkitRelativePath || f.name);
    }

    if (countImages === 0) {
      throw new Error("Folder contains no image files.");
    }

    const res = await fetch(`${API_BASE}/run`, {
      method: "POST",
      body: fd,
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Start failed: ${res.status} ${txt}`);
    }

    const data = await res.json();
    jobId = data.job_id;
    lastPreviewKey = null;
    previewRequestId += 1;

    setStatus("running");

    // Poll every 300ms
    pollTimer = setInterval(pollProgress, 300);
  } catch (e) {
    running = false;
    updateActionButtons({ running: false, canExport: false, canPreview: false });
    setStatus(e?.message || "Failed to start run");
  }
}

// ---------- Stop UI run (does NOT cancel backend unless you build /cancel) ----------
function stopRunUIOnly() {
  running = false;
  stopPolling();
  setStatus("stopped");
  updateActionButtons({ running: false, canExport: false, canPreview: false });
  // Export stays disabled unless job finished
}

// ---------- Export report ----------
async function exportReportCsv() {
  if (ui.btnExport.disabled) return;
  if (!jobId) {
    setStatus("No job to export.");
    return;
  }

  setStatus("exporting...");

  try {
    const res = await fetch(`${API_BASE}/report/${jobId}`, { method: "GET" });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Export failed: ${res.status} ${txt}`);
    }

    // filename from Content-Disposition if provided
    let filename = "omr_report.csv";
    const cd = res.headers.get("Content-Disposition");
    if (cd) {
      const m = cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';\n]+)["']?/i);
      if (m && m[1]) filename = decodeURIComponent(m[1]);
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
    setStatus("exported");
  } catch (e) {
    setStatus(e?.message || "Export error");
  }
}

// ---------- Events ----------
ui.btnRun.addEventListener("click", startBackendRun);
ui.btnExport.addEventListener("click", exportReportCsv);
ui.btnPreviewChecked.addEventListener("click", showCheckedSheets);

ui.btnSelectPDF.addEventListener("click", () => ui.filePDF.click());
ui.btnSelectFolder.addEventListener("click", () => ui.fileFolder.click());
ui.btnLoadAnswers.addEventListener("click", () => ui.fileAnswers.click());
ui.btnSelectTemplate.addEventListener("click", () => ui.fileTemplate.click());

ui.filePDF.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  if (file.type === "application/pdf") {
    setStatus("PDF preview needs pdf.js or <iframe>/<embed> (not <img>).");
    return;
  }

});

ui.fileAnswers.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  ui.answersPath.value = file ? file.name : "";
});

ui.fileTemplate.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  ui.templatePath.value = file ? file.name : "";
});

ui.fileFolder.addEventListener("change", (e) => {
  const files = e.target.files;
  if (files && files.length) {
    const imageFiles = [...files].filter((f) => /^image\//.test(f.type));
    const first = files[0].webkitRelativePath || files[0].name;
    ui.folderPath.value = first.split("/")[0];
    showLocalPreview(imageFiles[0]);
  } else {
    ui.folderPath.value = "";
    hidePreview();
  }
});

ui.previewImg.addEventListener("error", () => {
  hidePreview("Unable to load preview image");
});

hidePreview();
updateActionButtons({ running: false, canExport: false, canPreview: false });

window.addEventListener("beforeunload", clearPreviewUrl);
