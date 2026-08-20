import assert from "node:assert";
import { describe, it } from "node:test";
import { V } from "../Vector";
import { isCCW } from "./MathUtil";

describe("isCCW", () => {
  it("agrees on a polygon whose orientation is obvious without the closing edge", () => {
    // A clockwise square (in y-down screen coordinates the winding reads
    // clockwise going right, down, left, up).
    const clockwiseSquare = [V(0, 0), V(0, 1), V(1, 1), V(1, 0)];
    assert.strictEqual(isCCW(clockwiseSquare), true);
    assert.strictEqual(
      isCCW([...clockwiseSquare].reverse()),
      false,
      "reversing the winding flips the answer",
    );
  });

  it("accounts for the closing edge back to the first point", () => {
    // Translated far from the origin so the edge from the last point back
    // to the first carries real weight: summing only the interior edges
    // (points[0]->points[1], points[1]->points[2]) gives the wrong answer
    // here, and only including the last->first edge gets it right.
    const points = [V(100, 100), V(101, 100), V(101, 101)];
    assert.strictEqual(isCCW(points), false);
  });
});
