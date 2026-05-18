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
import { addWorkingDays, nextWorkingDay } from "./dates.js";

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
    dropTemplates: document.getElementById("drop-templates"),
    dropDates: document.getElementById("drop-dates"),
    fileInputTemplates: document.getElementById("file-input-templates"),
    fileInputDates: document.getElementById("file-input-dates"),
    btnBrowseTemplates: document.getElementById("btn-browse-templates"),
    btnBrowseDates: document.getElementById("btn-browse-dates"),
    btnCloseUpload: document.getElementById("btn-close-upload"),
    btnLoad: document.getElementById("btn-load"),

    statusTemplates: document.getElementById("status-templates"),
    statusDates: document.getElementById("status-dates"),
    uploadErrors: document.getElementById("upload-errors"),

    workboard: document.getElementById("workboard"),
    jobRows: document.getElementById("job-rows"),
    ganttHeader: document.getElementById("gantt-header"),
    stageKey: document.getElementById("stage-key"),
    btnKey: document.getElementById("btn-key"),
    keyPopover: document.getElementById("key-popover"),
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
    ? `<span class="loaded">${tpl.name}</span>`
    : `<em>not loaded</em>`;

  el.statusDates.innerHTML = dt
    ? `<span class="loaded">${dt.name}</span>`
    : `<em>not loaded</em>`;

  el.btnLoad.disabled = !(tpl && dt);
}

function acceptFile(slot, file) {
  if (!isCSVFile(file)) {
    setUploadError(`"${file.name}" is not a CSV file.`);
    return;
  }
  clearUploadError();
  if (slot === "templates") {
    state._rawTemplates = file;
  } else {
    state._rawDates = file;
  }
  updateFileStatus();
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

    // Generate phantom outline bars for fully unscheduled jobs
    jobs.forEach((job) => fillOutlineSchedule(job));

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

  // Wire each slot independently
  function wireSlot(slot, dropEl, inputEl, browseBtn) {
    browseBtn.addEventListener("click", () => inputEl.click());
    inputEl.addEventListener("change", () => {
      if (inputEl.files[0]) acceptFile(slot, inputEl.files[0]);
      inputEl.value = "";
    });
    dropEl.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropEl.classList.add("drag-over");
    });
    dropEl.addEventListener("dragleave", () =>
      dropEl.classList.remove("drag-over"),
    );
    dropEl.addEventListener("drop", (e) => {
      e.preventDefault();
      dropEl.classList.remove("drag-over");
      const file = e.dataTransfer.files[0];
      if (file) acceptFile(slot, file);
    });
  }

  wireSlot(
    "templates",
    el.dropTemplates,
    el.fileInputTemplates,
    el.btnBrowseTemplates,
  );
  wireSlot("dates", el.dropDates, el.fileInputDates, el.btnBrowseDates);

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

function wireKeyPopover() {
  el.btnKey.addEventListener("click", (e) => {
    e.stopPropagation();
    el.keyPopover.classList.toggle("hidden");
  });

  // Close when clicking anywhere outside the pop-over
  document.addEventListener("click", (e) => {
    if (
      !el.keyPopover.classList.contains("hidden") &&
      !el.keyPopover.contains(e.target) &&
      e.target !== el.btnKey
    ) {
      el.keyPopover.classList.add("hidden");
    }
  });

  // Close on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") el.keyPopover.classList.add("hidden");
  });
}

// ---------------------------------------------------------------------------
// Workboard rendering (skeletal — Gantt detail handled by gantt.js)
// ---------------------------------------------------------------------------

function showWorkboard() {
  el.workboard.classList.remove("hidden");
  el.btnExport.disabled = false;
  el.btnKey.disabled = false;
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

  // Rich info-cell hover tooltip
  wireInfoTooltip(row.querySelector(".col-jobs"), job);

  return row;
}

// ---------------------------------------------------------------------------
// Outline bar generation (item B)
// ---------------------------------------------------------------------------

/** Format a date as "YYYY-MM-DD 08:00" (stage start) */
function fmtOutlineStart(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d} 08:00`;
}

/** Format a date as "YYYY-MM-DD 17:00" (stage end) */
function fmtOutlineEnd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d} 17:00`;
}

/**
 * If a job has no planned dates at all, inject phantom outline dates
 * starting from the Monday of next working week. Marks each stage with
 * isOutline = true so the renderer can style them as dashed bars and
 * the exporter can suppress them.
 *
 * @param {Object} job
 */
