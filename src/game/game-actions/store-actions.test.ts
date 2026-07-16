import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "../board-helpers";
import { COMMISSION_SEQUENCE } from "../commissionSequence";
import { GameState } from "../GameState";
import { MaterialInstance, FinishedProduct } from "../Materials";
import { initialGameState } from "../initialGameState";
import { makeMaterial } from "../material-helpers";
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

/** State part-way through the sequence, with the given number of commissions done. */
function stateAtCommission(
  commissionsCompleted: number,
  inventory: ReadonlyArray<MaterialInstance>,
): GameState {
  return stateWith(
    {
      progression: {
        ...initialGameState.progression,
        commissionsCompleted,
        storeUnlocked: commissionsCompleted >= 1,
        tutorialStage: commissionsCompleted >= 1 ? 1 : 0,
      },
    },
    inventory,
  );
}

describe("buyMaterialAction", () => {
  it("deducts the price and adds the material to the inventory", () => {
    const shelf = makeShelf();
    const result = buyMaterialAction(shelf, 30)(stateWith({ money: 100 }));
    assert.strictEqual(result.money, 70);
    assert.deepStrictEqual(result.player.inventory, [shelf]);
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
  it("deducts the price and adds the machine to storage", () => {
    const result = buyMachineAction("jobsiteTableSaw", 150)(
      stateWith({ money: 200 }),
    );
    assert.strictEqual(result.money, 50);
    assert.deepStrictEqual(result.storage.machines, ["jobsiteTableSaw"]);
  });

  it("does nothing when the player cannot afford it", () => {
    const state = stateWith({ money: 100 });
    const result = buyMachineAction("miterSaw", 150)(state);
    assert.strictEqual(result, state);
  });

  it("unlocks shop layout and advances the tutorial when buying a miter saw", () => {
    const result = buyMachineAction("miterSaw", 150)(
      stateWith({ money: 200 }),
    );
    assert.strictEqual(result.progression.shopLayoutUnlocked, true);
    assert.strictEqual(result.progression.tutorialStage, 2);
  });

  it("does not unlock shop layout for other machines", () => {
    const result = buyMachineAction("jobsiteTableSaw", 150)(
      stateWith({ money: 200 }),
    );
    assert.strictEqual(result.progression.shopLayoutUnlocked, false);
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

  it("consumes only the required materials", () => {
    const extraShelf = makeShelf();
    const state = stateAtCommission(0, [makeShelf(), extraShelf]);
    const result = completeCommissionAction()(state);
    assert.deepStrictEqual(result.player.inventory, [extraShelf]);
  });

  it("unlocks the store after the first commission", () => {
    const result = completeCommissionAction()(
      stateAtCommission(0, [makeShelf()]),
    );
    assert.strictEqual(result.progression.storeUnlocked, true);
    assert.strictEqual(result.progression.tutorialStage, 1);
  });

  it("unlocks free selling after the second commission", () => {
    // Commission 2 (cut-to-order) requires 4 pallet boards at 2x4x1
    const boards = Array.from({ length: 4 }, () => board("pallet", 2, 4, 1));
    const result = completeCommissionAction()(stateAtCommission(1, boards));
    assert.strictEqual(result.progression.commissionsCompleted, 2);
    assert.strictEqual(result.progression.freeSelling, true);
  });

  it("grants the free sales table when free selling unlocks", () => {
    const boards = Array.from({ length: 4 }, () => board("pallet", 2, 4, 1));
    const result = completeCommissionAction()(stateAtCommission(1, boards));
    assert.deepStrictEqual(result.storage.machines, ["salesTable"]);
  });

  it("does not grant a second sales table on later commissions", () => {
    // Commission 3 (ripped-slats) requires 4 boards at 3x2x1
    const boards = Array.from({ length: 4 }, () => board("pallet", 3, 2, 1));
    const base = stateAtCommission(2, boards);
    const state = {
      ...base,
      storage: { machines: ["salesTable" as const], tools: [] },
      progression: { ...base.progression, freeSelling: true },
    };
    const result = completeCommissionAction()(state);
    assert.deepStrictEqual(result.storage.machines, ["salesTable"]);
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
