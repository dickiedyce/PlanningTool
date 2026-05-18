/**
 * app.js — Entry point
 *
 * Wires together the upload pop-over, workboard, Gantt, sorting,
 * drag-and-drop, and export button.
 */

import { parseTemplates, parseStageDates } from "./csv.js";
import { renderTimeline, renderKey } from "./gantt.js";
import { recalculateFromStage } from "./scheduler.js";
import { exportStageDates, triggerDownload } from "./export.js";

// ---------------------------------------------------------------------------
// Application state
// ---------------------------------------------------------------------------

const state = {
  templates: null, // Array<StageTemplate>
  jobs: null, // Array<Job>
  workingDaysMode: true,
  dirty: false,
  _rawTemplates: null, // raw File object
  _rawDates: null, // raw File object
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEMPLATES_FILENAME = "workboard_stage_templates.csv";
const DATES_FILENAME = "workboard_stage_dates.csv";

function readFileText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsText(file);
  });
}

function isCSVFile(file) {
  return (
    file.name.toLowerCase().endsWith(".csv") ||
    file.type === "text/csv" ||
    file.type === "application/vnd.ms-excel"
  );
}

// ---------------------------------------------------------------------------
// DOM references (resolved after DOMContentLoaded)
// ---------------------------------------------------------------------------

let el = {};

function resolveElements() {
  el = {
    btnUpload: document.getElementById("btn-upload"),
    btnExport: document.getElementById("btn-export"),
    toggleWD: document.getElementById("toggle-working-days"),
    sortSelect: document.getElementById("sort-select"),

    overlay: document.getElementById("upload-overlay"),
    dropZone: document.getElementById("drop-zone"),
    fileInput: document.getElementById("file-input"),
    btnBrowse: document.getElementById("btn-browse"),
    btnCloseUpload: document.getElementById("btn-close-upload"),
    btnLoad: document.getElementById("btn-load"),

    statusTemplates: document.getElementById("status-templates"),
    statusDates: document.getElementById("status-dates"),
    uploadErrors: document.getElementById("upload-errors"),

    workboard: document.getElementById("workboard"),
    jobRows: document.getElementById("job-rows"),
    ganttHeader: document.getElementById("gantt-header"),
    stageKey: document.getElementById("stage-key"),
  };
}

// ---------------------------------------------------------------------------
// Upload pop-over
// ---------------------------------------------------------------------------

function openUpload() {
  el.overlay.classList.remove("hidden");
}

function closeUpload() {
  el.overlay.classList.add("hidden");
}

function setUploadError(msg) {
  el.uploadErrors.textContent = msg;
}

function clearUploadError() {
  el.uploadErrors.textContent = "";
}

function updateFileStatus() {
  const tpl = state._rawTemplates;
  const dt = state._rawDates;

  el.statusTemplates.innerHTML = tpl
    ? `<strong>${TEMPLATES_FILENAME}</strong> — <span class="loaded">loaded</span>`
    : `${TEMPLATES_FILENAME} — <em>not loaded</em>`;

  el.statusDates.innerHTML = dt
    ? `<strong>${DATES_FILENAME}</strong> — <span class="loaded">loaded</span>`
    : `${DATES_FILENAME} — <em>not loaded</em>`;

  el.btnLoad.disabled = !(tpl && dt);
}

function classifyFile(file) {
  if (!isCSVFile(file)) {
    setUploadError(`"${file.name}" is not a CSV file.`);
    return;
  }
  const name = file.name.toLowerCase();
  if (name === TEMPLATES_FILENAME) {
    state._rawTemplates = file;
  } else if (name === DATES_FILENAME) {
    state._rawDates = file;
  } else {
    setUploadError(
      `Unrecognised file: "${file.name}". Expected "${TEMPLATES_FILENAME}" or "${DATES_FILENAME}".`,
    );
    return;
  }
  clearUploadError();
  updateFileStatus();
}

function handleDroppedFiles(files) {
  for (const file of files) classifyFile(file);
}

