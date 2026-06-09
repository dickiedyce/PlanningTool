/**
 * gantt.test.js — TDD tests for gantt.js (pure functions only)
 *
 * renderTimeline() manipulates the DOM and is covered by manual/integration
 * testing. This suite covers the mathematical functions.
 *
 * Run via test/index.html in Chrome.
 */

import { buildTimeline, dateToX, xToDate } from "../gantt.js";

const { describe, it } = window;

// Helper: local-midnight Date from "YYYY-MM-DD"
function d(iso) {
  const [y, m, day] = iso.split("-").map(Number);
  return new Date(y, m - 1, day);
}

// Helper: format Date → "YYYY-MM-DD"
function fmt(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeJob(plannedStart, plannedEnd, actualStart = "", actualEnd = "") {
  return {
    jobKey: "1",
    jobName: "Test",
    client: "Acme",
    initiative: "Proj",
    priority: "High",
    teamPriority: "High",
    rowOrder: 0,
    stages: [
      {
        name: "Stage A",
        sequence: 1,
        defaultDurationDays: 5,
        status: actualEnd
          ? "Complete"
          : actualStart
            ? "InProgress"
            : "NotStarted",
        actualStart,
        actualEnd,
        plannedStart,
        plannedEnd,
      },
    ],
    originalCsvRow: {},
  };
}

// ---------------------------------------------------------------------------
// buildTimeline
// ---------------------------------------------------------------------------

describe("buildTimeline()", () => {
  it("returns an object with startDate, endDate, and dayWidth", () => {
    const tl = buildTimeline([makeJob("2026-06-01", "2026-06-10")], true);
    expect(tl).to.have.property("startDate").that.is.instanceOf(Date);
    expect(tl).to.have.property("endDate").that.is.instanceOf(Date);
    expect(tl).to.have.property("dayWidth").that.is.a("number").above(0);
  });

  it("startDate is before the earliest job date (includes padding)", () => {
    const job = makeJob("2026-06-01", "2026-06-10");
    const tl = buildTimeline([job], true);
    expect(tl.startDate < d("2026-06-01")).to.be.true;
  });

  it("endDate is after the latest job date (includes padding)", () => {
    const job = makeJob("2026-06-01", "2026-06-10");
    const tl = buildTimeline([job], true);
    expect(tl.endDate > d("2026-06-10")).to.be.true;
  });

  it("uses actual dates when they exist (prefer actualStart over plannedStart)", () => {
    // actualEnd is later than plannedEnd → timeline must extend to it
    const job = makeJob("2026-07-05", "2026-07-15", "2026-07-01", "2026-07-20");
    const tl = buildTimeline([job], true);
    expect(tl.endDate > d("2026-07-20")).to.be.true;
  });

  it("spans multiple jobs correctly (min start, max end)", () => {
    const job1 = makeJob("2026-07-01", "2026-07-15");
    const job2 = makeJob("2026-08-01", "2026-09-01");
    const tl = buildTimeline([job1, job2], true);
    expect(tl.startDate < d("2026-07-01")).to.be.true;
    expect(tl.endDate > d("2026-09-01")).to.be.true;
  });

  it("startDate is a working day (not Saturday or Sunday)", () => {
    const tl = buildTimeline([makeJob("2026-06-01", "2026-06-30")], true);
    expect(tl.startDate.getDay()).to.not.equal(0);
    expect(tl.startDate.getDay()).to.not.equal(6);
  });

  it("endDate is a working day (not Saturday or Sunday)", () => {
    const tl = buildTimeline([makeJob("2026-06-01", "2026-06-30")], true);
    expect(tl.endDate.getDay()).to.not.equal(0);
    expect(tl.endDate.getDay()).to.not.equal(6);
  });

  it("ignores stages with no dates", () => {
    const job = makeJob("", "");
    // Should not throw; may return a default/fallback timeline
    expect(() => buildTimeline([job], true)).to.not.throw();
  });
});

// ---------------------------------------------------------------------------
// dateToX
// ---------------------------------------------------------------------------

describe("dateToX()", () => {
  it("returns 0 for the timeline startDate", () => {
    const tl = buildTimeline([makeJob("2026-06-10", "2026-06-20")], true);
    expect(dateToX(tl, tl.startDate)).to.equal(0);
  });

  it("returns a positive number for a date after startDate", () => {
    const tl = buildTimeline([makeJob("2026-06-10", "2026-06-20")], true);
    const x = dateToX(tl, d("2026-06-15"));
    expect(x).to.be.above(0);
  });

  it("returns a value proportional to dayWidth per calendar day (calendar mode)", () => {
    const tl = buildTimeline([makeJob("2026-06-10", "2026-06-20")], false);
    // Two dates exactly 7 calendar days apart
    const dateA = new Date(tl.startDate);
    const dateB = new Date(tl.startDate);
    dateB.setDate(dateB.getDate() + 7);
    const diff = dateToX(tl, dateB) - dateToX(tl, dateA);
    expect(diff).to.equal(7 * tl.dayWidth);
  });

  it("in working-days mode, weekend days map to the same x as the preceding Friday", () => {
    const tl = buildTimeline([makeJob("2026-06-10", "2026-06-20")], true);
    let friday = new Date(tl.startDate);
    while (friday.getDay() !== 5) friday.setDate(friday.getDate() + 1);
    const saturday = new Date(friday);
    saturday.setDate(saturday.getDate() + 1);
    const sunday = new Date(friday);
    sunday.setDate(sunday.getDate() + 2);
    expect(dateToX(tl, saturday)).to.equal(dateToX(tl, friday));
    expect(dateToX(tl, sunday)).to.equal(dateToX(tl, friday));
  });

  it("in working-days mode, Mon→Mon+7 calendar days spans 5 * dayWidth", () => {
    const tl = buildTimeline([makeJob("2026-06-10", "2026-06-20")], true);
    let monday = new Date(tl.startDate);
    while (monday.getDay() !== 1) monday.setDate(monday.getDate() + 1);
    const nextMonday = new Date(monday);
    nextMonday.setDate(nextMonday.getDate() + 7);
    const diff = dateToX(tl, nextMonday) - dateToX(tl, monday);
    expect(diff).to.equal(5 * tl.dayWidth);
  });

  it("returns a negative number for a date before startDate", () => {
    const tl = buildTimeline([makeJob("2026-06-10", "2026-06-20")], true);
    const x = dateToX(tl, d("2026-01-01"));
    expect(x).to.be.below(0);
  });
});

// ---------------------------------------------------------------------------
// xToDate (inverse of dateToX)
// ---------------------------------------------------------------------------

describe("xToDate()", () => {
  it("returns startDate for x=0", () => {
    const tl = buildTimeline([makeJob("2026-06-10", "2026-06-20")], true);
    const result = xToDate(tl, 0);
    expect(fmt(result)).to.equal(fmt(tl.startDate));
  });

  it("is the inverse of dateToX (round-trip)", () => {
    const tl = buildTimeline([makeJob("2026-06-10", "2026-06-20")], true);
    const date = d("2026-06-15");
    const x = dateToX(tl, date);
    const back = xToDate(tl, x);
    expect(fmt(back)).to.equal(fmt(date));
  });

  it("returns a date N calendar days from startDate for x = N * dayWidth (calendar mode)", () => {
    const tl = buildTimeline([makeJob("2026-06-10", "2026-06-20")], false);
    const x = 5 * tl.dayWidth;
    const result = xToDate(tl, x);
    const expected = new Date(tl.startDate);
    expected.setDate(expected.getDate() + 5);
    expect(fmt(result)).to.equal(fmt(expected));
  });

  it("in working-days mode, x = N * dayWidth returns the Nth working day from startDate", () => {
    const tl = buildTimeline([makeJob("2026-06-10", "2026-06-20")], true);
    const x = 5 * tl.dayWidth;
    const result = xToDate(tl, x);
    // Build expected: 5 working days after startDate
    let expected = new Date(tl.startDate);
    let count = 0;
    while (count < 5) {
      expected.setDate(expected.getDate() + 1);
      if (expected.getDay() !== 0 && expected.getDay() !== 6) count++;
    }
    expect(fmt(result)).to.equal(fmt(expected));
  });
});
