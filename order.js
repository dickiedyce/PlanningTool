/**
 * order.js — Pure row-reordering logic
 *
 * Exports:
 *   reorderJobs(jobs, srcKey, tgtKey) → Array<Job>
 */

/**
 * Return a new array of jobs with the job identified by `srcKey` repositioned
 * relative to the job identified by `tgtKey`.
 *
 * - Moving **up** (source was below target): source is inserted before target.
 * - Moving **down** (source was above target): source is inserted after target.
 *
 * The input array must already be in the desired visual order (e.g. sorted by
 * rowOrder before being passed in).  Objects are not cloned; the returned
 * array contains the same job references in a new order.
 *
 * @param {Array}  jobs   Ordered array of job objects (each has a `jobKey`)
 * @param {string} srcKey jobKey of the job being dragged
 * @param {string} tgtKey jobKey of the drop-target row
 * @returns {Array} New array in updated order
 */
export function reorderJobs(jobs, srcKey, tgtKey) {
  if (srcKey === tgtKey) return [...jobs];

  const srcIdx = jobs.findIndex((j) => j.jobKey === srcKey);
  const tgtIdx = jobs.findIndex((j) => j.jobKey === tgtKey);
  if (srcIdx === -1 || tgtIdx === -1) return [...jobs];

  const arr = jobs.filter((j) => j.jobKey !== srcKey);
  const newTgtIdx = arr.findIndex((j) => j.jobKey === tgtKey);

  // Moving down (source was above target): insert after target.
  // Moving up (source was below target): insert before target.
  const insertAt = srcIdx < tgtIdx ? newTgtIdx + 1 : newTgtIdx;
  arr.splice(insertAt, 0, jobs[srcIdx]);
  return arr;
}
