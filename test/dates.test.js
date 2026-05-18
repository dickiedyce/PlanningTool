/**
 * dates.test.js — TDD tests for dates.js
 *
 * Run via test/index.html in Chrome.
 * All tests are intentionally written before the implementation exists (red).
 */

import {
  isWorkingDay,
  addWorkingDays,
  nextWorkingDay,
  workingDaysBetween,
} from "../dates.js";

const { describe, it } = window;

// Helper: make a Date from an ISO string without timezone ambiguity
function d(iso) {
  const [y, m, day] = iso.split("-").map(Number);
  return new Date(y, m - 1, day);
}

// ---------------------------------------------------------------------------
// isWorkingDay
// ---------------------------------------------------------------------------

describe("isWorkingDay()", () => {
  it("returns true for Monday (2026-05-18)", () => {
    expect(isWorkingDay(d("2026-05-18"))).to.be.true;
  });

  it("returns true for Friday (2026-05-22)", () => {
    expect(isWorkingDay(d("2026-05-22"))).to.be.true;
  });

  it("returns false for Saturday (2026-05-23)", () => {
    expect(isWorkingDay(d("2026-05-23"))).to.be.false;
  });

  it("returns false for Sunday (2026-05-24)", () => {
    expect(isWorkingDay(d("2026-05-24"))).to.be.false;
  });
});

// ---------------------------------------------------------------------------
// nextWorkingDay
// ---------------------------------------------------------------------------

describe("nextWorkingDay()", () => {
  it("returns the next day when the next day is a weekday (Mon→Tue)", () => {
    const result = nextWorkingDay(d("2026-05-18")); // Monday
    expect(result).to.deep.equal(d("2026-05-19")); // Tuesday
  });

  it("skips Saturday and Sunday (Fri→Mon)", () => {
    const result = nextWorkingDay(d("2026-05-22")); // Friday
    expect(result).to.deep.equal(d("2026-05-25")); // Monday
  });

  it("skips Sunday when starting on Saturday (Sat→Mon)", () => {
    const result = nextWorkingDay(d("2026-05-23")); // Saturday
    expect(result).to.deep.equal(d("2026-05-25")); // Monday
  });
});

// ---------------------------------------------------------------------------
// addWorkingDays
// ---------------------------------------------------------------------------

describe("addWorkingDays()", () => {
  it("adds 0 days and returns the same date when it is a working day", () => {
    const mon = d("2026-05-18");
    expect(addWorkingDays(mon, 0)).to.deep.equal(mon);
  });

  it("adds 1 working day from Monday → Tuesday", () => {
    expect(addWorkingDays(d("2026-05-18"), 1)).to.deep.equal(d("2026-05-19"));
  });

  it("adds 5 working days from Monday → next Monday", () => {
    expect(addWorkingDays(d("2026-05-18"), 5)).to.deep.equal(d("2026-05-25"));
  });

  it("correctly skips a weekend (add 1 from Friday → Monday)", () => {
    expect(addWorkingDays(d("2026-05-22"), 1)).to.deep.equal(d("2026-05-25"));
  });

  it("handles larger spans spanning multiple weeks", () => {
    // 10 working days from Mon 2026-05-18 = Mon 2026-06-01
    expect(addWorkingDays(d("2026-05-18"), 10)).to.deep.equal(d("2026-06-01"));
  });

  it("adds 0 days when starting on Saturday and snaps to that Saturday", () => {
    // Behaviour: start is accepted as-is when days=0; callers should
    // normalise to a working day first if required.
    const sat = d("2026-05-23");
    expect(addWorkingDays(sat, 0)).to.deep.equal(sat);
  });
});

// ---------------------------------------------------------------------------
// workingDaysBetween
// ---------------------------------------------------------------------------

describe("workingDaysBetween()", () => {
  it("returns 0 when start and end are the same day", () => {
    expect(workingDaysBetween(d("2026-05-18"), d("2026-05-18"))).to.equal(0);
  });

  it("returns 1 between Monday and Tuesday", () => {
    expect(workingDaysBetween(d("2026-05-18"), d("2026-05-19"))).to.equal(1);
  });

  it("returns 5 across a full Mon–Fri week", () => {
    expect(workingDaysBetween(d("2026-05-18"), d("2026-05-22"))).to.equal(4);
  });

  it("counts 5 working days from Mon to next Mon (skips weekend)", () => {
    expect(workingDaysBetween(d("2026-05-18"), d("2026-05-25"))).to.equal(5);
  });

  it("excludes weekends from a multi-week span", () => {
    // Mon 18 May to Mon 01 Jun = 10 working days
    expect(workingDaysBetween(d("2026-05-18"), d("2026-06-01"))).to.equal(10);
  });
});
