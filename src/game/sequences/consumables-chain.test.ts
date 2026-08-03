/**
 * The consumables loop: a pallet pays for the shelf it becomes.
 *
 * `game-actions/consumables.test.ts` covers the accounting one operation at a
 * time. The loop is the point here — a part-stripped pallet (five deck
 * boards on three stringers) holds fifteen nails, one per crossing, and
 * a rustic shelf costs six of them (one per rail × shelf crossing of its
 * blueprint): the pallet pays for its own shelf with nails to spare. If
 * either number drifts, the fixture's premise breaks and the shelf stops
 * being free, which is the whole idea of salvage.
 *
 * `consumables.spec.ts` keeps the shortfall readout, the supply cabinet's
 * appearance, and the store aisle.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { consumablesShop } from "../../../tests/fixtures/consumables-shop";
import { GameState } from "../GameState";
import { getMaterialFullName } from "../material-helpers";
import { MaterialInstance } from "../Materials";
import { openShop, ShopDriver } from "./shop-driver";

const WORKBENCH = "workspace";

const isPalletBoard = (m: MaterialInstance) =>
  m.type === "board" && (m as { species: string }).species === "pallet";
const byWidth = (width: number) => (m: MaterialInstance) =>
  isPalletBoard(m) && (m as { width: number }).width === width;
const isShelf = (m: MaterialInstance) => m.type === "rusticShelf";
const isCuttingBoard = (m: MaterialInstance) => m.type === "simpleCuttingBoard";

/**
 * Pry the pallet apart until nothing is left: nail by nail through the
 * same incremental commits the bench view dispatches — fifteen pulls for
 * five deck boards and three stringers, a nail back in the tin for
 * every pull, each board dropping free with its last one.
 */
function dismantleThePallet(shop: ShopDriver): ShopDriver {
  // No plan: the staged pallet offers prying on its own, and the freed
  // boards stay on the bench until takeStock clears them into the arms.
  shop.standAtOperatorCell(WORKBENCH);
  shop.run(WORKBENCH);
  return shop.takeStock(WORKBENCH);
}

describe("consumables loop", () => {
  it("a stripped pallet gives back eight boards and fifteen nails", () => {
    const shop = openShop(consumablesShop);
    assert.equal(shop.shop.consumables.nails, 0);

    dismantleThePallet(shop);

    assert.equal(shop.stock(isPalletBoard).length, 8);
    assert.equal(shop.shop.consumables.nails, 15);
  });

  it("one shelf costs six of the nails the pallet returned", () => {
    const shop = openShop(consumablesShop);
    dismantleThePallet(shop);

    shop
      .select(WORKBENCH, "buildRusticPalletShelf")
      // Two stringers as the rails, three deck boards as the shelves. The
      // bay only holds five, so the counts have to be exact.
      .load(WORKBENCH, byWidth(6), 2)
      .load(WORKBENCH, byWidth(4), 3)
      .run(WORKBENCH)
      .collect(WORKBENCH);

    assert.equal(shop.holding(isShelf).length, 1);
    assert.equal(shop.shop.consumables.nails, 15 - 6);
  });

  it("the shelf won't start without the nails", () => {
    const shop = openShop(consumablesShop);
    dismantleThePallet(shop);
    shop.arrange((state: GameState) => ({
      ...state,
      consumables: { ...state.consumables, nails: 5 },
    }));

    shop
      .select(WORKBENCH, "buildRusticPalletShelf")
      .load(WORKBENCH, byWidth(6), 2)
      .load(WORKBENCH, byWidth(4), 3);
    assert.throws(() => shop.run(WORKBENCH), /would not start/);
  });

  it("a wipe-down spends 4 oz and leaves the board oiled", () => {
    const shop = openShop(consumablesShop).arrange((state: GameState) => ({
      ...state,
      // A bottle off the store's supplies aisle, which the spec still buys
      consumables: { ...state.consumables, mineralOil: 16 },
      // Clear the bay: the fixture parks a pallet there for the dismantle
      // tests above, and this one is about the oil, not the pallet.
      machines: state.machines.map((m) => ({ ...m, inputMaterials: [] })),
    }));

    shop.make(WORKBENCH, "oilCuttingBoard", isCuttingBoard);

    assert.equal(shop.shop.consumables.mineralOil, 12);
    const board = shop.theOne(isCuttingBoard);
    assert.equal((board as { finish: string }).finish, "mineralOil");
    // The row the manifest shows it under once it's been wiped down
    assert.equal(getMaterialFullName(board), "Oiled Simple cutting board");
  });
});
