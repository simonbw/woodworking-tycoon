import assert from "node:assert";
import { describe, it } from "node:test";
import { clipArcToRect, ClipRect } from "./arcClipping";

const UNIT_SQUARE: ClipRect = { x: -1, y: -1, width: 2, height: 2 };

function pointsInside(
  spans: [number, number][],
  cx: number,
  cy: number,
  r: number,
  rect: ClipRect,
): boolean {
  return spans.every(([from, to]) =>
    [from + 1e-6, (from + to) / 2, to - 1e-6].every((a) => {
      const x = cx + r * Math.cos(a);
      const y = cy + r * Math.sin(a);
      return (
        x >= rect.x - 1e-6 &&
        x <= rect.x + rect.width + 1e-6 &&
        y >= rect.y - 1e-6 &&
        y <= rect.y + rect.height + 1e-6
      );
    }),
  );
}

describe("clipArcToRect", () => {
  it("keeps a whole arc that never leaves the rect", () => {
    const spans = clipArcToRect(0, 0, 0.5, 0, Math.PI * 2, UNIT_SQUARE);
    assert.deepStrictEqual(spans, [[0, Math.PI * 2]]);
  });

  it("drops an arc that never enters the rect", () => {
    const spans = clipArcToRect(10, 10, 1, 0, Math.PI * 2, UNIT_SQUARE);
    assert.deepStrictEqual(spans, []);
  });

  it("drops an arc that encircles the rect without touching it", () => {
    const spans = clipArcToRect(0, 0, 5, 0, Math.PI * 2, UNIT_SQUARE);
    assert.deepStrictEqual(spans, []);
  });

  it("cuts a circle that straddles one edge into a single span", () => {
    // Centered on the right edge, so only the left half of the circle is in.
    const spans = clipArcToRect(1, 0, 0.5, 0, Math.PI * 2, UNIT_SQUARE);
    assert.strictEqual(spans.length, 1);
    const [[from, to]] = spans;
    assert.ok(to - from > 0);
    assert.ok(
      Math.abs(to - from - Math.PI) < 1e-6,
      `expected half the sweep, got ${to - from}`,
    );
    assert.ok(pointsInside(spans, 1, 0, 0.5, UNIT_SQUARE));
  });

  it("returns several spans when a big circle crosses a thin strip twice", () => {
    // A strip much wider than it is tall, with a ring sweeping through it.
    const strip: ClipRect = { x: -10, y: -1, width: 20, height: 2 };
    const spans = clipArcToRect(0, 4, 6, 0, Math.PI * 2, strip);
    assert.strictEqual(spans.length, 2);
    assert.ok(pointsInside(spans, 0, 4, 6, strip));
  });

  it("only reports spans within the requested sweep", () => {
    const spans = clipArcToRect(0, 0, 0.5, Math.PI, Math.PI * 2, UNIT_SQUARE);
    assert.deepStrictEqual(spans, [[Math.PI, Math.PI * 2]]);
  });

  it("clips a sweep that starts outside the rect", () => {
    const strip: ClipRect = { x: -10, y: -1, width: 20, height: 2 };
    const spans = clipArcToRect(0, 4, 6, Math.PI, Math.PI * 2, strip);
    assert.ok(spans.length >= 1);
    assert.ok(
      spans.every(([from, to]) => from >= Math.PI && to <= Math.PI * 2),
    );
    assert.ok(pointsInside(spans, 0, 4, 6, strip));
  });

  it("ignores a degenerate radius or a backwards sweep", () => {
    assert.deepStrictEqual(clipArcToRect(0, 0, 0, 0, Math.PI, UNIT_SQUARE), []);
    assert.deepStrictEqual(clipArcToRect(0, 0, 1, Math.PI, 0, UNIT_SQUARE), []);
  });
});
