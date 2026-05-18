/**
 * gantt.js — Gantt timeline rendering
 *
 * Responsible for:
 *   - Computing the timeline date range from all jobs
 *   - Mapping dates ↔ pixel positions
 *   - Rendering the header (week/day ticks)
 *   - Rendering stage blocks per job row
 *
 * Exports:
 *   buildTimeline(jobs, workingDaysMode) → Timeline
 *   dateToX(timeline, date)              → number
 *   xToDate(timeline, x)                → Date
 *   renderTimeline(container, timeline, jobs, workingDaysMode)
 */

export function buildTimeline(jobs, workingDaysMode) {
  throw new Error("buildTimeline not implemented");
}

export function dateToX(timeline, date) {
  throw new Error("dateToX not implemented");
}

export function xToDate(timeline, x) {
  throw new Error("xToDate not implemented");
}

export function renderTimeline(container, timeline, jobs, workingDaysMode) {
  throw new Error("renderTimeline not implemented");
}