async function loadPlanner() {
  clearUploadError();
  try {
    const [tplText, datesText] = await Promise.all([
      readFileText(state._rawTemplates),
      readFileText(state._rawDates),
    ]);

    const templates = parseTemplates(tplText);
    const jobs = parseStageDates(datesText, templates);

    state.templates = templates;
    state.jobs = jobs;
    state.dirty = false;

    closeUpload();
    showWorkboard();
  } catch (err) {
    setUploadError(err.message);
  }
}

function wireUploadPopover() {
  el.btnUpload.addEventListener("click", openUpload);
  el.btnCloseUpload.addEventListener("click", closeUpload);

  // Close on backdrop click
  el.overlay.addEventListener("click", (e) => {
    if (e.target === el.overlay) closeUpload();
  });

  // Close on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !el.overlay.classList.contains("hidden"))
      closeUpload();
  });

  // File input via Browse button
  el.btnBrowse.addEventListener("click", () => el.fileInput.click());
  el.fileInput.addEventListener("change", () => {
    handleDroppedFiles(el.fileInput.files);
    el.fileInput.value = ""; // reset so same file can be re-selected
  });

  // Drag and drop
  el.dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    el.dropZone.classList.add("drag-over");
  });

  el.dropZone.addEventListener("dragleave", () => {
    el.dropZone.classList.remove("drag-over");
  });

  el.dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    el.dropZone.classList.remove("drag-over");
    handleDroppedFiles(e.dataTransfer.files);
  });

  el.btnLoad.addEventListener("click", loadPlanner);

  // Initialise status display
  updateFileStatus();
}

// ---------------------------------------------------------------------------
// Working-days toggle
// ---------------------------------------------------------------------------

function wireWorkingDaysToggle() {
  el.toggleWD.checked = state.workingDaysMode;
  el.toggleWD.addEventListener("change", () => {
    state.workingDaysMode = el.toggleWD.checked;
    if (state.jobs) renderWorkboard();
  });
}

// ---------------------------------------------------------------------------
// Sort
// ---------------------------------------------------------------------------

const PRIORITY_ORDER = { High: 0, Medium: 1, Low: 2 };

function priorityRank(p) {
  return PRIORITY_ORDER[p] ?? 3;
}

function sortedJobs() {
  if (!state.jobs) return [];
  const key = el.sortSelect.value;
  if (!key) return [...state.jobs].sort((a, b) => a.rowOrder - b.rowOrder);

  return [...state.jobs].sort((a, b) => {
    if (key === "priority")
      return priorityRank(a.priority) - priorityRank(b.priority);
    if (key === "teamPriority")
      return priorityRank(a.teamPriority) - priorityRank(b.teamPriority);

    const va = a[key] ?? "";
    const vb = b[key] ?? "";
    return va.localeCompare(vb);
  });
}

