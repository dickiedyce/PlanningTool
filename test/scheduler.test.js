/**
 * scheduler.test.js — TDD tests for scheduler.js
 *
 * Run via test/index.html in Chrome.
 */

import { recalculateFromStage } from "../scheduler.js";

const { describe, it } = window;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeTemplateStage(name, seq, dur) {
  return {
    name,
    sequence: seq,
    defaultOwner: "Dev",
    active: true,
    defaultDurationDays: dur,
  };
}

/**
 * Build a minimal job with three stages.
 * Dates are ISO strings as they come from the CSV parser.
 */
function makeJob(overrides = {}) {
  return {
    jobKey: "1001",
    jobName: "Test Job",
    client: "Acme",
    initiative: "Proj",
    priority: "High",
    teamPriority: "High",
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
        name: "Implement API",
        sequence: 2,
        defaultDurationDays: 10,
        status: "NotStarted",
        actualStart: "",
        actualEnd: "",
        plannedStart: "2026-05-06",
        plannedEnd: "2026-05-15",
      },
      {
        name: "Unit Tests",
        sequence: 3,
        defaultDurationDays: 4,
        status: "NotStarted",
        actualStart: "",
        actualEnd: "",
        plannedStart: "2026-05-18",
        plannedEnd: "2026-05-21",
      },
    ],
    originalCsvRow: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// recalculateFromStage — working-days mode
// ---------------------------------------------------------------------------

describe("recalculateFromStage() — working-days mode", () => {
  it("returns a job object", () => {
    const job = makeJob();
    const result = recalculateFromStage(job, 1, true);
    expect(result).to.be.an("object");
    expect(result.stages).to.have.lengthOf(3);
  });

  it("does not mutate the original job", () => {
    const job = makeJob();
    const original = JSON.stringify(job);
    recalculateFromStage(job, 1, true);
    expect(JSON.stringify(job)).to.equal(original);
  });

  it("leaves stages before the pivot index unchanged", () => {
    const job = makeJob();
    const result = recalculateFromStage(job, 1, true);
    expect(result.stages[0]).to.deep.equal(job.stages[0]);
  });

  it("cascades planned dates from the pivot stage onward", () => {
    // Stage 1 (Implement API) planned end = 2026-05-06 + 10 wd
    // 2026-05-06 is Wednesday; 10 wd later = 2026-05-20 (Wednesday)
    // Stage 2 (Unit Tests) starts next wd after 2026-05-20 = 2026-05-21 (Thu)
    // Stage 2 ends 2026-05-21 + 4 wd = 2026-05-27 (Wed)
    const job = makeJob();
    // Move pivot: stage[1] plannedStart = 2026-05-06
    const result = recalculateFromStage(job, 1, true);
    const impl = result.stages[1];
    const ut = result.stages[2];

    expect(impl.plannedStart).to.equal("2026-05-06");
    expect(impl.plannedEnd).to.equal("2026-05-20"); // Wed 6 + 10 wd = Wed 20
    expect(ut.plannedStart).to.equal("2026-05-21"); // next wd after Wed 20 = Thu 21
    expect(ut.plannedEnd).to.equal("2026-05-27"); // Thu 21 + 4 wd = Wed 27
  });

  it("uses the actualEnd of a complete stage as the base for the next stage", () => {
    // Stage 0 is Complete, actualEnd = 2026-05-05 (Tuesday)
    // Stage 1 (pivot=0) should start on nextWorkingDay(2026-05-05) = 2026-05-06
    const job = makeJob();
    const result = recalculateFromStage(job, 0, true);
    expect(result.stages[1].plannedStart).to.equal("2026-05-06");
  });

  it("does not overwrite actual dates on Complete stages during cascade", () => {
    const job = makeJob();
    // Mark stage[1] as also complete
    job.stages[1].status = "Complete";
    job.stages[1].actualStart = "2026-05-06";
    job.stages[1].actualEnd = "2026-05-18";
    const result = recalculateFromStage(job, 1, true);
    expect(result.stages[1].actualStart).to.equal("2026-05-06");
    expect(result.stages[1].actualEnd).to.equal("2026-05-18");
  });

  it("skips NotApplicable stages in the cascade chain", () => {
    const job = makeJob();
    job.stages[1].status = "NotApplicable";
    // Stage[2] should still get dates derived from stage[0]'s end
    const result = recalculateFromStage(job, 0, true);
    // stage[1] is skipped; stage[2] plannedStart = nextWD after stage[0].actualEnd
    const ut = result.stages[2];
    expect(ut.plannedStart).to.equal("2026-05-06");
    expect(ut.plannedEnd).to.equal("2026-05-12"); // 2026-05-06 + 4 wd = 2026-05-12 (Tue)
  });

  it("planned dates land on working days (never Saturday or Sunday)", () => {
    // Set stage[1].plannedStart to a Thursday so end falls on a weekend boundary
    const job = makeJob();
    job.stages[1].plannedStart = "2026-05-07"; // Thursday
    const result = recalculateFromStage(job, 1, true);
    const end = new Date(result.stages[1].plannedEnd);
    expect(end.getDay()).to.not.equal(0); // not Sunday
    expect(end.getDay()).to.not.equal(6); // not Saturday
  });
});

// ---------------------------------------------------------------------------
// recalculateFromStage — calendar-days mode
// ---------------------------------------------------------------------------

describe("recalculateFromStage() — calendar-days mode", () => {
  it("adds duration in calendar days, not working days", () => {
    // Stage[1] starts 2026-05-06 (Wed), duration=10 calendar days → ends 2026-05-16 (Sat)
    const job = makeJob();
    const result = recalculateFromStage(job, 1, false);
    expect(result.stages[1].plannedEnd).to.equal("2026-05-16");
  });

  it("does not skip weekends when advancing to next stage", () => {
    const job = makeJob();
    const result = recalculateFromStage(job, 1, false);
    // Stage[2] starts day after stage[1] ends (2026-05-16 + 1 = 2026-05-17)
    expect(result.stages[2].plannedStart).to.equal("2026-05-17");
  });
});
