// Student / organization result portal.
const $ = (id) => document.getElementById(id);
const ui = {
  orgId: $("orgId"),
  rollNo: $("rollNo"),
  btnStudent: $("btnStudent"),
  btnOrg: $("btnOrg"),
  status: $("portalStatus"),
  statsCard: $("statsCard"),
  tableCard: $("tableCard"),
  resultTitle: $("resultTitle"),
  statRow: $("statRow"),
  barChart: $("barChart"),
  resultTable: $("resultTable"),
};

const fmtDate = (iso) => new Date(iso).toLocaleDateString();

function setStatus(msg) { ui.status.textContent = msg; }

function hideResults() {
  ui.statsCard.hidden = true;
  ui.tableCard.hidden = true;
}

function stat(label, value) {
  return `<div class="statTile"><div class="statValue">${value}</div><div class="muted">${label}</div></div>`;
}

function renderBars(items) {
  // items: [{label, value}] — pure-CSS bar chart, no libraries
  const max = Math.max(1, ...items.map((i) => i.value));
  ui.barChart.innerHTML = items.map((i) => `
    <div class="barRow">
      <span class="barLabel" title="${i.label}">${i.label}</span>
      <div class="barTrack"><div class="barFill" style="width:${(i.value / max) * 100}%"></div></div>
      <span class="barValue">${i.value}</span>
    </div>`).join("");
}

function renderTable(headers, rows) {
  ui.resultTable.innerHTML =
    `<tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr>` +
    rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("");
  ui.tableCard.hidden = false;
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    let detail = `${res.status}`;
    try { detail = (await res.json()).detail || detail; } catch { /* keep status */ }
    throw new Error(detail);
  }
  return res.json();
}

async function lookupStudent() {
  const org = ui.orgId.value.trim();
  const roll = ui.rollNo.value.trim();
  if (!org || !roll) { setStatus("Enter both Org ID and roll number."); return; }
  hideResults();
  setStatus("loading...");
  try {
    const d = await getJson(`/student/${encodeURIComponent(org)}/${encodeURIComponent(roll)}`);
    setStatus("");
    ui.resultTitle.textContent = `${d.org_name} — Roll No ${d.rollno}`;
    if (!d.exam_count) {
      setStatus("No published results found for this roll number.");
      return;
    }
    const scores = d.results.map((r) => r.score);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    ui.statRow.innerHTML =
      stat("Exams taken", d.exam_count) +
      stat("Average score", avg.toFixed(2)) +
      stat("Best score", Math.max(...scores).toFixed(2)) +
      stat("Latest score", scores[scores.length - 1].toFixed(2));
    renderBars(d.results.map((r) => ({ label: r.exam_name, value: r.score })));
    ui.statsCard.hidden = false;

    const subjects = [...new Set(d.results.flatMap((r) => Object.keys(r.subjects || {})))];
    renderTable(
      ["Exam", "Date", "Score", "Correct", "Wrong", "Skipped", "Invalid", ...subjects],
      d.results.map((r) => [
        r.exam_name, fmtDate(r.published_at), r.score, r.correct, r.wrong, r.skipped, r.invalid,
        ...subjects.map((s) => (r.subjects && s in r.subjects ? r.subjects[s] : "-")),
      ]),
    );
  } catch (e) {
    setStatus(e?.message || "Lookup failed");
  }
}

async function lookupOrg() {
  const org = ui.orgId.value.trim();
  if (!org) { setStatus("Enter an Org ID."); return; }
  hideResults();
  setStatus("loading...");
  try {
    const d = await getJson(`/org/${encodeURIComponent(org)}/exams`);
    setStatus("");
    ui.resultTitle.textContent = `${d.org_name} — Published Exams`;
    ui.statRow.innerHTML = stat("Exams published", d.exams.length);
    renderBars(d.exams.map((e) => ({ label: e.exam_name, value: e.avg_score })));
    ui.statsCard.hidden = false;
    renderTable(
      ["Exam", "Published", "Sheets", "Average score"],
      d.exams.map((e) => [e.exam_name, fmtDate(e.published_at), e.sheet_count, e.avg_score]),
    );
    if (!d.exams.length) setStatus("This organization has not published any exams yet.");
  } catch (e) {
    setStatus(e?.message || "Lookup failed");
  }
}

ui.btnStudent.addEventListener("click", lookupStudent);
ui.btnOrg.addEventListener("click", lookupOrg);

// Shareable links: /portal?org=3F9A2C&roll=42 (roll omitted → org history)
const params = new URLSearchParams(location.search);
if (params.get("org")) {
  ui.orgId.value = params.get("org");
  if (params.get("roll")) {
    ui.rollNo.value = params.get("roll");
    lookupStudent();
  } else {
    lookupOrg();
  }
}
