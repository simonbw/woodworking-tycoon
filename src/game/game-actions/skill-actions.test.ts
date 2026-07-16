import assert from "node:assert";
import { describe, it } from "node:test";
import { GameState } from "../GameState";
import { initialGameState } from "../initialGameState";
import { STARTER_SKILLS } from "../Skill";
import { xpCostOfLevel } from "../skill-helpers";
import { spendSkillPointAction, withXp } from "./skill-actions";

function stateWithPoints(skillPoints: number): GameState {
  return {
    ...initialGameState,
    progression: { ...initialGameState.progression, skillPoints },
  };
}

describe("withXp", () => {
  it("accumulates xp", () => {
    const result = withXp(initialGameState, 50);
    assert.strictEqual(result.progression.xp, 50);
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

describe("spendSkillPointAction", () => {
  it("unlocks the skill and spends the point", () => {
    const result = spendSkillPointAction("fineShelving")(stateWithPoints(1));
    assert.ok(result.progression.unlockedSkills.includes("fineShelving"));
    assert.strictEqual(result.progression.skillPoints, 0);
  });

  it("refuses without a point", () => {
    const state = stateWithPoints(0);
    assert.strictEqual(spendSkillPointAction("fineShelving")(state), state);
  });

  it("refuses when prerequisites are missing", () => {
    // boxJoinery requires fineShelving, which isn't unlocked yet
    const state = stateWithPoints(5);
    assert.strictEqual(spendSkillPointAction("boxJoinery")(state), state);
  });

  it("allows the chain once prerequisites are bought", () => {
    let state: GameState = stateWithPoints(2);
    state = spendSkillPointAction("fineShelving")(state);
    state = spendSkillPointAction("boxJoinery")(state);
    assert.ok(state.progression.unlockedSkills.includes("boxJoinery"));
    assert.strictEqual(state.progression.skillPoints, 0);
  });

  it("refuses to buy an already-owned starter skill", () => {
    const state = stateWithPoints(1);
    assert.strictEqual(
      spendSkillPointAction(STARTER_SKILLS[0])(state),
      state,
    );
  });
});