function wireSortControls() {
  el.sortSelect.addEventListener("change", () => {
    if (state.jobs) renderWorkboard();
  });
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

function wireExportButton() {
  el.btnExport.addEventListener("click", () => {
    if (!state.jobs) return;
    const csv = exportStageDates(state.jobs);
    triggerDownload(csv, "workboard_stage_dates_updated.csv");
    state.dirty = false;
  });
}

// ---------------------------------------------------------------------------
// Workboard rendering (skeletal — Gantt detail handled by gantt.js)
// ---------------------------------------------------------------------------

function showWorkboard() {
  el.workboard.classList.remove("hidden");
  el.btnExport.disabled = false;
  renderKey(el.stageKey, state.templates);
  renderWorkboard();
}

function renderWorkboard() {
  renderJobRows(sortedJobs());
  renderTimeline(
    el.ganttHeader,
    el.jobRows,
    state.jobs,
    state.workingDaysMode,
    onGanttUpdate,
  );
}

function onGanttUpdate(job, stageIndex) {
  state.dirty = true;
  // Cascade-recalculate all subsequent stages after the one that was dragged
  if (job != null && stageIndex != null && stageIndex + 1 < job.stages.length) {
    const updated = recalculateFromStage(
      job,
      stageIndex + 1,
      state.workingDaysMode,
    );
    job.stages = updated.stages; // update stages in-place on the state.jobs entry
  }
  // Re-render bars (rows already in DOM)
  renderTimeline(
    el.ganttHeader,
    el.jobRows,
    state.jobs,
    state.workingDaysMode,
    onGanttUpdate,
  );
}

function renderJobRows(jobs) {
  el.jobRows.innerHTML = "";
  jobs.forEach((job) => {
    const row = buildJobRow(job);
    el.jobRows.appendChild(row);
  });
}

function buildJobRow(job) {
  const row = document.createElement("div");
  row.className = "job-row";
  row.dataset.jobKey = job.jobKey;

  row.innerHTML = `
    <div class="col-jobs">
      <span class="col col-drag drag-handle" title="Drag to reorder">&#9776;</span>
      <span class="col col-job-key"    title="${esc(job.jobKey)}">${esc(job.jobKey)}</span>
      <span class="col col-job-name"   title="${esc(job.jobName)}">${esc(job.jobName)}</span>
      <span class="col col-client"     title="${esc(job.client)}">${esc(job.client)}</span>
      <span class="col col-initiative" title="${esc(job.initiative)}">${esc(job.initiative)}</span>
      <span class="col col-priority">
        <select class="priority-select" data-field="priority">
          ${priorityOptions(job.priority)}
        </select>
      </span>
      <span class="col col-team-priority">
        <select class="priority-select" data-field="teamPriority">
          ${priorityOptions(job.teamPriority)}
        </select>
      </span>
    </div>
    <div class="col-gantt gantt-row" data-job-key="${esc(job.jobKey)}"></div>
  `;

  // Priority dropdowns
  row.querySelectorAll("select.priority-select").forEach((sel) => {
    sel.addEventListener("change", () => {
      job[sel.dataset.field] = sel.value;
      state.dirty = true;
    });
  });

  // Row drag-and-drop
  wireRowDrag(row, job);

  return row;
}

/** Escape HTML entities to prevent XSS from CSV data */
function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function priorityOptions(selected) {
  return [
    { v: "High", l: "H" },
    { v: "Medium", l: "M" },
    { v: "Low", l: "L" },
    { v: "", l: "—" },
  ]
    .map(
      ({ v, l }) =>
        `<option value="${v}"${v === selected ? " selected" : ""}>${l}</option>`,
    )
    .join("");
}

// ---------------------------------------------------------------------------
// Row drag-and-drop
// ---------------------------------------------------------------------------

let dragSrcKey = null;

function wireRowDrag(row, job) {
  row.setAttribute("draggable", "true");

  row.addEventListener("dragstart", (e) => {
    if (!e.target.closest(".drag-handle")) {
      e.preventDefault();
      return;
    }
    dragSrcKey = job.jobKey;
    row.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
  });

  row.addEventListener("dragend", () => {
    dragSrcKey = null;
    row.classList.remove("dragging");
    document
      .querySelectorAll(".job-row")
      .forEach((r) => r.classList.remove("drag-target"));
  });

  row.addEventListener("dragover", (e) => {
    if (dragSrcKey && dragSrcKey !== job.jobKey) {
      e.preventDefault();
      document
        .querySelectorAll(".job-row")
        .forEach((r) => r.classList.remove("drag-target"));
      row.classList.add("drag-target");
    }
  });

  row.addEventListener("drop", (e) => {
    e.preventDefault();
    if (!dragSrcKey || dragSrcKey === job.jobKey) return;

    const srcJob = state.jobs.find((j) => j.jobKey === dragSrcKey);
    if (!srcJob) return;

    // Move srcJob to just before the drop target
    const arr = state.jobs.filter((j) => j.jobKey !== dragSrcKey);
    const tgtIdx = arr.findIndex((j) => j.jobKey === job.jobKey);
    arr.splice(tgtIdx, 0, srcJob);

    arr.forEach((j, i) => {
      j.rowOrder = i;
    });
    state.jobs = arr;
    state.dirty = true;

    el.sortSelect.value = "";
    renderWorkboard();
  });
}

// ---------------------------------------------------------------------------
// Warn on unsaved changes
// ---------------------------------------------------------------------------

window.addEventListener("beforeunload", (e) => {
  if (state.dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  resolveElements();
  wireUploadPopover();
  wireWorkingDaysToggle();
  wireSortControls();
  wireExportButton();

  // Show the upload pop-over immediately on first load
  openUpload();
});
