import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "../board-helpers";
import { COMMISSION_SEQUENCE } from "../commissionSequence";
import { GameState } from "../GameState";
import { MaterialInstance, FinishedProduct } from "../Materials";
import { initialGameState } from "../initialGameState";
import { makeMaterial } from "../material-helpers";
import { truckCabSideCell } from "../lot";
import { currentTutorialStep } from "../tutorial";
import {
  buyMachineAction,
  buyMaterialAction,
  completeCommissionAction,
  sellMaterialAction,
} from "./store-actions";

function makeShelf(): FinishedProduct {
  return makeMaterial<FinishedProduct>({
    type: "rusticShelf",
    species: "pallet",
  });
}

function stateWith(
  overrides: Partial<GameState>,
  inventory?: ReadonlyArray<MaterialInstance>,
): GameState {
  const state = { ...initialGameState, ...overrides };
  if (inventory) {
    return { ...state, player: { ...state.player, inventory } };
  }
  return state;
}

/**
 * State part-way through the sequence, with the given number of commissions
 * done, the deliverables loaded in the truck's bed, and the player standing
 * at the cab — delivering only happens there (see delivery.ts).
 */
function stateAtCommission(
  commissionsCompleted: number,
  bed: ReadonlyArray<MaterialInstance>,
): GameState {
  const state = stateWith({
    progression: {
      ...initialGameState.progression,
      commissionsCompleted,
      // The commission being delivered has been offered and is active
      commissionsOffered: commissionsCompleted + 1,
      storeUnlocked: commissionsCompleted >= 1,
    },
  });
  return {
    ...state,
    truck: { ...state.truck, bed },
    player: {
      ...state.player,
      position: truckCabSideCell(state.shopInfo),
    },
  };
}

describe("buyMaterialAction", () => {
  it("deducts the price and loads the material into the truck's bed", () => {
    const shelf = makeShelf();
    const result = buyMaterialAction(shelf, 30)(stateWith({ money: 100 }));
    assert.strictEqual(result.money, 70);
    assert.deepStrictEqual(result.truck.bed, [shelf]);
    assert.deepStrictEqual(result.player.inventory, []);
  });

  it("does nothing when the player cannot afford it", () => {
    const state = stateWith({ money: 10 });
    const result = buyMaterialAction(makeShelf(), 30)(state);
    assert.strictEqual(result, state);
  });
});

describe("sellMaterialAction", () => {
  it("removes the material and adds the price to money", () => {
    const shelf = makeShelf();
    const state = stateWith({ money: 5 }, [shelf]);
    const result = sellMaterialAction(shelf, 60)(state);
    assert.strictEqual(result.money, 65);
    assert.deepStrictEqual(result.player.inventory, []);
  });

  it("does nothing when the material is not in the inventory", () => {
    const state = stateWith({ money: 5 }, []);
    const result = sellMaterialAction(makeShelf(), 60)(state);
    assert.strictEqual(result, state);
  });
});

describe("buyMachineAction", () => {
  it("deducts the price and crates the machine into the truck's bed", () => {
    const result = buyMachineAction(
      "jobsiteTableSaw",
      150,
    )(stateWith({ money: 200 }));
    assert.strictEqual(result.money, 50);
    assert.strictEqual(result.truck.crates.length, 1);
    assert.strictEqual(result.truck.crates[0].machineTypeId, "jobsiteTableSaw");
    // Nothing lands on the shop floor until it's carried in
    assert.strictEqual(result.machineCrates.length, 0);
  });

  it("does nothing when the player cannot afford it", () => {
    const state = stateWith({ money: 100 });
    const result = buyMachineAction("miterSaw", 150)(state);
    assert.strictEqual(result, state);
  });
});

describe("completeCommissionAction", () => {
  const firstCommission = COMMISSION_SEQUENCE[0];

  it("pays the active commission's reward and reputation", () => {
    const state = stateAtCommission(0, [makeShelf()]);
    const result = completeCommissionAction()(state);
    assert.strictEqual(result.money, firstCommission.rewardMoney);
    assert.strictEqual(result.reputation, firstCommission.rewardReputation);
  });

  it("awards craft XP for the commission", () => {
    const state = stateAtCommission(0, [makeShelf()]);
    const result = completeCommissionAction()(state);
    assert.strictEqual(
      result.progression.xp,
      Math.round(firstCommission.rewardMoney / 5),
    );
  });

  it("advances to the next commission in the sequence", () => {
    const state = stateAtCommission(0, [makeShelf()]);
    const result = completeCommissionAction()(state);
    assert.strictEqual(result.progression.commissionsCompleted, 1);
  });

  it("consumes only the required materials from the bed", () => {
    const extraShelf = makeShelf();
    const state = stateAtCommission(0, [makeShelf(), extraShelf]);
    const result = completeCommissionAction()(state);
    assert.deepStrictEqual(result.truck.bed, [extraShelf]);
  });

  it("unlocks the store after the first commission", () => {
    const result = completeCommissionAction()(
      stateAtCommission(0, [makeShelf()]),
    );
    assert.strictEqual(result.progression.storeUnlocked, true);
    // The handoff is the tutorial's fifth step; the coach moves on to the
    // marketplace half in the same pass
    assert.strictEqual(currentTutorialStep(result)?.id, "buildSecondShelf");
  });

  it("unlocks the marketplace with the first commission too", () => {
    // The phone arrives with the first payday: the job board is how the
    // second commission's pile of gear gets funded
    const result = completeCommissionAction()(
      stateAtCommission(0, [makeShelf()]),
    );
    assert.strictEqual(result.progression.marketplaceUnlocked, true);
    // No machine grant — the marketplace is a tab, not equipment
    assert.deepStrictEqual(result.machineCrates, []);
  });

  it("delivers the frame shop order from the bed", () => {
    // Commission 2 requires 4 sanded pallet boards at 2'x2"x2/4
    const boards = Array.from({ length: 4 }, () =>
      board("pallet", 24, 2, 2, "sanded"),
    );
    const result = completeCommissionAction()(stateAtCommission(1, boards));
    assert.strictEqual(result.progression.commissionsCompleted, 2);
  });

  it("does nothing, including progression, when materials are missing", () => {
    const state = stateAtCommission(0, []);
    const result = completeCommissionAction()(state);
    assert.strictEqual(result, state);
    assert.strictEqual(result.progression.commissionsCompleted, 0);
    assert.strictEqual(result.progression.storeUnlocked, false);
  });

  it("does nothing when the sequence is exhausted", () => {
    const state = stateAtCommission(COMMISSION_SEQUENCE.length, [makeShelf()]);
    const result = completeCommissionAction()(state);
    assert.strictEqual(result, state);
  });
});
