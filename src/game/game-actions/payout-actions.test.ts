import assert from "node:assert";
import { describe, it } from "node:test";
import { initialGameState } from "../initialGameState";
import { emitPayout } from "./payout-actions";

const sale = {
  kind: "sale" as const,
  title: "Rustic Shelf",
  money: 9,
  reputation: 1.5,
  xp: 0,
};

describe("payout announcements", () => {
  it("gives one sale one id however often the emitter is re-run", () => {
    // Actions run as `setGameState` updaters, and React may invoke an
    // updater more than once against the same base state. Both invocations
    // have to describe the same payday, or the flight layer stages it
    // twice and the rewards fly twice (#159).
    const first = emitPayout(initialGameState, sale);
    const again = emitPayout(initialGameState, sale);
    assert.strictEqual(
      (first.pendingPayouts ?? [])[0].id,
      (again.pendingPayouts ?? [])[0].id,
    );
  });

  it("gives two sales in one tick distinct ids", () => {
    const twice = emitPayout(emitPayout(initialGameState, sale), sale);
    const [a, b] = twice.pendingPayouts ?? [];
    assert.notStrictEqual(a.id, b.id);
  });
});
