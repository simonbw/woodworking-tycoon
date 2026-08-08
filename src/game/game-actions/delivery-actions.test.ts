import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "../board-helpers";
import { COMMISSION_SEQUENCE } from "../commissionSequence";
import { readyHandoffs } from "../delivery";
import { AcceptedJob, GameState } from "../GameState";
import { initialGameState } from "../initialGameState";
import { truckCabSideCell } from "../lot";
import { makeMaterial } from "../material-helpers";
import { FinishedProduct, MaterialInstance } from "../Materials";
import { TICKS_PER_DAY } from "../time";
import { currentTutorialStep } from "../tutorial";
import { DRIVE_TICKS_ONE_WAY } from "./door-actions";
import {
  returnFromDeliveryAction,
  startDeliveryAction,
} from "./delivery-actions";

function makeShelf(): FinishedProduct {
  return makeMaterial<FinishedProduct>({
    type: "rusticShelf",
    species: "pallet",
  });
}

/**
 * State part-way through the sequence, with the given number of commissions
 * done, the deliverables loaded in the truck's bed, and the player standing
 * at the cab — a delivery run starts there (see delivery.ts).
 */
function stateAtCommission(
  commissionsCompleted: number,
  bed: ReadonlyArray<MaterialInstance>,
  overrides: Partial<GameState> = {},
): GameState {
  const state: GameState = {
    ...initialGameState,
    progression: {
      ...initialGameState.progression,
      commissionsCompleted,
      // The commission being delivered has been offered and is active
      commissionsOffered: commissionsCompleted + 1,
      storeUnlocked: commissionsCompleted >= 1,
    },
    ...overrides,
  };
  return {
    ...state,
    truck: { ...state.truck, bed },
    player: { ...state.player, position: truckCabSideCell(state.shopInfo) },
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

/** Take the first ready handoff out and drive back, as the overlay does. */
function deliver(state: GameState): GameState {
  const handoff = readyHandoffs(state)[0];
  if (!handoff) {
    return state;
  }
  return returnFromDeliveryAction()(startDeliveryAction(handoff)(state));
}

describe("the delivery run", () => {
  it("takes the goods out of the bed and puts the player on the road", () => {
    const state = stateAtCommission(0, [makeShelf()]);
    const out = startDeliveryAction(readyHandoffs(state)[0])(state);

    assert.strictEqual(out.player.away?.kind, "delivering");
    assert.deepStrictEqual(out.truck.bed, []);
    // Nothing has been paid yet — that settles when the truck comes back.
    assert.strictEqual(out.money, state.money);
    assert.strictEqual(out.progression.commissionsCompleted, 0);
  });

  it("charges both legs of the drive", () => {
    const state = stateAtCommission(0, [makeShelf()]);
    const out = startDeliveryAction(readyHandoffs(state)[0])(state);
    assert.strictEqual(out.tick, state.tick + DRIVE_TICKS_ONE_WAY);

    const home = returnFromDeliveryAction()(out);
    assert.strictEqual(home.tick, state.tick + DRIVE_TICKS_ONE_WAY * 2);
  });

  it("comes home to the cab, off the road", () => {
    const state = stateAtCommission(0, [makeShelf()]);
    const home = deliver(state);
    assert.strictEqual(home.player.away, null);
    assert.deepStrictEqual(
      home.player.position,
      truckCabSideCell(state.shopInfo),
    );
  });

  it("refuses to set out after close", () => {
    // The day's budget spent: the only place left to drive is home.
    const state = stateAtCommission(0, [makeShelf()], {
      tick: TICKS_PER_DAY,
      dayStartTick: 0,
    });
    const commission = COMMISSION_SEQUENCE[0];
    const out = startDeliveryAction({ kind: "commission", commission })(state);
    assert.strictEqual(out, state);
  });

  it("refuses to set out from anywhere but the cab", () => {
    const state = stateAtCommission(0, [makeShelf()]);
    const inTheMiddle: GameState = {
      ...state,
      player: { ...state.player, position: [1, 1] },
    };
    const commission = COMMISSION_SEQUENCE[0];
    assert.strictEqual(
      startDeliveryAction({ kind: "commission", commission })(inTheMiddle),
      inTheMiddle,
    );
  });

  it("refuses an order the bed doesn't cover", () => {
    const state = stateAtCommission(0, []);
    const commission = COMMISSION_SEQUENCE[0];
    assert.strictEqual(
      startDeliveryAction({ kind: "commission", commission })(state),
      state,
    );
  });

  it("does nothing when the truck isn't out on a delivery", () => {
    const state = stateAtCommission(0, [makeShelf()]);
    assert.strictEqual(returnFromDeliveryAction()(state), state);
  });
});

describe("delivering a commission", () => {
  const firstCommission = COMMISSION_SEQUENCE[0];

  it("pays the commission's reward and reputation", () => {
    const state = stateAtCommission(0, [makeShelf()]);
    const result = deliver(state);
    assert.strictEqual(result.money, firstCommission.rewardMoney);
    assert.strictEqual(result.reputation, firstCommission.rewardReputation);
  });

  it("awards craft XP for the commission", () => {
    const result = deliver(stateAtCommission(0, [makeShelf()]));
    assert.strictEqual(
      result.progression.xp,
      Math.round(firstCommission.rewardMoney / 5),
    );
  });

  it("advances to the next commission in the sequence", () => {
    const result = deliver(stateAtCommission(0, [makeShelf()]));
    assert.strictEqual(result.progression.commissionsCompleted, 1);
  });

  it("takes only the required materials out of the bed", () => {
    const extraShelf = makeShelf();
    const result = deliver(stateAtCommission(0, [makeShelf(), extraShelf]));
    assert.deepStrictEqual(result.truck.bed, [extraShelf]);
  });

  it("unlocks the store after the first commission", () => {
    const result = deliver(stateAtCommission(0, [makeShelf()]));
    assert.strictEqual(result.progression.storeUnlocked, true);
    // The handoff is the tutorial's fifth step; the coach moves on to the
    // marketplace half in the same pass
    assert.strictEqual(currentTutorialStep(result)?.id, "buildSecondShelf");
  });

  it("unlocks the marketplace with the first commission too", () => {
    // The phone arrives with the first payday: the job board is how the
    // second commission's pile of gear gets funded
    const result = deliver(stateAtCommission(0, [makeShelf()]));
    assert.strictEqual(result.progression.marketplaceUnlocked, true);
    // No machine grant — the marketplace is a tab, not equipment
    assert.deepStrictEqual(result.machineCrates, []);
  });

  it("delivers the frame shop order from the bed", () => {
    // Commission 2 requires one assembled rustic frame — the loose rails
    // it's built from are worth nothing to a client on their own
    const frame = makeMaterial<FinishedProduct>({
      type: "rusticFrame",
      species: "pallet",
    });
    const result = deliver(stateAtCommission(1, [frame]));
    assert.strictEqual(result.progression.commissionsCompleted, 2);
  });

  it("refuses the frame shop order when only the rails are in the bed", () => {
    const rails = Array.from({ length: 4 }, () =>
      board("pallet", 24, 2, 2, "sanded"),
    );
    const state = stateAtCommission(1, rails);
    assert.strictEqual(deliver(state), state);
  });

  it("does nothing, including progression, when materials are missing", () => {
    const state = stateAtCommission(0, []);
    const result = deliver(state);
    assert.strictEqual(result, state);
    assert.strictEqual(result.progression.commissionsCompleted, 0);
    assert.strictEqual(result.progression.storeUnlocked, false);
  });

  it("does nothing when the sequence is exhausted", () => {
    const state = stateAtCommission(COMMISSION_SEQUENCE.length, [makeShelf()]);
    assert.strictEqual(deliver(state), state);
  });
});

describe("delivering a job", () => {
  it("strikes the job off and pays base plus tip", () => {
    const state = stateAtCommission(1, [makeShelf()], {
      tick: 0,
      acceptedJobs: [shelfJob],
    });
    const result = deliver(state);
    assert.deepStrictEqual(result.acceptedJobs, []);
    assert.deepStrictEqual(result.truck.bed, []);
    // Full tip on a job driven straight over: 100 * 1.4, and double
    // reputation while none of the tip has decayed
    assert.strictEqual(result.money, state.money + 140);
    assert.strictEqual(result.reputation, state.reputation + 2);
    assert.ok(result.progression.xp > 0);
  });

  it("quotes the tip at the cab, not at the customer's door", () => {
    // The drive out is what the tip would decay over — the price is
    // struck when the truck pulls out, so the cab's card doesn't lie.
    const state = stateAtCommission(1, [makeShelf()], {
      tick: 0,
      acceptedJobs: [shelfJob],
    });
    const out = startDeliveryAction(readyHandoffs(state)[0])(state);
    const order =
      out.player.away?.kind === "delivering" && out.player.away.order;
    assert.ok(order);
    assert.strictEqual(order.payout.money, 140);
    assert.strictEqual(returnFromDeliveryAction()(out).money, 140);
  });

  it("does nothing when the bed is empty", () => {
    const state = stateAtCommission(1, [], { acceptedJobs: [shelfJob] });
    assert.strictEqual(deliver(state), state);
  });
});
