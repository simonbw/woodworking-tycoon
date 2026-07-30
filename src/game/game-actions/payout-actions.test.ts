import assert from "node:assert";
import { describe, it } from "node:test";
import { COMMISSION_SEQUENCE } from "../commissionSequence";
import { AcceptedJob, GameState } from "../GameState";
import { initialGameState } from "../initialGameState";
import { truckCabSideCell } from "../lot";
import { FinishedProduct, MaterialInstance } from "../Materials";
import { makeMaterial } from "../material-helpers";
import { deliverJobAction } from "./marketplace-actions";
import { clearPendingPayoutsAction } from "./payout-actions";
import { completeCommissionAction } from "./store-actions";

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
    const result = completeCommissionAction()(atCab([shelf()]));
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
    const result = deliverJobAction(shelfJob.id)(state);
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
    const result = completeCommissionAction()(atCab([]));
    assert.deepStrictEqual(result.pendingPayouts ?? [], []);
  });

  it("announces nothing away from the cab", () => {
    const state = atCab([shelf()]);
    const inTheMiddle: GameState = {
      ...state,
      player: { ...state.player, position: [1, 1] },
    };
    const result = completeCommissionAction()(inTheMiddle);
    assert.deepStrictEqual(result.pendingPayouts ?? [], []);
    assert.strictEqual(result.money, state.money);
  });

  it("clears the queue once the flight layer has picked it up", () => {
    const delivered = completeCommissionAction()(atCab([shelf()]));
    const drained = clearPendingPayoutsAction(delivered);
    assert.deepStrictEqual(drained.pendingPayouts, []);
  });

  it("leaves an already-empty queue's identity alone", () => {
    const state = atCab([]);
    assert.strictEqual(clearPendingPayoutsAction(state), state);
  });
});
