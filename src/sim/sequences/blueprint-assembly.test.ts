/**
 * What a blueprint build takes off the bench.
 *
 * Assembly reads the bench top, not the bay's order: boards seated in the
 * plan's slots are the ones nailed together, and spare stock lying beside
 * them stays where it is. A build that filled its slots by first match
 * would take the spares and leave the seated boards lying under the
 * finished shelf, so the claim is asserted piece by piece here.
 *
 * Driven through `ShopDriver` and the bench commands — the same
 * `arrangeBenchMaterial` commits a drag makes in the bench view.
 */

import assert from "node:assert";
import { describe, it } from "node:test";
import {
  assemblyFramePlacement,
  slotOnBench,
} from "../../game/bench-work/assembly";
import { benchTopSizeIn } from "../../game/bench-work/bench-layout";
import { RUSTIC_SHELF_BLUEPRINT } from "../../game/bench-work/blueprint";
import { palletBoard } from "../../game/board-helpers";
import { initialGameState } from "../../game/initialGameState";
import { Board } from "../../game/Materials";
import { arrangeBenchMaterial } from "../commands/bench-commands";
import { ShopDriver } from "../driver/ShopDriver";

const WORKBENCH = "workspace";

/** The starter shop with a tin of nails — enough for one shelf. */
function shelfShop(): ShopDriver {
  return new ShopDriver({
    state: {
      ...initialGameState,
      consumables: { ...initialGameState.consumables, nails: 8 },
    },
  }).standAtOperatorCell(WORKBENCH);
}

/**
 * Carry these boards onto the bench in order, an armful at a time — the
 * bay keeps the order they were set down in, which is what a first-match
 * claim would go by.
 */
function stage(shop: ShopDriver, boards: ReadonlyArray<Board>): void {
  const staged = new Set(shop.machine(WORKBENCH).state.inputMaterials);
  for (let i = 0; i < boards.length; i += 4) {
    const armful = boards.slice(i, i + 4);
    shop.player.inventory = [...armful];
    shop.standAtOperatorCell(WORKBENCH).load(WORKBENCH, (m) => !staged.has(m));
    for (const material of shop.machine(WORKBENCH).state.inputMaterials) {
      staged.add(material);
    }
  }
}

/** Seat a board in one of the blueprint's slots, the way a drag does. */
function seat(shop: ShopDriver, board: Board, slotIndex: number): void {
  const bench = shop.machine(WORKBENCH);
  const frame = assemblyFramePlacement(benchTopSizeIn(bench.view().type));
  const slot = RUSTIC_SHELF_BLUEPRINT.slots[slotIndex];
  arrangeBenchMaterial(shop.game, bench, board.id, {
    ...slotOnBench(RUSTIC_SHELF_BLUEPRINT, frame, slot),
    onEdge: slot.onEdge,
  });
}

describe("the blueprint assembly's claim", () => {
  it("consumes the seated boards, leaving spare matching stock on the bench", () => {
    // The spares go down first, so a first-match claim would take them
    // and leave the seated boards lying under the finished shelf.
    const spares = [palletBoard(), palletBoard()];
    const seatedPieces = RUSTIC_SHELF_BLUEPRINT.slots.map(() => palletBoard());
    const shop = shelfShop();
    stage(shop, [...spares, ...seatedPieces]);
    seatedPieces.forEach((piece, index) => seat(shop, piece, index));

    shop.select(WORKBENCH, "buildRusticPalletShelf").operate(WORKBENCH);

    assert.strictEqual(
      shop.machine(WORKBENCH).state.operationProgress.status,
      "inProgress",
    );
    assert.deepStrictEqual(
      shop
        .machine(WORKBENCH)
        .state.processingMaterials.map((m) => m.id)
        .sort(),
      seatedPieces.map((m) => m.id).sort(),
    );
    assert.deepStrictEqual(
      shop
        .machine(WORKBENCH)
        .state.inputMaterials.map((m) => m.id)
        .sort(),
      spares.map((m) => m.id).sort(),
    );
  });

  it("builds with a half-seated frame — an empty slot can't take a seated board", () => {
    // Only the second support slot is seated, and its board went down
    // first. Filling the slots in one pass would hand that board to the
    // empty first slot, leaving the seated slot with nothing. Six whole
    // pallet boards build the shelf — one seated, five loose.
    const seatedSupport = palletBoard();
    const loose = [
      palletBoard(),
      palletBoard(),
      palletBoard(),
      palletBoard(),
      palletBoard(),
    ];
    const shop = shelfShop();
    stage(shop, [seatedSupport, ...loose]);
    seat(shop, seatedSupport, 1);

    shop.select(WORKBENCH, "buildRusticPalletShelf").operate(WORKBENCH);

    assert.strictEqual(
      shop.machine(WORKBENCH).state.operationProgress.status,
      "inProgress",
    );
    assert.deepStrictEqual(
      shop
        .machine(WORKBENCH)
        .state.processingMaterials.map((m) => m.id)
        .sort(),
      [seatedSupport, ...loose].map((m) => m.id).sort(),
    );
  });
});
