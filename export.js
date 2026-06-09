/**
 * export.js — CSV export
 *
 * Serialises the in-memory job list back to workboard_stage_dates CSV format,
 * matching the current template structure so that an export can be re-imported
 * as-is (round-trip).
 *
 * Exports:
 *   exportStageDates(jobs, templates) → string   (CSV text)
 *   triggerDownload(csvText, filename)
 */

// Canonical core columns (always present, in this order)
const CORE_COLS = [
  "JobKey",
  "Job Name",
  "Client",
  "Initiative",
  "Priority",
  "Team Priority",
  "Architect",
  "Developer",
  "Tester",
];

// Fields the app may update on each job
const UPDATED_JOB_FIELDS = {
  Priority: (job) => job.priority,
  "Team Priority": (job) => job.teamPriority,
  Architect: (job) => job.architect,
  Developer: (job) => job.developer,
  Tester: (job) => job.tester,
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
 * Quote a CSV field value — always wraps in double-quotes to match the
 * import format (RFC 4180).
 * @param {string} value
 * @returns {string}
 */
function quoteField(value) {
  const str = value == null ? "" : String(value);
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Build a row object from a job, merging updated values back into the
 * original CSV row and ensuring all expected columns are present.
 * @param {Object} job
 * @param {Array}  templates  Active stage templates
 * @returns {Object}  key → value map
 */
function buildRow(job, templates) {
  // Start from the original CSV row (preserves all unknown columns)
  const row = { ...job.originalCsvRow };

  // Apply updated job-level fields — always write them so round-tripping works
  // even when the original CSV was missing the columns (e.g. Architect/Developer/Tester)
  for (const [col, getter] of Object.entries(UPDATED_JOB_FIELDS)) {
    row[col] = getter(job) ?? "";
  }

  // Apply updated stage fields
  for (const stage of job.stages) {
    for (const [suffix, getter] of Object.entries(UPDATED_STAGE_FIELDS)) {
      const col = `${stage.name} ${suffix}`;
      // Outline stages have phantom planned dates — never export them
      if (
        stage.isOutline &&
        (suffix === "Planned Start" || suffix === "Planned End")
      ) {
        row[col] = "";
      } else {
        row[col] = getter(stage) ?? "";
      }
    }
  }

  // Ensure every template stage column exists (even if the job has no data)
  for (const tmpl of templates) {
    for (const suffix of EXPORT_STAGE_SUFFIXES) {
      const col = `${tmpl.name} ${suffix}`;
      if (!(col in row)) {
        row[col] = "";
      }
    }
  }

  return row;
}

/**
 * Stage suffixes exported per stage.
 * (Named differently from csv.js's STAGE_SUFFIXES to avoid a const collision
 *  when build.js inlines both files into a single script.)
 * @type {string[]}
 */
const EXPORT_STAGE_SUFFIXES = [
  "Status",
  "Actual Start",
  "Actual End",
  "Planned Start",
  "Planned End",
];

/**
 * Serialise an array of jobs to a CSV string.
 * Column order is built from the current template structure so that the
 * exported CSV can be re-imported as-is.
 *
 * @param {Array<Object>} jobs
 * @param {Array}         templates  Active stage templates from parseTemplates()
 * @returns {string}
 */
export function exportStageDates(jobs, templates) {
  if (!jobs || jobs.length === 0) return "";

  // Build the canonical column list: core fields, then template stage columns
  const allCols = [...CORE_COLS];

  for (const tmpl of templates) {
    for (const suffix of EXPORT_STAGE_SUFFIXES) {
      allCols.push(`${tmpl.name} ${suffix}`);
    }
  }

  // Append any extra columns from originalCsvRow that are not already listed
  const colSet = new Set(allCols);
  for (const job of jobs) {
    for (const col of Object.keys(job.originalCsvRow)) {
      if (!colSet.has(col)) {
        colSet.add(col);
        allCols.push(col);
      }
    }
  }

  const header = allCols.map(quoteField).join(",");

  const dataRows = jobs.map((job) => {
    const row = buildRow(job, templates);
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
