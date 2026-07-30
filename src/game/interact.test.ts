import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "./board-helpers";
import { GameState, MaterialPile } from "./GameState";
import { initialGameState } from "./initialGameState";
import { resolveInteract } from "./interact";
import { Board } from "./Materials";

function pileAt(
  position: [number, number],
  length: Board["length"] = 1,
): MaterialPile {
  return { material: board("pine", length), position };
}

/** The starter garage, empty floor, player standing at [5, 5]. */
function shopWithPiles(...materialPiles: MaterialPile[]): GameState {
  return {
    ...initialGameState,
    machines: [],
    machineCrates: [],
    materialPiles,
    player: { ...initialGameState.player, position: [5, 5] },
  };
}

describe("resolveInteract", () => {
  it("names the piles underfoot, first in line the one a plain press grabs", () => {
    const first = pileAt([5, 5]);
    const second = pileAt([5, 5]);
    const elsewhere = pileAt([8, 8]);
    const action = resolveInteract(
      shopWithPiles(first, second, elsewhere),
      undefined,
    );
    assert.strictEqual(action?.kind, "pick-up-floor");
    assert.deepStrictEqual(action.piles, [first, second]);
    assert.strictEqual(action.piles[0], first);
  });

  it("reaches long stock overhanging from a neighbor anchor cell", () => {
    // An 8' board anchored two cells away still lies across the player's
    // cell — the pile E grabs isn't necessarily anchored underfoot.
    const overhanging = pileAt([5, 7], 8);
    const action = resolveInteract(shopWithPiles(overhanging), undefined);
    assert.strictEqual(action?.kind, "pick-up-floor");
    assert.strictEqual(action.piles[0], overhanging);
  });

  it("steps pickup aside when the hands are full", () => {
    // HAND_CAPACITY is 2: with both hands loaded the chip never offers a
    // pickup the action would refuse
    const underfoot = pileAt([5, 5]);
    const state = shopWithPiles(underfoot);
    const fullHanded = {
      ...state,
      player: {
        ...state.player,
        inventory: [board("pine", 1), board("pine", 1)],
      },
    };
    assert.strictEqual(resolveInteract(fullHanded, undefined), null);
  });

  it("offers nothing on a bare cell", () => {
    const action = resolveInteract(shopWithPiles(pileAt([8, 8])), undefined);
    assert.strictEqual(action, null);
  });
});
