import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "./board-helpers";
import { GameState, MaterialPile } from "./GameState";
import { initialGameState } from "./initialGameState";
import { resolveInteract, targetedPile } from "./interact";
import { Board } from "./Materials";
import { HAND_CAPACITY } from "./Person";

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
  it("names the piles underfoot newest-first, the top of the pile the one a plain press grabs", () => {
    // materialPiles keeps drop order, so `second` was set down on top of
    // `first` — and it's what E takes back, making drop-then-pickup a
    // round trip.
    const first = pileAt([5, 5]);
    const second = pileAt([5, 5]);
    const elsewhere = pileAt([8, 8]);
    const action = resolveInteract(
      shopWithPiles(first, second, elsewhere),
      undefined,
    );
    assert.strictEqual(action?.kind, "pick-up-floor");
    assert.deepStrictEqual(action.piles, [second, first]);
    assert.strictEqual(action.piles[0], second);
  });

  it("steps the rummage offset through the pile and wraps it", () => {
    const top = pileAt([5, 5]);
    const middle = pileAt([5, 5]);
    const bottom = pileAt([5, 5]);
    const piles = [top, middle, bottom];
    assert.strictEqual(targetedPile(piles, 0), top);
    assert.strictEqual(targetedPile(piles, 2), bottom);
    assert.strictEqual(targetedPile(piles, 3), top);
    // Shift-R steps backwards from the top, wrapping to the bottom
    assert.strictEqual(targetedPile(piles, -1), bottom);
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
    // With the arms at capacity the chip never offers a pickup the
    // action would refuse
    const underfoot = pileAt([5, 5]);
    const state = shopWithPiles(underfoot);
    const fullHanded = {
      ...state,
      player: {
        ...state.player,
        inventory: Array.from({ length: HAND_CAPACITY }, () =>
          board("pine", 1),
        ),
      },
    };
    assert.strictEqual(resolveInteract(fullHanded, undefined), null);
  });

  it("offers nothing on a bare cell", () => {
    const action = resolveInteract(shopWithPiles(pileAt([8, 8])), undefined);
    assert.strictEqual(action, null);
  });
});
