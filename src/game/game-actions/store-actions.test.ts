import assert from "node:assert";
import { describe, it } from "node:test";
import { Commission, GameState } from "../GameState";
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

const shelfCommission: Commission = {
  requiredMaterials: [
    { type: ["rusticShelf"], species: ["pallet"], quantity: 1 },
  ],
  rewardMoney: 200,
  rewardReputation: 2,
};

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
  it("pays the reward and reputation and removes the commission", () => {
    const state = stateWith(
      { money: 0, reputation: 0, commissions: [shelfCommission] },
      [makeShelf()],
    );
    const result = completeCommissionAction(shelfCommission)(state);
    assert.strictEqual(result.money, 200);
    assert.strictEqual(result.reputation, 2);
    assert.deepStrictEqual(result.commissions, []);
  });

  it("consumes only the required materials", () => {
    const extraShelf = makeShelf();
    const state = stateWith({ commissions: [shelfCommission] }, [
      makeShelf(),
      extraShelf,
    ]);
    const result = completeCommissionAction(shelfCommission)(state);
    assert.deepStrictEqual(result.player.inventory, [extraShelf]);
  });

  it("increments commissionsCompleted and unlocks the store after the first commission", () => {
    const state = stateWith(
      { commissions: [shelfCommission] },
      [makeShelf()],
    );
    const result = completeCommissionAction(shelfCommission)(state);
    assert.strictEqual(result.progression.commissionsCompleted, 1);
    assert.strictEqual(result.progression.storeUnlocked, true);
    assert.strictEqual(result.progression.tutorialStage, 1);
  });

  it("unlocks free selling after the third commission", () => {
    const state = stateWith(
      {
        commissions: [shelfCommission],
        progression: {
          ...initialGameState.progression,
          commissionsCompleted: 2,
          storeUnlocked: true,
          tutorialStage: 2,
        },
      },
      [makeShelf()],
    );
    const result = completeCommissionAction(shelfCommission)(state);
    assert.strictEqual(result.progression.commissionsCompleted, 3);
    assert.strictEqual(result.progression.freeSelling, true);
  });

  it("does nothing, including progression, when materials are missing", () => {
    const state = stateWith({ commissions: [shelfCommission] }, []);
    const result = completeCommissionAction(shelfCommission)(state);
    assert.strictEqual(result, state);
    assert.strictEqual(result.progression.commissionsCompleted, 0);
    assert.strictEqual(result.progression.storeUnlocked, false);
  });
});
