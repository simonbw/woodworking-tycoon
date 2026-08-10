import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "../board-helpers";
import { BenchPlacement } from "./bench-layout";
import {
  advanceFlipPhase,
  atFlipStop,
  FLIP_STOP_HINTS,
  FLIP_STOPS,
  flipStopOf,
  flipStopSize,
  nextFlipStop,
  stopAtPhase,
  tumbleFrame,
  tumbles,
} from "./flip-cycle";
import { placedPieceSize } from "./workpiece";

const flat: BenchPlacement = {
  xIn: 10,
  yIn: 10,
  angleDeg: 0,
  flipped: false,
};

// 24" long, 2" wide, 6/4 (1.5") thick — so the three stops each cover a
// different footprint and none of them can be confused for another.
const plank = board("oak", 24, 2, 6);

describe("the flip cycle", () => {
  it("runs flat → on edge → on end → flat", () => {
    assert.strictEqual(flipStopOf({}), 0);
    assert.strictEqual(flipStopOf({ onEdge: true }), 1);
    assert.strictEqual(flipStopOf({ onEnd: true }), 2);
    assert.strictEqual(nextFlipStop(0), 1);
    assert.strictEqual(nextFlipStop(1), 2);
    assert.strictEqual(nextFlipStop(2), 0);
  });

  it("clears the stop it leaves", () => {
    const onEdge = atFlipStop(flat, 1);
    assert.deepStrictEqual(
      { onEdge: onEdge.onEdge, onEnd: onEdge.onEnd },
      { onEdge: true, onEnd: false },
    );
    const onEnd = atFlipStop(onEdge, 2);
    assert.deepStrictEqual(
      { onEdge: onEnd.onEdge, onEnd: onEnd.onEnd },
      { onEdge: false, onEnd: true },
    );
    const backFlat = atFlipStop(onEnd, 0);
    assert.deepStrictEqual(
      { onEdge: backFlat.onEdge, onEnd: backFlat.onEnd },
      { onEdge: false, onEnd: false },
    );
  });

  it("keeps everything else about the placement, so three presses land where they started", () => {
    const turned: BenchPlacement = { ...flat, angleDeg: 96, xIn: 3, yIn: 4 };
    let placement = turned;
    for (let i = 0; i < 3; i++) {
      placement = atFlipStop(placement, nextFlipStop(flipStopOf(placement)));
    }
    assert.deepStrictEqual(placement, {
      ...turned,
      onEdge: false,
      onEnd: false,
    });
  });

  it("only boards tumble", () => {
    assert.strictEqual(tumbles(plank), true);
    assert.strictEqual(tumbles({ ...plank, type: "panel" } as never), false);
  });

  it("names the stop F is about to reach", () => {
    assert.strictEqual(FLIP_STOP_HINTS.length, FLIP_STOPS.length);
    assert.strictEqual(FLIP_STOP_HINTS[nextFlipStop(0)], "stand on edge");
    assert.strictEqual(FLIP_STOP_HINTS[nextFlipStop(1)], "stand on end");
    assert.strictEqual(FLIP_STOP_HINTS[nextFlipStop(2)], "lay flat");
  });
});

describe("the tumble phase", () => {
  it("accumulates forward one leg at a time", () => {
    assert.strictEqual(advanceFlipPhase(0, 1), 1);
    assert.strictEqual(advanceFlipPhase(1, 2), 2);
    // Round the cycle: the phase keeps climbing rather than unwinding
    assert.strictEqual(advanceFlipPhase(2, 0), 3);
    assert.strictEqual(advanceFlipPhase(3, 1), 4);
  });

  it("holds still when the piece is already at that stop", () => {
    assert.strictEqual(advanceFlipPhase(4, 1), 4);
  });

  it("tumbles through the stop between when a piece jumps two", () => {
    // An assembly snap seats a leg straight onto its end
    assert.strictEqual(advanceFlipPhase(0, 2), 2);
    assert.strictEqual(advanceFlipPhase(1, 0), 3);
  });

  it("reads its stop off the accumulated phase", () => {
    assert.strictEqual(stopAtPhase(0), 0);
    assert.strictEqual(stopAtPhase(2), 2);
    assert.strictEqual(stopAtPhase(3), 0);
    assert.strictEqual(stopAtPhase(4.5), 1);
  });
});

describe("the tumble frame", () => {
  it("draws exactly placedPieceSize at every stop", () => {
    for (let stop = 0; stop < FLIP_STOPS.length; stop++) {
      const size = flipStopSize(plank, stop);
      assert.deepStrictEqual(size, placedPieceSize(plank, FLIP_STOPS[stop]!));
      const frame = tumbleFrame(plank, stop);
      assert.strictEqual(frame.widthIn, size.widthIn);
      assert.strictEqual(frame.heightIn, size.heightIn);
      assert.strictEqual(frame.fade, 0);
      assert.strictEqual(frame.lift, 1);
    }
  });

  it("arrives at the next stop's footprint by the end of the leg", () => {
    const nearlyThere = tumbleFrame(plank, 0.999999);
    const arrived = flipStopSize(plank, 1);
    assert.ok(Math.abs(nearlyThere.widthIn - arrived.widthIn) < 0.001);
    assert.ok(Math.abs(nearlyThere.heightIn - arrived.heightIn) < 0.001);
  });

  it("narrows the face into the edge without touching the length", () => {
    // Flat → on edge is a pure roll about the long axis: only the width
    // across the bench moves.
    const mid = tumbleFrame(plank, 0.5);
    assert.strictEqual(mid.fromStop, 0);
    assert.strictEqual(mid.toStop, 1);
    assert.strictEqual(mid.heightIn, plank.length);
    assert.ok(mid.widthIn < plank.width);
    assert.ok(mid.widthIn > plank.thickness / 4);
  });

  it("tips the piece over before it settles across", () => {
    // Edge → on end: the length foreshortens away first (the tip), and
    // the width only spreads once the piece is most of the way over.
    const early = tumbleFrame(plank, 1.2);
    assert.ok(early.heightIn < plank.length, "the tip has started");
    assert.strictEqual(
      early.widthIn,
      plank.thickness / 4,
      "the settle has not",
    );
    const late = tumbleFrame(plank, 1.9);
    assert.ok(late.widthIn > plank.thickness / 4, "the settle has started");
  });

  it("lifts off the bench at the top of the tumble and lands flat again", () => {
    assert.ok(tumbleFrame(plank, 0.5).lift > 1);
    assert.ok(Math.abs(tumbleFrame(plank, 0.999999).lift - 1) < 0.001);
  });
});
