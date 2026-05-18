/**
 * csv.test.js — TDD tests for csv.js
 *
 * Run via test/index.html in Chrome.
 * All tests are intentionally written before the implementation exists (red).
 */

import { parseCSV, parseTemplates, parseStageDates } from "../csv.js";

const { describe, it } = window;

// ---------------------------------------------------------------------------
// parseCSV — low-level CSV-text → array-of-objects
// ---------------------------------------------------------------------------

describe("parseCSV()", () => {
  it("parses a simple two-column CSV into an array of objects", () => {
    const text = `Name,Age\nAlice,30\nBob,25`;
    const result = parseCSV(text);
    expect(result).to.deep.equal([
      { Name: "Alice", Age: "30" },
      { Name: "Bob", Age: "25" },
    ]);
  });

  it("handles quoted fields that contain commas", () => {
    const text = `Name,Note\n"Smith, J.","see, above"\nDoe,none`;
    const result = parseCSV(text);
    expect(result[0].Name).to.equal("Smith, J.");
    expect(result[0].Note).to.equal("see, above");
  });

  it("handles quoted fields that contain newlines", () => {
    const text = `Name,Note\n"Alice","line one\nline two"\nBob,none`;
    const result = parseCSV(text);
    expect(result[0].Note).to.equal("line one\nline two");
  });

  it("handles empty fields", () => {
    const text = `A,B,C\n1,,3`;
    const result = parseCSV(text);
    expect(result[0]).to.deep.equal({ A: "1", B: "", C: "3" });
  });

  it("strips surrounding double-quotes from field values", () => {
    const text = `"Name","Value"\n"Alice","42"`;
    const result = parseCSV(text);
    expect(result[0]).to.deep.equal({ Name: "Alice", Value: "42" });
  });

  it("returns an empty array for an empty string", () => {
    expect(parseCSV("")).to.deep.equal([]);
  });

  it("returns an empty array when there is only a header row", () => {
    expect(parseCSV("A,B,C")).to.deep.equal([]);
  });

  it("trims trailing carriage returns (Windows CRLF)", () => {
    const text = "Name,Age\r\nAlice,30\r\nBob,25\r\n";
    const result = parseCSV(text);
    expect(result).to.deep.equal([
      { Name: "Alice", Age: "30" },
      { Name: "Bob", Age: "25" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// parseTemplates — validates and shapes the stage-templates CSV
// ---------------------------------------------------------------------------

describe("parseTemplates()", () => {
  const validTemplateCSV = [
    '"Name","Sequence","Default Owner","Active","Default Duration (Days)"',
    '"Design Phase","1","Architect","Yes","5"',
    '"Form Complete","2","Client Lead","Yes","1"',
    '"OldStage","3","Owner","No","2"',
  ].join("\n");

  it("returns only active stages", () => {
    const result = parseTemplates(validTemplateCSV);
    expect(result.map((s) => s.name)).to.deep.equal([
      "Design Phase",
      "Form Complete",
    ]);
  });

  it("shapes each stage with the expected properties", () => {
    const result = parseTemplates(validTemplateCSV);
    expect(result[0]).to.deep.equal({
      name: "Design Phase",
      sequence: 1,
      defaultOwner: "Architect",
      active: true,
      defaultDurationDays: 5,
      color: "", // no Color (Hex) column in this fixture
    });
  });

  it("throws when the Name column is missing", () => {
    const bad = "Sequence,Active\n1,Yes";
    expect(() => parseTemplates(bad)).to.throw(/Name/i);
  });

  it("throws when the Sequence column is missing", () => {
    const bad = '"Name","Active","Default Duration (Days)"\n"X","Yes","5"';
    expect(() => parseTemplates(bad)).to.throw(/Sequence/i);
  });

  it("throws when the Active column is missing", () => {
    const bad = '"Name","Sequence","Default Duration (Days)"\n"X","1","5"';
    expect(() => parseTemplates(bad)).to.throw(/Active/i);
  });

  it("throws when the Default Duration (Days) column is missing", () => {
    const bad = '"Name","Sequence","Active"\n"X","1","Yes"';
    expect(() => parseTemplates(bad)).to.throw(/Default Duration/i);
  });

  it("sorts stages by sequence number", () => {
    const csv = [
      '"Name","Sequence","Default Owner","Active","Default Duration (Days)"',
      '"Stage B","2","O","Yes","3"',
      '"Stage A","1","O","Yes","5"',
    ].join("\n");
    const result = parseTemplates(csv);
    expect(result.map((s) => s.name)).to.deep.equal(["Stage A", "Stage B"]);
  });
});

// ---------------------------------------------------------------------------
// parseStageDates — validates and shapes the workboard-stage-dates CSV
// ---------------------------------------------------------------------------

describe("parseStageDates()", () => {
  // Minimal but valid templates fixture
  const templates = [
    {
      name: "Design Phase",
      sequence: 1,
      defaultOwner: "Arch",
      active: true,
      defaultDurationDays: 5,
    },
    {
      name: "Deploy to PROD",
      sequence: 2,
      defaultOwner: "Dev",
      active: true,
      defaultDurationDays: 3,
    },
  ];

  function makeDatesCSV(extraCols = "") {
    const header = [
      "JobKey",
      "Job Name",
      "Client",
      "Initiative",
      "Priority",
      "Team Priority",
      "Design Phase Status",
      "Design Phase Actual Start",
      "Design Phase Actual End",
      "Design Phase Planned Start",
      "Design Phase Planned End",
      "Deploy to PROD Status",
      "Deploy to PROD Actual Start",
      "Deploy to PROD Actual End",
      "Deploy to PROD Planned Start",
      "Deploy to PROD Planned End",
    ]
      .concat(extraCols ? [extraCols] : [])
      .join(",");

    const row = [
      "1001",
      "Test Job",
      "Acme",
      "Project X",
      "High",
      "High",
      "Complete",
      "2026-01-01",
      "2026-01-05",
      "2026-01-01",
      "2026-01-05",
      "NotStarted",
      "",
      "",
      "2026-02-01",
      "2026-02-03",
    ]
      .concat(extraCols ? [""] : [])
      .join(",");

    return `${header}\n${row}`;
  }

  it("returns an array of job objects", () => {
    const result = parseStageDates(makeDatesCSV(), templates);
    expect(result).to.be.an("array").with.lengthOf(1);
  });

  it("maps core job fields correctly", () => {
    const [job] = parseStageDates(makeDatesCSV(), templates);
    expect(job.jobKey).to.equal("1001");
    expect(job.jobName).to.equal("Test Job");
    expect(job.client).to.equal("Acme");
    expect(job.initiative).to.equal("Project X");
    expect(job.priority).to.equal("High");
    expect(job.teamPriority).to.equal("High");
  });

  it("attaches one stage per active template", () => {
    const [job] = parseStageDates(makeDatesCSV(), templates);
    expect(job.stages).to.have.lengthOf(2);
  });

  it("maps stage fields correctly", () => {
    const [job] = parseStageDates(makeDatesCSV(), templates);
    const dp = job.stages[0];
    expect(dp.name).to.equal("Design Phase");
    expect(dp.status).to.equal("Complete");
    expect(dp.actualStart).to.equal("2026-01-01");
    expect(dp.actualEnd).to.equal("2026-01-05");
    expect(dp.plannedStart).to.equal("2026-01-01");
    expect(dp.plannedEnd).to.equal("2026-01-05");
  });

  it("throws when a required stage column is missing", () => {
    // Build a CSV that is missing the "Deploy to PROD Status" column
    const header = [
      "JobKey",
      "Job Name",
      "Client",
      "Initiative",
      "Priority",
      "Team Priority",
      "Design Phase Status",
      "Design Phase Actual Start",
      "Design Phase Actual End",
      "Design Phase Planned Start",
      "Design Phase Planned End",
      // missing: Deploy to PROD Status …
    ].join(",");
    const row =
      "1001,Test,Acme,Proj,High,High,Complete,2026-01-01,2026-01-05,2026-01-01,2026-01-05";
    expect(() => parseStageDates(`${header}\n${row}`, templates)).to.throw(
      /Deploy to PROD/i,
    );
  });

  it("throws when the JobKey column is missing", () => {
    const header = "Job Name,Client,Initiative,Priority,Team Priority";
    const row = "Test,Acme,Proj,High,High";
    expect(() => parseStageDates(`${header}\n${row}`, templates)).to.throw(
      /JobKey/i,
    );
  });

  it("preserves the original CSV row on each job object", () => {
    const [job] = parseStageDates(makeDatesCSV(), templates);
    expect(job.originalCsvRow).to.be.an("object");
    expect(job.originalCsvRow["Job Name"]).to.equal("Test Job");
  });
});
