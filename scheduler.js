/**
 * scheduler.js — Stage recalculation logic
 *
 * Recalculates planned dates for all not-complete subsequent stages
 * after a user edit, honouring the stage template sequence.
 *
 * Exports:
 *   recalculateFromStage(job, stageIndex, workingDaysMode) → Job
 */

import { addWorkingDays, nextWorkingDay, workingDaysBetween } from "./dates.js";

// ISO date string → local-midnight Date
function parseDate(str) {
  if (!str) return null;
  // Accept "YYYY-MM-DD" or "YYYY-MM-DD HH:mm" — take date part only
  const [y, m, d] = str.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Local-midnight Date → "YYYY-MM-DD"
function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Stage-start timestamps at 08:00, stage-end timestamps at 17:00
function formatStartDate(date) {
  return formatDate(date) + " 08:00";
}
function formatEndDate(date) {
  return formatDate(date) + " 17:00";
}

/**
 * Add `n` days to `date`, using either working-day or calendar-day arithmetic.
 * @param {Date}    date
 * @param {number}  n
 * @param {boolean} workingDaysMode
 * @returns {Date}
 */
function addDays(date, n, workingDaysMode) {
  if (workingDaysMode) return addWorkingDays(date, n);
  const result = new Date(date);
  result.setDate(result.getDate() + n);
  return result;
}

/**
 * Return the day after `date`, skipping weekends in working-days mode.
 * @param {Date}    date
 * @param {boolean} workingDaysMode
 * @returns {Date}
 */
function dayAfter(date, workingDaysMode) {
  if (workingDaysMode) return nextWorkingDay(date);
  const result = new Date(date);
  result.setDate(result.getDate() + 1);
  return result;
}

/**
 * Recalculate planned dates for all stages at and after `stageIndex`.
 *
 * Rules:
 *  - Stages before `stageIndex` are left untouched.
 *  - Complete stages (actualStart + actualEnd both set) keep their actual
 *    dates; their actualEnd is used as the base for the next stage.
 *  - NotApplicable stages are skipped (contribute no duration).
 *  - All other stages get new plannedStart / plannedEnd values.
 *
 * The pivot stage's plannedStart is taken from the existing value on the
 * job (the caller is responsible for setting it before calling this).
 *
 * @param {Object}  job              Job as returned by parseStageDates()
 * @param {number}  stageIndex       Index of the first stage to recalculate
 * @param {boolean} workingDaysMode
 * @returns {Object} New job object (original is not mutated)
 */
export function recalculateFromStage(job, stageIndex, workingDaysMode) {
  console.log(
    `[recalc] START stageIndex=${stageIndex} workingDaysMode=${workingDaysMode}`,
  );
  // Deep-clone stages so we don't mutate the original
  const stages = job.stages.map((s) => ({ ...s }));

  // Determine the baseline end-date from the stage just before the pivot
  let baseEnd = null;
  if (stageIndex > 0) {
    const prev = stages[stageIndex - 1];
    const isComplete =
      prev.status === "Complete" && prev.actualStart && prev.actualEnd;
    baseEnd = parseDate(isComplete ? prev.actualEnd : prev.plannedEnd);
    console.log(
      `[recalc] baseEnd from stage[${stageIndex - 1}] "${prev.name}" = ${baseEnd?.toDateString()} (isComplete=${isComplete})`,
    );
  }

  for (let i = stageIndex; i < stages.length; i++) {
    const stage = stages[i];

    if (stage.status === "NotApplicable") {
      // Skip: contribute no duration, pass baseEnd through unchanged
      continue;
    }

    if (stage.status === "Complete" && stage.actualStart && stage.actualEnd) {
      // Preserve complete stages; use their actualEnd as new base
      baseEnd = parseDate(stage.actualEnd);
      continue;
    }

    // Compute plannedStart — push only when the stage overlaps baseEnd; preserve gaps
    const existingStart = parseDate(stage.plannedStart);
    const earliest = baseEnd ? dayAfter(baseEnd, workingDaysMode) : null;
    console.log(
      `[recalc] stage[${i}] "${stage.name}" existingStart=${existingStart?.toDateString()} earliest=${earliest?.toDateString()}`,
    );
    let start;
    if (earliest && (!existingStart || existingStart <= baseEnd)) {
      // Stage overlaps the previous stage's end — push it forward
      start = earliest;
      console.log(`[recalc] stage[${i}] PUSHED to ${start.toDateString()}`);
    } else {
      // No overlap, or no base — preserve the existing start (fall back to now if none)
      start = existingStart ?? new Date();
      console.log(`[recalc] stage[${i}] PRESERVED at ${start.toDateString()}`);
    }

    // Preserve the currently allocated duration rather than the template default
    const currentStart = parseDate(stage.plannedStart);
    const currentEnd = parseDate(stage.plannedEnd);
    let durationDays;
    if (currentStart && currentEnd) {
      durationDays = workingDaysMode
        ? workingDaysBetween(currentStart, currentEnd)
        : Math.round((currentEnd - currentStart) / (24 * 60 * 60 * 1000));
    } else {
      durationDays = stage.defaultDurationDays;
    }

    const end = addDays(start, durationDays, workingDaysMode);
    console.log(
      `[recalc] stage[${i}] "${stage.name}" duration=${durationDays} start=${start.toDateString()} end=${end.toDateString()}`,
    );

    stage.plannedStart = formatStartDate(start);
    stage.plannedEnd = formatEndDate(end);
    stage.isOutline = false; // stage is now scheduled by real recalculation
    baseEnd = end;
  }

  return { ...job, stages };
}
