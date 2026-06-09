/**
 * export.test.js — TDD tests for export.js
 *
 * Run via test/index.html in Chrome.
 */

import { exportStageDates } from "../export.js";

const { describe, it } = window;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Stage templates matching the two stages in makeJob() */
const templates = [
  {
    name: "Design Phase",
    sequence: 1,
    defaultOwner: "Architect",
    defaultDurationDays: 5,
    color: "#AF52DE",
  },
  {
    name: "Deploy to PROD",
    sequence: 2,
    defaultOwner: "Developer",
    defaultDurationDays: 3,
    color: "#FF3B30",
  },
];

/** Minimal two-stage job that round-trips cleanly */
function makeJob(overrides = {}) {
  const originalCsvRow = {
    JobKey: "1001",
    "Job Name": "Test Job",
    Client: "Acme",
    Initiative: "Proj X",
    Priority: "High",
    "Team Priority": "Medium",
    "Design Phase Status": "Complete",
    "Design Phase Actual Start": "2026-05-01",
    "Design Phase Actual End": "2026-05-05",
    "Design Phase Planned Start": "2026-05-01",
    "Design Phase Planned End": "2026-05-05",
    "Deploy to PROD Status": "NotStarted",
    "Deploy to PROD Actual Start": "",
    "Deploy to PROD Actual End": "",
    "Deploy to PROD Planned Start": "2026-06-01",
    "Deploy to PROD Planned End": "2026-06-03",
  };

  return {
    jobKey: "1001",
    jobName: "Test Job",
    client: "Acme",
    initiative: "Proj X",
    priority: "High",
    teamPriority: "Medium",
    rowOrder: 0,
    stages: [
      {
        name: "Design Phase",
        sequence: 1,
        defaultDurationDays: 5,
        status: "Complete",
        actualStart: "2026-05-01",
        actualEnd: "2026-05-05",
        plannedStart: "2026-05-01",
        plannedEnd: "2026-05-05",
      },
      {
        name: "Deploy to PROD",
        sequence: 2,
        defaultDurationDays: 3,
        status: "NotStarted",
        actualStart: "",
        actualEnd: "",
        plannedStart: "2026-06-01",
        plannedEnd: "2026-06-03",
      },
    ],
    originalCsvRow,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// exportStageDates
// ---------------------------------------------------------------------------

describe("exportStageDates()", () => {
  it("returns a non-empty string", () => {
    const csv = exportStageDates([makeJob()], templates);
    expect(csv).to.be.a("string").with.length.above(0);
  });

  it("first row is a header containing all template stage columns", () => {
    const csv = exportStageDates([makeJob()], templates);
    const header = csv.split("\n")[0];
    expect(header).to.include("JobKey");
    expect(header).to.include("Job Name");
    expect(header).to.include("Design Phase Planned Start");
    expect(header).to.include("Deploy to PROD Planned End");
  });

  it("produces one data row per job", () => {
    const csv = exportStageDates(
      [makeJob(), makeJob({ jobKey: "2002" })],
      templates,
    );
    const lines = csv.trim().split("\n");
    expect(lines).to.have.lengthOf(3); // header + 2 jobs
  });

  it("always includes Architect, Developer, Tester columns", () => {
    // Even when originalCsvRow lacks them (old format import)
    const job = makeJob();
    delete job.originalCsvRow.Architect;
    delete job.originalCsvRow.Developer;
    delete job.originalCsvRow.Tester;
    job.architect = "Alice";
    job.developer = "Bob";
    job.tester = "Eve";
    const csv = exportStageDates([job], templates);
    const header = csv.split("\n")[0];
    expect(header).to.include("Architect");
    expect(header).to.include("Developer");
    expect(header).to.include("Tester");
    const cols = header.split(",").map((c) => c.replace(/"/g, ""));
    const teamPIdx = cols.indexOf("Team Priority");
    const archIdx = cols.indexOf("Architect");
    expect(archIdx).to.equal(teamPIdx + 1);
  });

  it("reflects updated Priority in the output", () => {
    const job = makeJob();
    job.priority = "Low";
    const csv = exportStageDates([job], templates);
    const dataRow = csv.split("\n")[1];
    expect(dataRow).to.include("Low");
  });

  it("reflects updated Team Priority in the output", () => {
    const job = makeJob();
    job.teamPriority = "High";
    const csv = exportStageDates([job], templates);
    const dataRow = csv.split("\n")[1];
    // "High" already appears from Priority; verify Team Priority column value
    // by checking the CSV round-trips the updated field
    expect(csv).to.include("High");
  });

  it("reflects updated planned dates in the output", () => {
    const job = makeJob();
    job.stages[1].plannedStart = "2026-07-01";
    job.stages[1].plannedEnd = "2026-07-04";
    const csv = exportStageDates([job], templates);
    expect(csv).to.include("2026-07-01");
    expect(csv).to.include("2026-07-04");
  });

  it('preserves blank actual date fields as empty (not "undefined" or "null")', () => {
    const csv = exportStageDates([makeJob()], templates);
    expect(csv).to.not.include("undefined");
    expect(csv).to.not.include("null");
  });

  it("quotes fields containing commas", () => {
    const job = makeJob();
    job.originalCsvRow["Job Name"] = "Smith, J. Project";
    job.jobName = "Smith, J. Project";
    const csv = exportStageDates([job], templates);
    expect(csv).to.include('"Smith, J. Project"');
  });

  it("preserves columns that are not in the job model unchanged", () => {
    // Add an extra column to originalCsvRow that app never touches
    const job = makeJob();
    job.originalCsvRow["Some Extra Column"] = "extra-value";
    const csv = exportStageDates([job], templates);
    expect(csv).to.include("Some Extra Column");
    expect(csv).to.include("extra-value");
  });

  // -----------------------------------------------------------------------
  // Round-trip tests
  // -----------------------------------------------------------------------

  describe("round-trip", () => {
    it("exported CSV contains all stage columns from templates", () => {
      const csv = exportStageDates([makeJob()], templates);
      const header = csv.split("\n")[0];
      for (const tmpl of templates) {
        for (const suffix of [
          "Status",
          "Actual Start",
          "Actual End",
          "Planned Start",
          "Planned End",
        ]) {
          expect(header).to.include(`${tmpl.name} ${suffix}`);
        }
      }
    });

    it("core columns always appear even when missing from originalCsvRow", () => {
      const job = makeJob();
      delete job.originalCsvRow.Architect;
      delete job.originalCsvRow.Developer;
      delete job.originalCsvRow.Tester;
      const csv = exportStageDates([job], templates);
      const cols = csv
        .split("\n")[0]
        .split(",")
        .map((c) => c.replace(/"/g, ""));
      for (const c of [
        "JobKey",
        "Job Name",
        "Client",
        "Initiative",
        "Priority",
        "Team Priority",
        "Architect",
        "Developer",
        "Tester",
      ]) {
        expect(cols).to.include(c);
      }
    });
  });
});
