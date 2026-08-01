import assert from "node:assert";
import { describe, it } from "node:test";
import {
  COMMISSION_SEQUENCE,
  getActiveCommission,
  hasBeenOfferedCommission,
  hasCompletedCommission,
} from "./commissionSequence";
import { initialGameState } from "./initialGameState";

function progressionAt(
  commissionsCompleted: number,
  commissionsOffered?: number,
) {
  return {
    ...initialGameState.progression,
    commissionsCompleted,
    commissionsOffered: commissionsOffered ?? commissionsCompleted + 1,
  };
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

  it("has non-decreasing reputation rewards", () => {
    for (let i = 1; i < COMMISSION_SEQUENCE.length; i++) {
      assert.ok(
        COMMISSION_SEQUENCE[i].rewardReputation >=
          COMMISSION_SEQUENCE[i - 1].rewardReputation,
        `${COMMISSION_SEQUENCE[i].id} should not drop reputation below ${COMMISSION_SEQUENCE[i - 1].id}`,
      );
    }
  });

  it("asks for strictly more reputation with every commission", () => {
    // The first commission is on the clipboard from the start; every
    // later one has a real gate the player has to earn toward.
    assert.strictEqual(COMMISSION_SEQUENCE[0].minReputation, 0);
    for (let i = 1; i < COMMISSION_SEQUENCE.length; i++) {
      assert.ok(
        COMMISSION_SEQUENCE[i].minReputation >
          COMMISSION_SEQUENCE[i - 1].minReputation,
        `${COMMISSION_SEQUENCE[i].id} should gate above ${COMMISSION_SEQUENCE[i - 1].id}`,
      );
    }
  });

  it("keeps every gate above the reputation the commissions alone pay", () => {
    // If completed commissions cleared the next gate by themselves, the
    // phone would ring the moment the payout landed and the between-
    // commission stretch — the point of the gates — would vanish.
    let repFromCommissions = 0;
    for (let i = 1; i < COMMISSION_SEQUENCE.length; i++) {
      repFromCommissions += COMMISSION_SEQUENCE[i - 1].rewardReputation;
      assert.ok(
        COMMISSION_SEQUENCE[i].minReputation > repFromCommissions,
        `${COMMISSION_SEQUENCE[i].id} would arrive instantly at ${repFromCommissions} commission reputation`,
      );
    }
  });

  it("covers the full sequence through the butcher's block finale", () => {
    assert.strictEqual(COMMISSION_SEQUENCE.length, 6);
    assert.strictEqual(
      COMMISSION_SEQUENCE[COMMISSION_SEQUENCE.length - 1].id,
      "the-butchers-block",
    );
  });

  it("never uses non-serializable matches predicates in requirements", () => {
    // Commission requirements must stay declarative so the UI can render
    // them and createMockMaterial can price them.
    for (const commission of COMMISSION_SEQUENCE) {
      for (const requirement of commission.requiredMaterials) {
        assert.strictEqual(
          requirement.matches,
          undefined,
          `${commission.id} uses a matches predicate`,
        );
      }
    }
  });
});

describe("getActiveCommission", () => {
  it("returns the first commission for a new game", () => {
    // initialGameState starts with the first commission already offered
    assert.strictEqual(
      getActiveCommission(initialGameState.progression),
      COMMISSION_SEQUENCE[0],
    );
  });

  it("returns the offered commission at the completed count", () => {
    assert.strictEqual(
      getActiveCommission(progressionAt(2, 3)),
      COMMISSION_SEQUENCE[2],
    );
  });

  it("returns null while waiting for the next call", () => {
    assert.strictEqual(getActiveCommission(progressionAt(2, 2)), null);
  });

  it("returns null when the sequence is finished", () => {
    const done = COMMISSION_SEQUENCE.length;
    assert.strictEqual(getActiveCommission(progressionAt(done, done)), null);
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

describe("hasBeenOfferedCommission", () => {
  it("is true the moment the commission is offered, before delivery", () => {
    assert.strictEqual(
      hasBeenOfferedCommission(progressionAt(0, 1), "first-shelf"),
      true,
    );
    assert.strictEqual(
      hasCompletedCommission(progressionAt(0, 1), "first-shelf"),
      false,
    );
  });

  it("is false while the commission is still waiting on reputation", () => {
    assert.strictEqual(
      hasBeenOfferedCommission(progressionAt(1, 1), "frame-shop-order"),
      false,
    );
  });
});
