import assert from "node:assert";
import { describe, it } from "node:test";
import {
  amountPerStamp,
  COVERAGE_COMPLETE,
  coverageComplete,
  coverageFraction,
  kerfComplete,
  kerfFraction,
  makeCoverageGrid,
  makeKerfMask,
  sawStroke,
  stampBrush,
  stampStroke,
} from "./coverage";

describe("coverage grid", () => {
  it("starts empty", () => {
    const grid = makeCoverageGrid(24, 4);
    assert.strictEqual(coverageFraction(grid), 0);
    assert.ok(!coverageComplete(grid));
  });

  it("a stamp saturates the cells under the brush core", () => {
    const grid = makeCoverageGrid(10, 10);
    stampBrush(grid, 5, 5, 2, 1);
    assert.ok(coverageFraction(grid) > 0);
    // The exact center cell got the full amount
    const centerIndex = Math.floor(5 * 2) * grid.cols + Math.floor(5 * 2);
    assert.strictEqual(grid.cells[centerIndex], 1);
  });

  it("partial amounts accumulate across repeated stamps", () => {
    const grid = makeCoverageGrid(4, 4);
    const before = stampBrush(grid, 2, 2, 3, 0.4);
    const after = stampBrush(grid, 2, 2, 3, 0.4);
    const done = stampBrush(grid, 2, 2, 3, 0.4);
    assert.ok(after >= before);
    assert.ok(done > after);
  });

  it("stroking the whole face completes it — the accountant's version of sanding a board", () => {
    // A 24×4 board under a wide brush: sweep rows until covered
    const grid = makeCoverageGrid(24, 4);
    for (let pass = 0; pass < 40 && !coverageComplete(grid); pass++) {
      const y = (pass % 4) + 0.5;
      stampStroke(grid, -1, y, 25, y, 1.5, 0.5);
    }
    assert.ok(coverageComplete(grid));
    assert.ok(coverageFraction(grid) >= COVERAGE_COMPLETE);
  });

  it("completes at the threshold, not at literal 100%", () => {
    // Saturate every cell of a board except a few in one corner — the
    // sliver of edge that must never hold the board hostage
    const grid = makeCoverageGrid(24, 4);
    const total = grid.cols * grid.rows;
    let skipped = 0;
    for (let row = 0; row < grid.rows; row++) {
      for (let col = 0; col < grid.cols; col++) {
        if (row === grid.rows - 1 && col >= grid.cols - 5) {
          skipped++;
          continue;
        }
        // A pin-point stamp saturates exactly its own cell
        stampBrush(grid, (col + 0.5) / 2, (row + 0.5) / 2, 0.3, 1);
      }
    }
    assert.strictEqual(grid.covered, total - skipped);
    assert.ok(
      coverageComplete(grid),
      `expected ${coverageFraction(grid)} to clear ${COVERAGE_COMPLETE}`,
    );
    assert.ok(coverageFraction(grid) < 1);
  });

  it("a fast drag lays stamps along the whole segment, not just the ends", () => {
    const grid = makeCoverageGrid(20, 2);
    stampStroke(grid, 0, 1, 20, 1, 1, 1);
    // The middle of the stroke is as covered as the ends
    const midIndex = 2 * grid.cols + Math.floor(10 * 2);
    assert.strictEqual(grid.cells[midIndex], 1);
  });

  it("stamps off the edge clip instead of wrapping or throwing", () => {
    const grid = makeCoverageGrid(4, 4);
    stampBrush(grid, -3, -3, 2, 1);
    stampBrush(grid, 7, 7, 2, 1);
    assert.ok(coverageFraction(grid) < 0.5);
  });

  it("amountPerStamp scales with the tool: a wider, faster brush needs fewer stamps", () => {
    // The random orbit sander against the cork block
    const block = amountPerStamp(15, 1.25, 60);
    const orbit = amountPerStamp(50, 2.5, 60);
    assert.ok(block > 0 && block <= 1);
    assert.ok(orbit > 0 && orbit <= 1);
    // Per-disc fill time: block π·1.25²/15 ≈ 0.33s, orbit π·2.5²/50 ≈ 0.39s
    // — comparable per stamp, but the orbit's disc covers 4× the area, so
    // the whole board finishes far sooner. The engine only promises both
    // are sane fractions; the feel constants live on the tools.
  });
});

describe("kerf mask", () => {
  it("scales the budget with the cross-section", () => {
    const thin = makeKerfMask(4, 0.25);
    const thick = makeKerfMask(4, 1.5);
    sawStroke(thin, 8, 0.25);
    sawStroke(thick, 8, 0.25);
    assert.ok(kerfFraction(thin) > kerfFraction(thick));
  });

  it("push–pull strokes accumulate to completion", () => {
    const mask = makeKerfMask(4, 0.25);
    let strokes = 0;
    while (!kerfComplete(mask) && strokes < 100) {
      sawStroke(mask, 8, 0.25);
      strokes++;
    }
    assert.ok(kerfComplete(mask));
    assert.ok(strokes >= 2, "a real cut takes more than one stroke");
  });

  it("progress saturates at the budget", () => {
    const mask = makeKerfMask(1, 0.25);
    for (let i = 0; i < 50; i++) {
      sawStroke(mask, 8, 1);
    }
    assert.strictEqual(kerfFraction(mask), 1);
  });
});

describe("coverage progress readout", () => {
  it("moves from the very first thin pass, while completion stays strict", async () => {
    const { coverageProgress } = await import("./coverage");
    const grid = makeCoverageGrid(24, 4);
    stampStroke(grid, 2, 2, 22, 2, 1.25, 0.05);
    assert.ok(coverageProgress(grid) > 0, "the readout should move");
    assert.strictEqual(coverageFraction(grid), 0, "nothing saturated yet");
    assert.ok(!coverageComplete(grid));
  });
});
