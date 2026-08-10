import assert from "node:assert";
import { describe, it } from "node:test";
import { COMMISSION_SEQUENCE } from "../commissionSequence";
import { AcceptedJob, GameState } from "../GameState";
import { initialGameState } from "../initialGameState";
import { truckCabSideCell } from "../lot";
import { FinishedProduct, MaterialInstance } from "../Materials";
import { makeMaterial } from "../material-helpers";
import { readyHandoffs } from "../delivery";
import {
  returnFromDeliveryAction,
  startDeliveryAction,
} from "./delivery-actions";
import { clearPendingPayoutsAction } from "./payout-actions";

/**
 * Drive a ready handoff out and back. The announcement is made on the
 * way in, not at the cab — the reward flight aims at readouts that are
 * only on screen once the truck is home.
 */
function deliver(
  state: GameState,
  kind: "commission" | "job" = "commission",
): GameState {
  const handoff = readyHandoffs(state).find((ready) => ready.kind === kind);
  if (!handoff) {
    return state;
  }
  return returnFromDeliveryAction()(startDeliveryAction(handoff)(state));
}

function shelf(): FinishedProduct {
  return makeMaterial<FinishedProduct>({
    type: "rusticShelf",
    species: "pallet",
  });
}

function atCab(
  bed: ReadonlyArray<MaterialInstance>,
  overrides: Partial<GameState> = {},
): GameState {
  const base = { ...initialGameState, ...overrides };
  return {
    ...base,
    truck: { ...base.truck, bed },
    player: {
      ...base.player,
      position: truckCabSideCell(base.shopInfo),
    },
  };
}

const shelfJob: AcceptedJob = {
  id: "job-1",
  name: "Marisol Vega",
  description: "Wants a shelf.",
  requiredMaterials: [
    { type: ["rusticShelf"], species: ["pallet"], quantity: 1 },
  ],
  basePay: 100,
  baseReputation: 1,
  postedAtTick: 0,
  materialCostFree: true,
  acceptedAtTick: 0,
};

describe("payout announcements", () => {
  it("a commission handoff announces its rewards and the client's line", () => {
    const commission = COMMISSION_SEQUENCE[0];
    const result = deliver(atCab([shelf()]));
    const payouts = result.pendingPayouts ?? [];

    assert.strictEqual(payouts.length, 1);
    assert.strictEqual(payouts[0].kind, "commission");
    assert.strictEqual(payouts[0].title, commission.name);
    assert.strictEqual(payouts[0].money, commission.rewardMoney);
    assert.strictEqual(payouts[0].reputation, commission.rewardReputation);
    assert.strictEqual(payouts[0].xp, Math.round(commission.rewardMoney / 5));
    assert.strictEqual(payouts[0].client, commission.client);
    assert.strictEqual(payouts[0].dialogue, commission.thanks);
  });

  it("announces what the player was actually paid, not the base rate", () => {
    // Delivered fresh, so the whole tip is still on the table.
    const state = atCab([shelf()], { tick: 0, acceptedJobs: [shelfJob] });
    const result = deliver(state, "job");
    const payout = (result.pendingPayouts ?? [])[0];

    assert.strictEqual(payout.kind, "job");
    assert.strictEqual(payout.title, shelfJob.name);
    assert.ok(payout.money > shelfJob.basePay);
    assert.strictEqual(payout.money, result.money);
    // No client card for routine work.
    assert.strictEqual(payout.dialogue, undefined);
  });

  it("announces nothing when the handoff is refused", () => {
    // Empty-handed: the commission can't be delivered, so nothing to show.
    const result = deliver(atCab([]));
    assert.deepStrictEqual(result.pendingPayouts ?? [], []);
  });

  it("announces nothing away from the cab", () => {
    const state = atCab([shelf()]);
    const inTheMiddle: GameState = {
      ...state,
      player: { ...state.player, position: [1, 1] },
    };
    const result = deliver(inTheMiddle);
    assert.deepStrictEqual(result.pendingPayouts ?? [], []);
    assert.strictEqual(result.money, state.money);
  });

  it("gives one handoff one id however often the action is re-run", () => {
    // Actions run as `setGameState` updaters, and React may invoke an
    // updater more than once against the same base state. Both invocations
    // have to describe the same payday, or the flight layer stages it twice
    // and the client's card is dealt twice (#159).
    const state = atCab([shelf()]);
    const first = deliver(state);
    const again = deliver(state);

    assert.strictEqual(
      (first.pendingPayouts ?? [])[0].id,
      (again.pendingPayouts ?? [])[0].id,
    );
  });

  it("clears the queue once the flight layer has picked it up", () => {
    const delivered = deliver(atCab([shelf()]));
    const drained = clearPendingPayoutsAction(delivered);
    assert.deepStrictEqual(drained.pendingPayouts, []);
  });

  it("leaves an already-empty queue's identity alone", () => {
    const state = atCab([]);
    assert.strictEqual(clearPendingPayoutsAction(state), state);
  });
});
