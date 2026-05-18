/**
 * order.test.js — TDD tests for order.js
 *
 * Run via test/index.html in Chrome.
 */

import { reorderJobs } from "../order.js";

const { describe, it } = window;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeJobs(keys) {
  return keys.map((k, i) => ({ jobKey: k, rowOrder: i }));
}

function keys(jobs) {
  return jobs.map((j) => j.jobKey);
}

// ---------------------------------------------------------------------------
// reorderJobs()
// ---------------------------------------------------------------------------

describe("reorderJobs()", () => {
  it("returns a new array (does not mutate original)", () => {
    const jobs = makeJobs(["A", "B", "C"]);
    const result = reorderJobs(jobs, "A", "B");
    expect(result).not.to.equal(jobs);
    expect(jobs.map((j) => j.jobKey)).to.deep.equal(["A", "B", "C"]);
  });

  it("src === tgt returns same order", () => {
    const jobs = makeJobs(["A", "B", "C"]);
    expect(keys(reorderJobs(jobs, "A", "A"))).to.deep.equal(["A", "B", "C"]);
  });

  it("preserves all items", () => {
    const jobs = makeJobs(["A", "B", "C", "D"]);
    const result = reorderJobs(jobs, "B", "D");
    expect(result).to.have.lengthOf(4);
  });

  // Moving UP (source is below the target in the list) -------------------

  it("moves source BEFORE target when moving up (non-adjacent)", () => {
    // [A, B, C, D]: drag C up to drop on B → [A, C, B, D]
    const jobs = makeJobs(["A", "B", "C", "D"]);
    expect(keys(reorderJobs(jobs, "C", "B"))).to.deep.equal([
      "A",
      "C",
      "B",
      "D",
    ]);
  });

  it("moves last item to first position", () => {
    // [A, B, C]: drag C up to drop on A → [C, A, B]
    const jobs = makeJobs(["A", "B", "C"]);
    expect(keys(reorderJobs(jobs, "C", "A"))).to.deep.equal(["C", "A", "B"]);
  });

  it("adjacent up-move: swaps adjacent items", () => {
    // [A, B, C]: drag B up to drop on A → [B, A, C]
    const jobs = makeJobs(["A", "B", "C"]);
    expect(keys(reorderJobs(jobs, "B", "A"))).to.deep.equal(["B", "A", "C"]);
  });

  // Moving DOWN (source is above the target in the list) -----------------

  it("moves source AFTER target when moving down (non-adjacent)", () => {
    // [A, B, C, D]: drag B down to drop on C → [A, C, B, D]
    const jobs = makeJobs(["A", "B", "C", "D"]);
    expect(keys(reorderJobs(jobs, "B", "C"))).to.deep.equal([
      "A",
      "C",
      "B",
      "D",
    ]);
  });

  it("moves first item to last position", () => {
    // [A, B, C]: drag A down to drop on C → [B, C, A]
    const jobs = makeJobs(["A", "B", "C"]);
    expect(keys(reorderJobs(jobs, "A", "C"))).to.deep.equal(["B", "C", "A"]);
  });

  it("adjacent down-move: swaps adjacent items", () => {
    // [A, B, C]: drag A down to drop on B → [B, A, C]
    const jobs = makeJobs(["A", "B", "C"]);
    expect(keys(reorderJobs(jobs, "A", "B"))).to.deep.equal(["B", "A", "C"]);
  });

  it("multi-item skip down: [A,B,C,D] drag A to D → [B, C, D, A]", () => {
    const jobs = makeJobs(["A", "B", "C", "D"]);
    expect(keys(reorderJobs(jobs, "A", "D"))).to.deep.equal([
      "B",
      "C",
      "D",
      "A",
    ]);
  });

  it("multi-item skip up: [A,B,C,D] drag D to A → [D, A, B, C]", () => {
    const jobs = makeJobs(["A", "B", "C", "D"]);
    expect(keys(reorderJobs(jobs, "D", "A"))).to.deep.equal([
      "D",
      "A",
      "B",
      "C",
    ]);
  });
});
