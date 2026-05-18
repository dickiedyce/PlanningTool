/**
 * gantt.js — Gantt timeline rendering
 *
 * Exports:
 *   buildTimeline(jobs, workingDaysMode) → Timeline
 *   dateToX(timeline, date)             → number
 *   xToDate(timeline, x)               → Date
 *   renderTimeline(headerEl, rowsEl, jobs, workingDaysMode)
 */

import { addWorkingDays, isWorkingDay, nextWorkingDay } from "./dates.js";

// Pixels per calendar day — matches CSS --gantt-day-w
const DAY_WIDTH = 28;
// Working-day padding added before the earliest date and after the latest
const PADDING_WD = 5;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Parse "YYYY-MM-DD" or "YYYY-MM-DD HH:mm" → local-midnight Date, or null */
function parseDate(str) {
  if (!str) return null;
  const [y, m, d] = str.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Local-midnight Date → "YYYY-MM-DD" */
function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Subtract n calendar days from date, returning a new Date */
function subCalendarDays(date, n) {
  const r = new Date(date);
  r.setDate(r.getDate() - n);
  return r;
}

/** Add n calendar days to date, returning a new Date */
function addCalendarDays(date, n) {
  const r = new Date(date);
  r.setDate(r.getDate() + n);
  return r;
}

/** Snap backward to the nearest working day (or same day if already one) */
function prevOrSameWorkingDay(date) {
  const r = new Date(date);
  while (!isWorkingDay(r)) r.setDate(r.getDate() - 1);
  return r;
}

/** Snap forward to the nearest working day (or same day if already one) */
function nextOrSameWorkingDay(date) {
  const r = new Date(date);
  while (!isWorkingDay(r)) r.setDate(r.getDate() + 1);
  return r;
}

// ---------------------------------------------------------------------------
// buildTimeline
// ---------------------------------------------------------------------------

/**
 * Compute the timeline's date range from all job stages.
 * Adds PADDING_WD working-day padding on each side.
 *
 * @param {Array}   jobs
 * @param {boolean} workingDaysMode
 * @returns {{ startDate: Date, endDate: Date, dayWidth: number }}
 */
export function buildTimeline(jobs, workingDaysMode) {
  let minDate = null;
  let maxDate = null;

  for (const job of jobs) {
    for (const stage of job.stages) {
      const dates = [
        parseDate(stage.actualStart),
        parseDate(stage.actualEnd),
        parseDate(stage.plannedStart),
        parseDate(stage.plannedEnd),
      ].filter(Boolean);

      for (const dt of dates) {
        if (!minDate || dt < minDate) minDate = dt;
        if (!maxDate || dt > maxDate) maxDate = dt;
      }
    }
  }

  // Always include today so the current date is always visible
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (!minDate || today < minDate) minDate = new Date(today);
  if (!maxDate || today > maxDate) maxDate = new Date(today);

  // Apply working-day padding
  let startDate, endDate;
  if (workingDaysMode) {
    // Walk back PADDING_WD working days from minDate
    startDate = new Date(minDate);
    for (let i = 0; i < PADDING_WD; ) {
      startDate.setDate(startDate.getDate() - 1);
      if (isWorkingDay(startDate)) i++;
    }
    startDate = nextOrSameWorkingDay(startDate);

    endDate = new Date(maxDate);
    for (let i = 0; i < PADDING_WD; ) {
      endDate.setDate(endDate.getDate() + 1);
      if (isWorkingDay(endDate)) i++;
    }
    endDate = nextOrSameWorkingDay(endDate);
  } else {
    startDate = subCalendarDays(minDate, PADDING_WD);
    endDate = addCalendarDays(maxDate, PADDING_WD);
  }

  return { startDate, endDate, dayWidth: DAY_WIDTH };
}

// ---------------------------------------------------------------------------
// dateToX / xToDate
// ---------------------------------------------------------------------------

/**
 * Convert a Date to a pixel x-offset from the timeline's left edge.
 * Uses calendar days (the pixel ruler is always calendar-based).
 *
 * @param {{ startDate: Date, dayWidth: number }} timeline
 * @param {Date} date
 * @returns {number}
 */
export function dateToX(timeline, date) {
  const msPerDay = 24 * 60 * 60 * 1000;
  const calDays = (date - timeline.startDate) / msPerDay;
  return calDays * timeline.dayWidth;
}

/**
 * Convert a pixel x-offset to a Date (inverse of dateToX).
 *
 * @param {{ startDate: Date, dayWidth: number }} timeline
 * @param {number} x
 * @returns {Date}
 */
export function xToDate(timeline, x) {
  const calDays = Math.round(x / timeline.dayWidth);
  return addCalendarDays(timeline.startDate, calDays);
}

// ---------------------------------------------------------------------------
// renderTimeline
// ---------------------------------------------------------------------------

/**
 * Render the Gantt timeline header and stage bars for every job row.
 *
 * @param {HTMLElement} headerEl      The #gantt-header element
 * @param {HTMLElement} rowsEl        The #job-rows element (contains .gantt-row cells)
 * @param {Array}       jobs
 * @param {boolean}     workingDaysMode
 */
export function renderTimeline(headerEl, rowsEl, jobs, workingDaysMode) {
  if (!jobs || jobs.length === 0) {
    headerEl.innerHTML = "";
    return;
  }

  const tl = buildTimeline(jobs, workingDaysMode);

  renderHeader(headerEl, tl);

  // Render stage bars into each .gantt-row cell
  rowsEl.querySelectorAll(".gantt-row[data-job-key]").forEach((cell) => {
    const job = jobs.find((j) => j.jobKey === cell.dataset.jobKey);
    if (job) renderJobBars(cell, job, tl);
  });
}

// ---------------------------------------------------------------------------
// Header rendering
// ---------------------------------------------------------------------------

function renderHeader(headerEl, tl) {
  headerEl.innerHTML = "";

  const totalWidth = dateToX(tl, tl.endDate);
  headerEl.style.position = "relative";
  headerEl.style.width = `${totalWidth}px`;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Walk calendar days and render ticks + week labels
  const cursor = new Date(tl.startDate);
  while (cursor <= tl.endDate) {
    const x = dateToX(tl, cursor);

    // Week label on Mondays
    if (cursor.getDay() === 1) {
      const label = document.createElement("span");
      label.className = "gantt-week-label";
      label.style.left = `${x}px`;
      label.textContent = formatDate(cursor);
      headerEl.appendChild(label);
    }

    // Day tick
    const tick = document.createElement("div");
    const isToday = cursor.getTime() === today.getTime();
    tick.className = isToday ? "gantt-day-tick today" : "gantt-day-tick";
    tick.style.left = `${x}px`;
    headerEl.appendChild(tick);

    cursor.setDate(cursor.getDate() + 1);
  }
}

// ---------------------------------------------------------------------------
// Stage bar rendering
// ---------------------------------------------------------------------------

/**
 * Determine the effective start and end dates for a stage bar.
 * Returns null if the stage has no usable dates.
 *
 * @param {Object}  stage
 * @returns {{ start: Date, end: Date, type: 'actual'|'inprog'|'planned' } | null}
 */
function stageBarSpec(stage) {
  const aStart = parseDate(stage.actualStart);
  const aEnd = parseDate(stage.actualEnd);
  const pStart = parseDate(stage.plannedStart);
  const pEnd = parseDate(stage.plannedEnd);

  if (aStart && aEnd) {
    return { start: aStart, end: aEnd, type: "actual" };
  }
  if (aStart) {
    // InProgress: starts at actual start, ends at planned end or fallback
    const end = pEnd ?? aStart;
    return { start: aStart, end, type: "inprog" };
  }
  if (pStart && pEnd) {
    return { start: pStart, end: pEnd, type: "planned" };
  }
  return null;
}

function renderJobBars(cell, job, tl) {
  cell.innerHTML = "";
  cell.style.position = "relative";
  cell.style.width = `${dateToX(tl, tl.endDate)}px`;

  for (const stage of job.stages) {
    if (stage.status === "NotApplicable") continue;

    const spec = stageBarSpec(stage);
    if (!spec) continue;

    const x = dateToX(tl, spec.start);
    const width = Math.max(dateToX(tl, spec.end) - x, tl.dayWidth); // min 1 day wide

    const bar = document.createElement("div");
    bar.className = `stage-bar ${spec.type}`;
    bar.style.left = `${x}px`;
    bar.style.width = `${width}px`;
    bar.title = `${stage.name}\n${formatDate(spec.start)} → ${formatDate(spec.end)}`;
    bar.dataset.stageName = stage.name;

    // Resize handles
    ["left", "right"].forEach((side) => {
      const handle = document.createElement("div");
      handle.className = `resize-handle ${side}`;
      bar.appendChild(handle);
    });

    cell.appendChild(bar);
  }
}
