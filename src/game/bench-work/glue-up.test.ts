import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "../board-helpers";
import { makeMaterial } from "../material-helpers";
import { EndGrainSlice, MaterialInstance } from "../Materials";
import { panel } from "../panel-helpers";
import { BenchPlacement } from "./bench-layout";
import {
  clampGhosts,
  clampsForGlueSpan,
  clampsOnRun,
  concatenatedStrips,
  detectGlueRun,
  inferGlueOperationId,
  pressClamp,
} from "./glue-up";

/** A prepped 24"×2" maple strip, glue-ready. */
function strip() {
  return board("maple", 24, 2, 4, "smooth", { faces: 2, edges: 2 });
}

function slice(): EndGrainSlice {
  return makeMaterial<EndGrainSlice>({
    type: "endGrainSlice",
    strips: [{ species: "maple", width: 2 }],
    thickness: 4,
  });
}

/** Strips laid edge to edge down the bench: length along Y, widths
 * marching across X. */
function laidRow(
  materials: ReadonlyArray<MaterialInstance>,
  gapIn = 0,
): Array<{ material: MaterialInstance; placement: BenchPlacement }> {
  let across = 0;
  return materials.map((material) => {
    const widthIn =
      material.type === "board"
        ? material.width
        : material.type === "panel"
          ? material.strips.reduce((sum, s) => sum + s.width, 0)
          : material.type === "endGrainSlice"
            ? material.thickness / 4
            : 0;
    const placement: BenchPlacement = {
      xIn: 18 + across + widthIn / 2,
      yIn: 12,
      angleDeg: 0,
      flipped: false,
    };
    across += widthIn + gapIn;
    return { material, placement };
  });
}

describe("clampsForGlueSpan", () => {
  it("one clamp per foot of length, never fewer than two", () => {
    assert.strictEqual(clampsForGlueSpan(12), 2);
    assert.strictEqual(clampsForGlueSpan(24), 2);
    assert.strictEqual(clampsForGlueSpan(30), 3);
    assert.strictEqual(clampsForGlueSpan(48), 4);
  });
});

describe("inferGlueOperationId", () => {
  it("maps compositions onto the credited recipes", () => {
    const p = panel(
      [
        { species: "maple", width: 2 },
        { species: "maple", width: 2 },
      ],
      24,
      4,
      "rough",
    );
    assert.strictEqual(
      inferGlueOperationId([strip(), strip(), strip(), strip(), strip()]),
      "glueUpPanel",
    );
    // Any board count is a panel — except a bare pair, which is
    // freeform lamination's opening move
    assert.strictEqual(
      inferGlueOperationId([strip(), strip(), strip()]),
      "glueUpPanel",
    );
    assert.strictEqual(inferGlueOperationId([strip(), strip()]), "glueUpPair");
    assert.strictEqual(inferGlueOperationId([p, strip()]), "extendPanel");
    assert.strictEqual(inferGlueOperationId([p, p]), "joinPanels");
    assert.strictEqual(
      inferGlueOperationId([slice(), slice(), slice(), slice()]),
      "glueUpEndGrain",
    );
  });

  it("refuses what no recipe covers", () => {
    assert.strictEqual(inferGlueOperationId([strip()]), null);
    // End grain only glues to end grain, and the blank takes exactly four
    assert.strictEqual(inferGlueOperationId([slice(), slice(), slice()]), null);
    assert.strictEqual(inferGlueOperationId([slice(), strip()]), null);
  });
});

describe("detectGlueRun", () => {
  it("finds a butted row and orders it across", () => {
    const pieces = laidRow([strip(), strip(), strip()]);
    // Shuffle the input: across order must come from the geometry
    const result = detectGlueRun([pieces[2], pieces[0], pieces[1]]);
    assert.ok(result.run);
    assert.strictEqual(result.run.pieces.length, 3);
    assert.deepStrictEqual(
      result.run.pieces.map((p) => p.id),
      pieces.map((p) => p.material.id),
    );
    assert.strictEqual(result.run.seams.length, 2);
    assert.strictEqual(result.run.lengthIn, 24);
    assert.strictEqual(result.run.spanIn, 6);
    assert.strictEqual(result.run.operationId, "glueUpPanel");
  });

  it("tolerates a squeeze-out gap but not daylight", () => {
    assert.ok(detectGlueRun(laidRow([strip(), strip()], 0.75)).run);
    assert.strictEqual(detectGlueRun(laidRow([strip(), strip()], 2)).run, null);
  });

  it("wants the ends lined up", () => {
    const pieces = laidRow([strip(), strip()]);
    const slid = [
      pieces[0],
      {
        ...pieces[1],
        placement: { ...pieces[1].placement, yIn: pieces[1].placement.yIn + 3 },
      },
    ];
    assert.strictEqual(detectGlueRun(slid).run, null);
  });

  it("a turned row still reads, at the row's own angle", () => {
    const pieces = laidRow([strip(), strip(), strip()]).map(
      ({ material, placement }) => ({
        material,
        // The same row swung 90°: rotate each center about (18, 12)
        placement: {
          ...placement,
          xIn: 18 - (placement.yIn - 12),
          yIn: 12 + (placement.xIn - 18),
          angleDeg: 90,
        },
      }),
    );
    const result = detectGlueRun(pieces);
    assert.ok(result.run);
    assert.strictEqual(result.run.angleDeg, 90);
    assert.strictEqual(result.run.seams.length, 2);
  });

  it("names why unprepped stock won't glue", () => {
    const rough = board("maple", 24, 2, 4, "rough");
    const result = detectGlueRun(laidRow([rough, strip()]));
    assert.strictEqual(result.run, null);
    assert.match(result.reason ?? "", /rough/i);
  });

  it("wants one thickness through the run", () => {
    const thick = board("maple", 24, 2, 8, "smooth", { faces: 2, edges: 2 });
    const result = detectGlueRun(laidRow([thick, strip()]));
    assert.strictEqual(result.run, null);
    assert.match(result.reason ?? "", /thickness/i);
  });

  it("a board up on edge is staged for something else", () => {
    const pieces = laidRow([strip(), strip()]);
    const tipped = [
      pieces[0],
      {
        ...pieces[1],
        placement: { ...pieces[1].placement, onEdge: true },
      },
    ];
    assert.strictEqual(detectGlueRun(tipped).run, null);
  });

  it("spare stock lying elsewhere never interferes", () => {
    const pieces = laidRow([strip(), strip(), strip()]);
    const spare = {
      material: strip(),
      placement: { xIn: 40, yIn: 30, angleDeg: 45, flipped: false },
    };
    const result = detectGlueRun([...pieces, spare]);
    assert.ok(result.run);
    assert.strictEqual(result.run.pieces.length, 3);
  });
});

