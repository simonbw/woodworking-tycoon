import assert from "node:assert";
import { describe, it } from "node:test";
import {
  COMMISSION_SEQUENCE,
  getActiveCommission,
  hasCompletedCommission,
} from "./commissionSequence";
import { initialGameState } from "./initialGameState";

function progressionAt(commissionsCompleted: number) {
  return { ...initialGameState.progression, commissionsCompleted };
}

describe("COMMISSION_SEQUENCE", () => {
  it("has unique ids", () => {
    const ids = COMMISSION_SEQUENCE.map((c) => c.id);
    assert.strictEqual(new Set(ids).size, ids.length);
  });

  it("has strictly increasing rewards", () => {
    for (let i = 1; i < COMMISSION_SEQUENCE.length; i++) {
      assert.ok(
        COMMISSION_SEQUENCE[i].rewardMoney >
          COMMISSION_SEQUENCE[i - 1].rewardMoney,
        `${COMMISSION_SEQUENCE[i].id} should pay more than ${COMMISSION_SEQUENCE[i - 1].id}`,
      );
    }
  });
});

describe("getActiveCommission", () => {
  it("returns the first commission for a new game", () => {
    assert.strictEqual(
      getActiveCommission(progressionAt(0)),
      COMMISSION_SEQUENCE[0],
    );
  });

  it("returns the commission at the completed count", () => {
    assert.strictEqual(
      getActiveCommission(progressionAt(2)),
      COMMISSION_SEQUENCE[2],
    );
  });

  it("returns null when the sequence is finished", () => {
    assert.strictEqual(
      getActiveCommission(progressionAt(COMMISSION_SEQUENCE.length)),
      null,
    );
  });
});

describe("hasCompletedCommission", () => {
  it("is false for the active commission", () => {
    assert.strictEqual(
      hasCompletedCommission(progressionAt(0), "first-shelf"),
      false,
    );
  });

  it("is true for commissions before the active one", () => {
    assert.strictEqual(
      hasCompletedCommission(progressionAt(1), "first-shelf"),
      true,
    );
  });

  it("is false for unknown ids", () => {
    assert.strictEqual(
      hasCompletedCommission(progressionAt(99), "not-a-commission"),
      false,
    );
  });
});
