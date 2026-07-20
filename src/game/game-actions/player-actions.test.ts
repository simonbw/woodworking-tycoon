import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "../board-helpers";
import { GameState, MaterialPile } from "../GameState";
import { initialGameState } from "../initialGameState";
import { pickUpMaterialAction } from "./player-actions";

function stateWithPile(
  pile: MaterialPile,
  playerPosition: [number, number],
): GameState {
  return {
    ...initialGameState,
    player: { ...initialGameState.player, position: playerPosition },
    materialPiles: [pile],
  };
}

describe("pickUpMaterialAction", () => {
  it("picks up from the pile's anchor cell", () => {
    const pile: MaterialPile = {
      material: board("pine", 8, 4, 1),
      position: [1, 3],
    };
    const result = pickUpMaterialAction([pile])(stateWithPile(pile, [1, 3]));
    assert.strictEqual(result.materialPiles.length, 0);
    assert.strictEqual(result.player.inventory.length, 1);
  });

  it("picks up a long board from a cell it overhangs", () => {
    const pile: MaterialPile = {
      material: board("pine", 8, 4, 1),
      position: [1, 3],
    };
    const result = pickUpMaterialAction([pile])(stateWithPile(pile, [1, 2]));
    assert.strictEqual(result.materialPiles.length, 0);
    assert.strictEqual(result.player.inventory.length, 1);
  });

  it("refuses cells the board does not reach", () => {
    const pile: MaterialPile = {
      material: board("pine", 8, 4, 1),
      position: [1, 3],
    };
    const result = pickUpMaterialAction([pile])(stateWithPile(pile, [1, 5]));
    assert.strictEqual(result.materialPiles.length, 1);
    assert.strictEqual(result.player.inventory.length, 0);
  });

  it("keeps short stock a one-cell grab", () => {
    const pile: MaterialPile = {
      material: board("pine", 2, 4, 1),
      position: [1, 3],
    };
    const result = pickUpMaterialAction([pile])(stateWithPile(pile, [1, 2]));
    assert.strictEqual(result.materialPiles.length, 1);
    assert.strictEqual(result.player.inventory.length, 0);
  });
});