describe("clamp geometry", () => {
  it("ghosts sit evenly spaced along the run, bars across it", () => {
    const run = detectGlueRun(laidRow([strip(), strip()])).run!;
    const ghosts = clampGhosts(run);
    assert.strictEqual(ghosts.length, 2);
    // 24" run: centers a quarter in from each end
    assert.deepStrictEqual(
      ghosts.map((g) => Math.round(g.yIn - run.center.yIn)),
      [-6, 6],
    );
    assert.ok(ghosts.every((g) => g.angleDeg === run.angleDeg));
  });

  it("counts only clamps actually lying across the run", () => {
    const run = detectGlueRun(laidRow([strip(), strip()])).run!;
    const on = { xIn: run.center.xIn, yIn: run.center.yIn, angleDeg: 0 };
    const skewed = { ...on, angleDeg: 45 };
    const past = { ...on, yIn: run.center.yIn + run.lengthIn };
    assert.strictEqual(clampsOnRun(run, [on, skewed, past]).length, 1);
  });
});

describe("pressClamp", () => {
  /** A two-strip run with its clamps on the ghosts and every seam
   * glued — one more press and the cure starts. */
  function readyRun() {
    const run = detectGlueRun(laidRow([strip(), strip()])).run!;
    return { run, clamps: [...clampGhosts(run)] };
  }

  /** A bar set out well clear of the run, on bare bench. */
  function stray(run: ReturnType<typeof readyRun>["run"]) {
    return { xIn: run.center.xIn + 40, yIn: run.center.yIn, angleDeg: 0 };
  }

  it("winds the run's own bars, the last one starting the cure", () => {
    const { run, clamps } = readyRun();
    assert.deepStrictEqual(
      pressClamp(run, clamps, 0, { tightened: 0, seamsGlued: true }),
      { kind: "tighten", tightened: 1 },
    );
    assert.deepStrictEqual(
      pressClamp(run, clamps, 1, { tightened: 1, seamsGlued: true }),
      { kind: "commit" },
    );
  });

  it("a bar lying off the run comes back into the hand", () => {
    const { run, clamps } = readyRun();
    const withStray = [...clamps, stray(run)];
    assert.deepStrictEqual(
      pressClamp(run, withStray, 2, { tightened: 0, seamsGlued: true }),
      { kind: "pickUp" },
    );
    // And it never counts toward the cure, however many times it's
    // pressed — the run's own bars are the only ones that wind
    assert.deepStrictEqual(
      pressClamp(run, withStray, 2, { tightened: 1, seamsGlued: true }),
      { kind: "pickUp" },
    );
  });

  it("picks the bar back up while a seam is still dry", () => {
    const { run, clamps } = readyRun();
    assert.deepStrictEqual(
      pressClamp(run, clamps, 0, { tightened: 0, seamsGlued: false }),
      { kind: "pickUp" },
    );
  });

  it("picks the bar back up while the run is short of clamps", () => {
    const { run, clamps } = readyRun();
    assert.deepStrictEqual(
      pressClamp(run, [clamps[0]], 0, { tightened: 0, seamsGlued: true }),
      { kind: "pickUp" },
    );
  });

  it("picks the bar back up when no run lies there at all", () => {
    const { run, clamps } = readyRun();
    assert.deepStrictEqual(
      pressClamp(null, [...clamps, stray(run)], 2, {
        tightened: 0,
        seamsGlued: false,
      }),
      { kind: "pickUp" },
    );
  });
});

describe("concatenatedStrips", () => {
  it("keeps the across order, panels contributing all their strips", () => {
    const p = panel(
      [
        { species: "walnut", width: 2 },
        { species: "maple", width: 3 },
      ],
      24,
      4,
      "rough",
    );
    const cherry = board("cherry", 24, 4, 4, "smooth", { faces: 2, edges: 2 });
    assert.deepStrictEqual(concatenatedStrips([cherry, p]), [
      { species: "cherry", width: 4 },
      { species: "walnut", width: 2 },
      { species: "maple", width: 3 },
    ]);
  });
});
