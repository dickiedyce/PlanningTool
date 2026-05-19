/**
 * gantt.js — Gantt timeline rendering
 *
 * Exports:
 *   buildTimeline(jobs, workingDaysMode) → Timeline
 *   dateToX(timeline, date)             → number
 *   xToDate(timeline, x)               → Date
 *   renderTimeline(headerEl, rowsEl, jobs, workingDaysMode)
 */

import {
  addWorkingDays,
  isWorkingDay,
  nextWorkingDay,
  workingDaysBetween,
} from "./dates.js";

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

/** Stage-start timestamps at 08:00, stage-end timestamps at 17:00 */
function formatStartDate(date) {
  return formatDate(date) + " 08:00";
}
function formatEndDate(date) {
  return formatDate(date) + " 17:00";
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

  // Always start from today; extend end to cover job dates
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  minDate = new Date(today);
  if (!maxDate || maxDate < today) maxDate = new Date(today);

  // Apply calendar-day padding (consistent in both modes).
  // In working-days mode, dateToX will compress weekend days to zero width,
  // but the timeline origin stays fixed so bars don't shift when toggling modes.
  let startDate = subCalendarDays(minDate, PADDING_WD);
  let endDate = addCalendarDays(maxDate, PADDING_WD);

  // Snap startDate/endDate to working days in working-days mode for cleaner display
  if (workingDaysMode) {
    startDate = nextOrSameWorkingDay(startDate);
    endDate = nextOrSameWorkingDay(endDate);
  }

  return { startDate, endDate, dayWidth: DAY_WIDTH, workingDaysMode };
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
  if (timeline.workingDaysMode) {
    // Working-days mode: weekends contribute zero width
    if (date <= timeline.startDate) {
      return -workingDaysBetween(date, timeline.startDate) * timeline.dayWidth;
    }
    return workingDaysBetween(timeline.startDate, date) * timeline.dayWidth;
  }
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
  if (timeline.workingDaysMode) {
    const n = Math.round(x / timeline.dayWidth);
    return addWorkingDays(timeline.startDate, n);
  }
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
export function renderTimeline(
  headerEl,
  rowsEl,
  jobs,
  workingDaysMode,
  onUpdate,
) {
  if (!jobs || jobs.length === 0) {
    headerEl.innerHTML = "";
    return;
  }

  const tl = buildTimeline(jobs, workingDaysMode);

  renderHeader(headerEl, tl);

  // Render stage bars into each .gantt-row cell
  rowsEl.querySelectorAll(".gantt-row[data-job-key]").forEach((cell) => {
    const job = jobs.find((j) => j.jobKey === cell.dataset.jobKey);
    if (job) renderJobBars(cell, job, tl, onUpdate);
  });
}

// ---------------------------------------------------------------------------
// Header rendering
// ---------------------------------------------------------------------------

const DAY_LETTERS = ["Su", "M", "T", "W", "Th", "F", "Sa"];

function renderHeader(headerEl, tl) {
  headerEl.innerHTML = "";

  const totalWidth = dateToX(tl, tl.endDate);
  headerEl.style.position = "relative";
  headerEl.style.width = `${totalWidth}px`;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const cursor = new Date(tl.startDate);
  while (cursor <= tl.endDate) {
    const x = dateToX(tl, cursor);
    const dow = cursor.getDay();
    const isWeekend = dow === 0 || dow === 6;
    const isToday = cursor.getTime() === today.getTime();

    // In working-days mode, skip weekend columns entirely
    if (tl.workingDaysMode && isWeekend) {
      cursor.setDate(cursor.getDate() + 1);
      continue;
    }

    // Weekend background column
    if (isWeekend) {
      const col = document.createElement("div");
      col.className = "gantt-weekend-col";
      col.style.left = `${x}px`;
      col.style.width = `${tl.dayWidth}px`;
      headerEl.appendChild(col);
    }

    // Week date label + week-start marker on Mondays (top of header)
    if (dow === 1) {
      const label = document.createElement("span");
      label.className = "gantt-week-label";
      label.style.left = `${x}px`;
      label.textContent = formatDate(cursor);
      headerEl.appendChild(label);

      const weekLine = document.createElement("div");
      weekLine.className = "gantt-week-start";
      weekLine.style.left = `${x}px`;
      headerEl.appendChild(weekLine);
    }

    // Day-of-week letter (bottom of header) — hide Sa/Su in working-days mode
    if (!isWeekend || !tl.workingDaysMode) {
      const letter = document.createElement("span");
      letter.className = isWeekend
        ? "gantt-day-letter weekend"
        : "gantt-day-letter";
      letter.style.left = `${x}px`;
      letter.textContent = DAY_LETTERS[dow];
      headerEl.appendChild(letter);
    }

    // Day tick
    const tick = document.createElement("div");
    tick.className = isToday ? "gantt-day-tick today" : "gantt-day-tick";
    tick.style.left = `${x}px`;
    headerEl.appendChild(tick);

    cursor.setDate(cursor.getDate() + 1);
  }
}

/** Add weekend-stripe divs and week-start marker lines behind bars. */
function renderWeekendStripes(cell, tl) {
  const cursor = new Date(tl.startDate);
  while (cursor <= tl.endDate) {
    const dow = cursor.getDay();
    const x = dateToX(tl, cursor);

    // Weekend stripes only in calendar mode
    if (!tl.workingDaysMode && (dow === 0 || dow === 6)) {
      const stripe = document.createElement("div");
      stripe.className = "gantt-weekend-stripe";
      stripe.style.left = `${x}px`;
      stripe.style.width = `${tl.dayWidth}px`;
      cell.appendChild(stripe);
    }

    // Week-start blue line on every Monday (always shown)
    if (dow === 1) {
      const line = document.createElement("div");
      line.className = "gantt-week-start";
      line.style.left = `${x}px`;
      cell.appendChild(line);
    }

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
  const isBlocked = stage.status === "Blocked";

  if (aStart && aEnd) {
    return { start: aStart, end: aEnd, type: isBlocked ? "blocked" : "actual" };
  }
  if (aStart) {
    // In-progress: bar extends from actual start to today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = today > aStart ? today : aStart;
    return { start: aStart, end, type: isBlocked ? "blocked" : "inprog" };
  }
  if (pStart && pEnd) {
    const type = isBlocked ? "blocked" : "planned";
    return {
      start: pStart,
      end: pEnd,
      type,
      isOutline: type === "planned" && !!stage.isOutline,
    };
  }
  return null;
}

function renderJobBars(cell, job, tl, onUpdate) {
  cell.innerHTML = "";
  cell.style.position = "relative";
  cell.style.width = `${dateToX(tl, tl.endDate)}px`;

  // Weekend stripes first so they sit behind the bars
  renderWeekendStripes(cell, tl);

  job.stages.forEach((stage, idx) => {
    if (stage.status === "NotApplicable") return;

    const spec = stageBarSpec(stage);
    if (!spec) return;

    const x = dateToX(tl, spec.start);
    // +dayWidth: end is inclusive, so the bar extends through the end day
    const width = Math.max(
      dateToX(tl, spec.end) + tl.dayWidth - x,
      tl.dayWidth,
    );

    const bar = document.createElement("div");
    bar.className = `stage-bar ${spec.type}`;
    bar.style.left = `${x}px`;
    bar.style.width = `${width}px`;
    bar.dataset.stageName = stage.name;

    // Apply colour treatment by bar type
    if (spec.type === "actual") {
      // Solid fill — actual recorded dates
      if (stage.color) bar.style.background = stage.color;
    } else if (spec.type === "inprog") {
      // Light fill, no border — work in progress, bar extends to today
      if (stage.color) bar.style.background = stage.color + "50"; // ~31% opacity
    } else if (spec.type === "planned") {
      // Diagonal cross-hatch + dashed border — planned dates only, no actuals
      if (stage.color) {
        bar.style.background = `repeating-linear-gradient(45deg, ${stage.color}20 0 4px, ${stage.color}40 4px 8px)`;
        bar.style.borderColor = stage.color;
      }
    }
    // blocked type: CSS (.stage-bar.blocked) handles all styling

    // Outline bars override to transparent fill with dashed border
    if (spec.isOutline) {
      bar.classList.add("outline");
      bar.style.background = "transparent";
      if (stage.color) bar.style.borderColor = stage.color;
    }

    // Stage name label (#31)
    const label = document.createElement("span");
    label.className = "bar-label";
    label.textContent = stage.name;
    bar.appendChild(label);

    // Status badge
    const badgeText = {
      Complete: "Done",
      InProgress: "→",
      InReview: "⟳",
      Blocked: "!",
    }[stage.status];
    if (badgeText) {
      const badge = document.createElement("span");
      badge.className = "bar-badge";
      badge.textContent = badgeText;
      bar.appendChild(badge);
    }

    ["left", "right"].forEach((side) => {
      const handle = document.createElement("div");
      handle.className = `resize-handle ${side}`;
      bar.appendChild(handle);
    });

    wireBarInteraction(bar, stage, spec, tl, job, idx, onUpdate);

    // Rich hover tooltip (#27)
    bar.addEventListener("mouseenter", (e) => {
      if (_isDragging) return;
      const tt = getBarTooltip();
      tt.textContent = buildBarTooltip(stage, spec);
      tt.classList.remove("hidden");
      positionTooltip(tt, e);
    });
    bar.addEventListener("mousemove", (e) => {
      if (_isDragging) return;
      positionTooltip(getBarTooltip(), e);
    });
    bar.addEventListener("mouseleave", () => {
      if (_isDragging) return;
      getBarTooltip().classList.add("hidden");
    });

    cell.appendChild(bar);
  });
}

/**
 * Wire pointer-based drag (move) and resize interactions onto a stage bar.
 * Updates stage date fields on drop and calls onUpdate().
 */

// Singleton tooltip shown while dragging or hovering; created lazily once per page load
let _dragTooltip = null;
let _isDragging = false;
function getDragTooltip() {
  if (!_dragTooltip) {
    _dragTooltip = document.createElement("div");
    _dragTooltip.className = "drag-tooltip hidden";
    document.body.appendChild(_dragTooltip);
  }
  return _dragTooltip;
}

function updateDragTooltip(tooltip, name, start, end, cx, cy) {
  tooltip.textContent = `${name}  ·  ${formatDate(start)} → ${formatDate(end)}`;
  tooltip.style.left = `${Math.min(cx + 14, window.innerWidth - tooltip.offsetWidth - 8)}px`;
  tooltip.style.top = `${cy + 20}px`;
}

// Singleton bar-hover tooltip (#27) — rich multi-line, distinct from the drag tooltip
let _barTooltip = null;
function getBarTooltip() {
  if (!_barTooltip) {
    _barTooltip = document.createElement("div");
    _barTooltip.className = "info-tooltip hidden";
    document.body.appendChild(_barTooltip);
  }
  return _barTooltip;
}

function positionTooltip(tt, e) {
  tt.style.left = `${Math.min(e.clientX + 14, window.innerWidth - tt.offsetWidth - 8)}px`;
  tt.style.top = `${e.clientY + 20}px`;
}

function buildBarTooltip(stage, spec) {
  const aStart = stage.actualStart?.slice(0, 10);
  const aEnd = stage.actualEnd?.slice(0, 10);
  const pStart = stage.plannedStart?.slice(0, 10);
  const pEnd = stage.plannedEnd?.slice(0, 10);
  // end is inclusive: wdb counts exclusive of start, so +1 for display
  const dur = workingDaysBetween(spec.start, spec.end) + 1;
  const lines = [
    stage.name,
    `Status:   ${stage.status || "—"}`,
    `Duration: ${dur} working day${dur === 1 ? "" : "s"}`,
    `Actual:   ${aStart ? `${aStart} → ${aEnd || "in progress"}` : "none"}`,
    `Planned:  ${pStart ? `${pStart} → ${pEnd || "?"}` : "none"}`,
  ];
  if ((aStart || aEnd) && (pStart || pEnd))
    lines.push("Source:   actual dates (planned overridden)");
  return lines.join("\n");
}

function wireBarInteraction(bar, stage, spec, tl, job, stageIndex, onUpdate) {
  // Bars whose end date is in the past are read-only
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (spec.end < today) {
    bar.classList.add("bar-past");
    return;
  }

  bar.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation(); // prevent the row's HTML5 drag from firing

    const isLeft = e.target.classList.contains("left");
    const isRight = e.target.classList.contains("right");
    const isMove = !isLeft && !isRight;

    const startX = e.clientX;
    const origLeft = parseFloat(bar.style.left);
    const origWidth = parseFloat(bar.style.width);

    // Left boundary: right edge of the nearest previous visible stage
    let minLeft = 0;
    for (let i = stageIndex - 1; i >= 0; i--) {
      const ps = job.stages[i];
      if (ps.status === "NotApplicable") continue;
      const pSpec = stageBarSpec(ps);
      if (pSpec) {
        // +dayWidth: right edge of previous bar (inclusive-end)
        minLeft = dateToX(tl, pSpec.end) + tl.dayWidth;
        break;
      }
    }

    bar.setPointerCapture(e.pointerId);
    bar.classList.add("dragging");
    _isDragging = true;

    // Show drag tooltip
    const tooltip = getDragTooltip();
    tooltip.classList.remove("hidden");
    updateDragTooltip(
      tooltip,
      stage.name,
      xToDate(tl, origLeft),
      xToDate(tl, origLeft + origWidth),
      e.clientX,
      e.clientY,
    );

    function onMove(me) {
      const dx = me.clientX - startX;
      if (isLeft) {
        const newLeft = Math.max(origLeft + dx, minLeft);
        const newWidth = origLeft + origWidth - newLeft;
        if (newWidth >= tl.dayWidth) {
          bar.style.left = newLeft + "px";
          bar.style.width = newWidth + "px";
        }
      } else if (isRight) {
        bar.style.width = Math.max(origWidth + dx, tl.dayWidth) + "px";
      } else {
        // Move: clamp left edge so we can't overlap the previous stage
        bar.style.left = Math.max(origLeft + dx, minLeft) + "px";
      }

      // Update tooltip with live dates
      const curLeft = parseFloat(bar.style.left);
      const curWidth = parseFloat(bar.style.width);
      updateDragTooltip(
        tooltip,
        stage.name,
        xToDate(tl, curLeft),
        xToDate(tl, curLeft + curWidth),
        me.clientX,
        me.clientY,
      );
    }

    function onUp() {
      bar.removeEventListener("pointermove", onMove);
      bar.classList.remove("dragging");
      _isDragging = false;
      getDragTooltip().classList.add("hidden");

      const finalLeft = parseFloat(bar.style.left);
      const finalWidth = parseFloat(bar.style.width);

      const newStart = xToDate(tl, finalLeft);
      // Subtract one day-slot so the stored end is the LAST day the bar occupies
      // (inclusive-end model: a 1-day bar has start === end)
      const newEnd = xToDate(tl, finalLeft + finalWidth - tl.dayWidth);
      console.log(
        `[onUp] stage[${stageIndex}] "${stage.name}" newStart=${formatDate(newStart)} newEnd=${formatDate(newEnd)} isLeft=${isLeft} isRight=${isRight} isMove=${isMove}`,
      );

      // If this was a phantom outline bar, the user is now giving it real dates
      if (spec.isOutline) {
        stage.isOutline = false;
      }

      // Write back to the stage so export and recalculation see the changes
      if (isLeft || isMove) {
        if (spec.type === "actual" || spec.type === "inprog") {
          stage.actualStart = formatStartDate(newStart);
        } else {
          stage.plannedStart = formatStartDate(newStart);
        }
      }
      if (isRight || isMove) {
        if (spec.type === "actual") {
          stage.actualEnd = formatEndDate(newEnd);
        } else {
          stage.plannedEnd = formatEndDate(newEnd);
        }
      }

      // Pass job + index so the caller can cascade-recalculate later stages
      console.log(`[onUp] calling onUpdate with stageIndex=${stageIndex}`);
      if (onUpdate) onUpdate(job, stageIndex);
    }

    bar.addEventListener("pointermove", onMove);
    bar.addEventListener("pointerup", onUp, { once: true });
  });
}

