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

// Fields the app may update on each job
const UPDATED_JOB_FIELDS = {
  Priority: (job) => job.priority,
  "Team Priority": (job) => job.teamPriority,
};

// Stage fields the app may update (mapped from the stage object)
const UPDATED_STAGE_FIELDS = {
  "Planned Start": (stage) => stage.plannedStart,
  "Planned End": (stage) => stage.plannedEnd,
  "Actual Start": (stage) => stage.actualStart,
  "Actual End": (stage) => stage.actualEnd,
  Status: (stage) => stage.status,
};

/**
 * Quote a CSV field value if it contains commas, double-quotes, or newlines.
 * @param {string} value
 * @returns {string}
 */
function quoteField(value) {
  const str = value == null ? "" : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Build a row object from a job, merging updated values back into the
 * original CSV row.
 * @param {Object} job
 * @returns {Object}  key → value map matching originalCsvRow's columns
 */
function buildRow(job) {
  // Start from the original CSV row (preserves all unknown columns)
  const row = { ...job.originalCsvRow };

  // Apply updated job-level fields
  for (const [col, getter] of Object.entries(UPDATED_JOB_FIELDS)) {
    if (col in row) {
      row[col] = getter(job) ?? "";
    }
  }

  // Apply updated stage fields
  for (const stage of job.stages) {
    for (const [suffix, getter] of Object.entries(UPDATED_STAGE_FIELDS)) {
      const col = `${stage.name} ${suffix}`;
      if (col in row) {
        row[col] = getter(stage) ?? "";
      }
    }
  }

  return row;
}

/**
 * Serialise an array of jobs to a CSV string.
 * Column order is taken from the first job's originalCsvRow.
 *
 * @param {Array<Object>} jobs
 * @returns {string}
 */
export function exportStageDates(jobs) {
  if (!jobs || jobs.length === 0) return "";

  // Collect the full superset of columns, preserving order from each row
  const seenCols = new Set();
  const allCols = [];
  for (const job of jobs) {
    for (const col of Object.keys(job.originalCsvRow)) {
      if (!seenCols.has(col)) {
        seenCols.add(col);
        allCols.push(col);
      }
    }
  }

  const header = allCols.map(quoteField).join(",");

  const dataRows = jobs.map((job) => {
    const row = buildRow(job);
    return allCols.map((col) => quoteField(row[col] ?? "")).join(",");
  });

  return [header, ...dataRows].join("\n");
}

/**
 * Trigger a CSV file download in the browser.
 * @param {string} csvText
 * @param {string} filename
 */
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
