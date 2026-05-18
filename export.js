/**
 * export.js — CSV export
 *
 * Serialises the in-memory job list back to workboard_stage_dates CSV format,
 * preserving original columns and ordering.
 *
 * Exports:
 *   exportStageDates(jobs) → string   (CSV text)
 *   triggerDownload(csvText, filename)
 */

export function exportStageDates(jobs) {
  throw new Error("exportStageDates not implemented");
}

export function triggerDownload(csvText, filename) {
  const blob = new Blob([csvText], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), {
    href: url,
    download: filename,
  });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