function fillOutlineSchedule(job) {
  const hasAnyPlanned = job.stages.some((s) => s.plannedStart && s.plannedEnd);
  if (hasAnyPlanned) return;

  // Monday of next working week
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dod = today.getDay(); // 0=Sun, 1=Mon, …, 6=Sat
  const daysToNextMon = dod === 0 ? 1 : dod === 1 ? 7 : 8 - dod;
  let cursor = new Date(today);
  cursor.setDate(cursor.getDate() + daysToNextMon);

  for (const stage of job.stages) {
    if (stage.status === "NotApplicable") continue;
    const dur = stage.defaultDurationDays ?? 5;
    const end = addWorkingDays(cursor, dur);
    stage.plannedStart = fmtOutlineStart(cursor);
    stage.plannedEnd = fmtOutlineEnd(end);
    stage.isOutline = true;
    cursor = nextWorkingDay(end);
  }
}

// ---------------------------------------------------------------------------
// Info-cell hover tooltip
// ---------------------------------------------------------------------------

let _infoTooltip = null;
function getInfoTooltip() {
  if (!_infoTooltip) {
    _infoTooltip = document.createElement("div");
    _infoTooltip.className = "info-tooltip hidden";
    document.body.appendChild(_infoTooltip);
  }
  return _infoTooltip;
}

function jobDateSummary(job) {
  const planned = { start: null, end: null };
  const actual = { start: null, end: null };
  for (const stage of job.stages) {
    const ps = stage.plannedStart?.slice(0, 10);
    const pe = stage.plannedEnd?.slice(0, 10);
    const as = stage.actualStart?.slice(0, 10);
    const ae = stage.actualEnd?.slice(0, 10);
    if (ps && (!planned.start || ps < planned.start)) planned.start = ps;
    if (pe && (!planned.end || pe > planned.end)) planned.end = pe;
    if (as && (!actual.start || as < actual.start)) actual.start = as;
    if (ae && (!actual.end || ae > actual.end)) actual.end = ae;
  }
  return { planned, actual };
}

function wireInfoTooltip(cell, job) {
  function show(e) {
    const { planned, actual } = jobDateSummary(job);
    const lines = [
      `${job.jobKey}  —  ${job.jobName}`,
      `Client:     ${job.client || "—"}`,
      `Initiative: ${job.initiative || "—"}`,
      `Priority:   ${job.priority || "—"}   Team: ${job.teamPriority || "—"}`,
    ];
    if (planned.start || planned.end)
      lines.push(`Planned: ${planned.start || "?"} → ${planned.end || "?"}`);
    if (actual.start || actual.end)
      lines.push(
        `Actual:  ${actual.start || "?"} → ${actual.end || "in progress"}`,
      );
    const tt = getInfoTooltip();
    tt.textContent = lines.join("\n");
    tt.classList.remove("hidden");
    position(tt, e);
  }
  function move(e) {
    const tt = getInfoTooltip();
    if (!tt.classList.contains("hidden")) position(tt, e);
  }
  function position(tt, e) {
    tt.style.left = `${Math.min(e.clientX + 14, window.innerWidth - tt.offsetWidth - 8)}px`;
    tt.style.top = `${e.clientY + 20}px`;
  }
  cell.addEventListener("mouseenter", show);
  cell.addEventListener("mousemove", move);
  cell.addEventListener("mouseleave", () =>
    getInfoTooltip().classList.add("hidden"),
  );
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

    // If a named sort is currently active, freeze the displayed order as
    // the manual order before switching, so the drag result is predictable.
    if (el.sortSelect.value !== "") {
      sortedJobs().forEach((j, i) => {
        j.rowOrder = i;
      });
      el.sortSelect.value = "";
    }

    // Reorder within the committed manual order
    const ordered = [...state.jobs].sort((a, b) => a.rowOrder - b.rowOrder);
    const arr = ordered.filter((j) => j.jobKey !== dragSrcKey);
    const tgtIdx = arr.findIndex((j) => j.jobKey === job.jobKey);
    arr.splice(tgtIdx, 0, srcJob);

    arr.forEach((j, i) => {
      j.rowOrder = i;
    });
    state.jobs = arr;
    state.dirty = true;

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
  wireKeyPopover();

  // Show the upload pop-over immediately on first load
  openUpload();
});
