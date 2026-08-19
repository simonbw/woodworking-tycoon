import assert from "node:assert";
import { describe, it } from "node:test";
import { initialGameState } from "../initialGameState";
import { xpCostOfLevel } from "../skill-helpers";
import { withXp } from "./skill-actions";

describe("withXp", () => {
  it("accumulates xp", () => {
    const belowFirstLevel = xpCostOfLevel(1) - 1;
    const result = withXp(initialGameState, belowFirstLevel);
    assert.strictEqual(result.progression.xp, belowFirstLevel);
    assert.strictEqual(result.progression.skillPoints, 0);
  });

  it("grants a skill point on level up", () => {
    const result = withXp(initialGameState, xpCostOfLevel(1));
    assert.strictEqual(result.progression.skillPoints, 1);
  });

  it("grants multiple points when a big award crosses several levels", () => {
    const result = withXp(
      initialGameState,
      xpCostOfLevel(1) + xpCostOfLevel(2),
    );
    assert.strictEqual(result.progression.skillPoints, 2);
  });

  it("does nothing for zero xp", () => {
    assert.strictEqual(withXp(initialGameState, 0), initialGameState);
  });
});
