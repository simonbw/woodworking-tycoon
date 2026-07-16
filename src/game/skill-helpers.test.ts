import assert from "node:assert";
import { describe, it } from "node:test";
import { initialGameState } from "./initialGameState";
import { getMachines } from "./Machine";
import { STARTER_SKILLS } from "./Skill";
import {
  availableOperations,
  getOperationDuration,
  levelForXp,
  xpCostOfLevel,
  xpProgress,
} from "./skill-helpers";

describe("level curve", () => {
  it("starts at level 1 with 0 xp", () => {
    assert.strictEqual(levelForXp(0), 1);
  });

  it("levels up when the cumulative cost is met", () => {
    assert.strictEqual(levelForXp(xpCostOfLevel(1) - 1), 1);
    assert.strictEqual(levelForXp(xpCostOfLevel(1)), 2);
    assert.strictEqual(levelForXp(xpCostOfLevel(1) + xpCostOfLevel(2)), 3);
  });

  it("charges more for each successive level", () => {
    for (let level = 1; level < 10; level++) {
      assert.ok(xpCostOfLevel(level + 1) > xpCostOfLevel(level));
    }
  });

  it("reports progress toward the next level", () => {
    const progress = xpProgress(xpCostOfLevel(1) + 10);
    assert.strictEqual(progress.current, 10);
    assert.strictEqual(progress.needed, xpCostOfLevel(2));
  });
});

describe("availableOperations", () => {
  const workspace = getMachines(initialGameState.machines)[0];

  it("includes starter-skill recipes from the start", () => {
    const ids = availableOperations(
      workspace,
      initialGameState.progression,
    ).map((op) => op.id);
    assert.ok(ids.includes("dismantlePallet"));
    assert.ok(ids.includes("buildRusticPalletShelf"));
    assert.ok(ids.includes("glueUpPanel"));
  });

  it("hides recipes whose skill is not unlocked", () => {
    const ids = availableOperations(
      workspace,
      initialGameState.progression,
    ).map((op) => op.id);
    assert.ok(!ids.includes("buildShelf"));
    assert.ok(!ids.includes("finishTwoToneBoard"));
  });

  it("reveals a recipe once its skill is unlocked", () => {
    const progression = {
      ...initialGameState.progression,
      unlockedSkills: [...STARTER_SKILLS, "fineShelving" as const],
    };
    const ids = availableOperations(workspace, progression).map((op) => op.id);
    assert.ok(ids.includes("buildShelf"));
  });
});

describe("getOperationDuration", () => {
  const workspace = getMachines(initialGameState.machines)[0];
  const glueUp = workspace.operations.find((op) => op.id === "glueUpPanel")!;

  it("uses the base duration without the passive skill", () => {
    assert.strictEqual(
      getOperationDuration(glueUp, initialGameState.progression),
      glueUp.duration,
    );
  });

  it("shortens glue-ups with quick-dry glue", () => {
    const progression = {
      ...initialGameState.progression,
      unlockedSkills: [...STARTER_SKILLS, "quickDryGlue" as const],
    };
    assert.strictEqual(
      getOperationDuration(glueUp, progression),
      Math.round(glueUp.duration * 0.6),
    );
  });
});
