import assert from "node:assert";
import { describe, it } from "node:test";
import { GameState } from "../GameState";
import { MaterialInstance, FinishedProduct } from "../Materials";
import { initialGameState } from "../initialGameState";
import { makeMaterial } from "../material-helpers";
import {
  buyMachineAction,
  buyMaterialAction,
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