// ---------------------------------------------------------------------------
// Stage key
// ---------------------------------------------------------------------------

/**
 * Render the stage key legend below the job rows.
 * Each row shows a colour swatch, stage name, editable default duration, and
 * a proportional sample bar. Editing the duration live-updates the template
 * and the sample bar.
 *
 * @param {HTMLElement}        keyEl      The #stage-key element
 * @param {Array<StageTemplate>} templates  Active templates from state
 */
export function renderKey(keyEl, templates) {
  keyEl.innerHTML = "";

  templates.forEach((tpl) => {
    const row = document.createElement("div");
    row.className = "key-row";

    // Left info panel
    const info = document.createElement("div");
    info.className = "key-info";

    const swatch = document.createElement("span");
    swatch.className = "key-swatch";
    swatch.style.background = tpl.color || "var(--clr-stage-planned)";
    info.appendChild(swatch);

    const name = document.createElement("span");
    name.className = "key-name";
    name.textContent = tpl.name;
    info.appendChild(name);

    const dur = document.createElement("input");
    dur.type = "number";
    dur.className = "key-duration";
    dur.min = "1";
    dur.value = String(tpl.defaultDurationDays);
    info.appendChild(dur);

    const lbl = document.createElement("span");
    lbl.className = "key-days-label";
    lbl.textContent = "days";
    info.appendChild(lbl);

    // Right: proportional sample bar
    const ganttCell = document.createElement("div");
    ganttCell.className = "key-gantt";

    const bar = document.createElement("div");
    bar.className = "key-bar";
    bar.style.width = `${tpl.defaultDurationDays * DAY_WIDTH}px`;
    bar.style.background = tpl.color || "var(--clr-stage-actual)";
    bar.title = `${tpl.name} — ${tpl.defaultDurationDays} days default`;
    ganttCell.appendChild(bar);

    // Live-update template + bar width when duration is edited
    dur.addEventListener("input", () => {
      const v = Math.max(1, parseInt(dur.value, 10) || 1);
      tpl.defaultDurationDays = v;
      bar.style.width = `${v * DAY_WIDTH}px`;
      bar.title = `${tpl.name} — ${v} days default`;
    });

    row.appendChild(info);
    row.appendChild(ganttCell);
    keyEl.appendChild(row);
  });
}
