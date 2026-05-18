/**
 * csv.js — CSV parsing and validation
 *
 * Exports:
 *   parseCSV(text)                     → Array<Object>
 *   parseTemplates(text)               → Array<StageTemplate>
 *   parseStageDates(text, templates)   → Array<Job>
 */

// ---------------------------------------------------------------------------
// parseCSV — RFC 4180-compatible CSV parser
// ---------------------------------------------------------------------------

/**
 * Parse CSV text into an array of plain objects keyed by header row values.
 * Handles quoted fields (including embedded commas and newlines), CRLF, and
 * empty fields.  Returns [] when the input is empty or header-only.
 *
 * @param {string} text
 * @returns {Array<Object>}
 */
export function parseCSV(text) {
  if (!text || !text.trim()) return [];

  const records = tokenise(text);
  if (records.length < 2) return [];

  const headers = records[0];
  const rows = records.slice(1);

  return rows.map((fields) => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = fields[i] ?? "";
    });
    return obj;
  });
}

/**
 * Tokenise raw CSV text into a 2-D array of strings (rows × fields).
 * Handles:
 *   - Quoted fields (double-quote escaping via "")
 *   - Embedded commas and newlines inside quotes
 *   - CRLF and LF line endings
 *
 * @param {string} text
 * @returns {string[][]}
 */
function tokenise(text) {
  const records = [];
  let row = [];
  let i = 0;
  const n = text.length;

  while (i < n) {
    if (text[i] === '"') {
      // Quoted field
      i++;
      let field = "";
      while (i < n) {
        if (text[i] === '"') {
          if (text[i + 1] === '"') {
            // Escaped double-quote
            field += '"';
            i += 2;
          } else {
            // End of quoted field
            i++;
            break;
          }
        } else {
          field += text[i++];
        }
      }
      row.push(field);
      // Skip separator or line-ending after closing quote
      if (text[i] === ",") i++;
    } else {
      // Unquoted field — read until comma or newline
      let field = "";
      while (i < n && text[i] !== "," && text[i] !== "\n" && text[i] !== "\r") {
        field += text[i++];
      }
      row.push(field);
      if (text[i] === ",") i++;
    }

    // End of record?
    if (i >= n || text[i] === "\n" || text[i] === "\r") {
      records.push(row);
      row = [];
      // Consume CRLF or bare LF
      if (text[i] === "\r") i++;
      if (text[i] === "\n") i++;
    }
  }

  // Push any trailing row that wasn't terminated by a newline
  if (row.length > 0 && !(row.length === 1 && row[0] === "")) {
    records.push(row);
  }

  return records;
}

// ---------------------------------------------------------------------------
// parseTemplates
// ---------------------------------------------------------------------------

const TEMPLATE_REQUIRED_COLS = [
  "Name",
  "Sequence",
  "Active",
  "Default Duration (Days)",
];

/**
 * Parse and validate the stage-templates CSV.
 * Returns only active stages, sorted by sequence.
 *
 * @param {string} text
 * @returns {Array<{name, sequence, defaultOwner, active, defaultDurationDays}>}
 * @throws {Error} if required columns are missing
 */
export function parseTemplates(text) {
  const rows = parseCSV(text);

  if (rows.length === 0) {
    throw new Error("Templates CSV is empty");
  }

  const cols = Object.keys(rows[0]);
  for (const required of TEMPLATE_REQUIRED_COLS) {
    if (!cols.includes(required)) {
      throw new Error(
        `Templates CSV is missing required column: "${required}"`,
      );
    }
  }

  return rows
    .filter((r) => r["Active"] === "Yes")
    .map((r) => ({
      name: r["Name"],
      sequence: Number(r["Sequence"]),
      defaultOwner: r["Default Owner"] ?? "",
      active: true,
      defaultDurationDays: Number(r["Default Duration (Days)"]),
      color: r["Color (Hex)"] ?? "",
    }))
    .sort((a, b) => a.sequence - b.sequence);
}

// ---------------------------------------------------------------------------
// parseStageDates
// ---------------------------------------------------------------------------

const JOB_CORE_COLS = [
  "JobKey",
  "Job Name",
  "Client",
  "Initiative",
  "Priority",
  "Team Priority",
];
const STAGE_SUFFIXES = [
  "Status",
  "Actual Start",
  "Actual End",
  "Planned Start",
  "Planned End",
];

/**
 * Parse and validate the workboard-stage-dates CSV.
 * Returns an array of job objects with nested stage arrays.
 *
 * @param {string} text
 * @param {Array}  templates  Active stage templates from parseTemplates()
 * @returns {Array<Job>}
 * @throws {Error} if required columns are missing
 */
export function parseStageDates(text, templates) {
  const rows = parseCSV(text);

  if (rows.length === 0) {
    throw new Error("Stage-dates CSV is empty");
  }

  const cols = Object.keys(rows[0]);

  // Validate core job columns
  for (const required of JOB_CORE_COLS) {
    if (!cols.includes(required)) {
      throw new Error(
        `Stage-dates CSV is missing required column: "${required}"`,
      );
    }
  }

  // Validate stage columns for every active template
  for (const tmpl of templates) {
    for (const suffix of STAGE_SUFFIXES) {
      const col = `${tmpl.name} ${suffix}`;
      if (!cols.includes(col)) {
        throw new Error(`Stage-dates CSV is missing required column: "${col}"`);
      }
    }
  }

  return rows.map((row, idx) => {
    const stages = templates
      .filter((tmpl) => (row[`${tmpl.name} Status`] ?? "") !== "")
      .map((tmpl) => ({
        name: tmpl.name,
        sequence: tmpl.sequence,
        owner: tmpl.defaultOwner,
        defaultDurationDays: tmpl.defaultDurationDays,
        color: tmpl.color ?? "",
        isOutline: false,
        status: row[`${tmpl.name} Status`],
        actualStart: row[`${tmpl.name} Actual Start`] ?? "",
        actualEnd: row[`${tmpl.name} Actual End`] ?? "",
        plannedStart: row[`${tmpl.name} Planned Start`] ?? "",
        plannedEnd: row[`${tmpl.name} Planned End`] ?? "",
      }));

    return {
      jobKey: row["JobKey"],
      jobName: row["Job Name"],
      client: row["Client"],
      initiative: row["Initiative"],
      priority: row["Priority"],
      teamPriority: row["Team Priority"],
      rowOrder: idx,
      stages,
      originalCsvRow: row,
    };
  });
}
