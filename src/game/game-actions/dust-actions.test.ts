import assert from "node:assert";
import { describe, it } from "node:test";
import { dustTotal } from "../Dust";
import { GameState } from "../GameState";
import { initialGameState } from "../initialGameState";
import { SawdustPile } from "../Materials";
import { makeMaterial } from "../material-helpers";
import { sweepAction } from "./dust-actions";

/**
 * Player mid-shop at [1,1] facing +x (direction 0), sweeping unlocked.
 * The default shop's machines sit at [1,2] (workspace) and [0,5]
 * (garbage), so [1,1] has the workspace as an orthogonal neighbor.
 */
function sweepingState(overrides: Partial<GameState> = {}): GameState {
  return {
    ...initialGameState,
    progression: { ...initialGameState.progression, sweepingUnlocked: true },
    player: { ...initialGameState.player, position: [1, 1], direction: 0 },
    ...overrides,
  };
}

describe("sweepAction", () => {
  it("does nothing before sweeping is unlocked", () => {
    const state = {
      ...sweepingState({ dust: { "1,1": { walnut: 50 } } }),
      progression: initialGameState.progression,
    };
    assert.strictEqual(sweepAction()(state), state);
  });

  it("pushes most of the cell's dust into a pile on the facing cell", () => {
    const result = sweepAction()(
      sweepingState({ dust: { "1,1": { walnut: 50 } } }),
    );
    // 90% gathered, 10% film stays behind
    assert.ok(Math.abs((result.dust["1,1"]?.walnut ?? 0) - 5) < 1e-9);
    const pile = result.materialPiles.find(
      (pile) => pile.material.type === "sawdustPile",
    );
    assert.ok(pile);
    assert.deepStrictEqual(pile.position, [2, 1]);
    assert.ok(
      pile.material.type === "sawdustPile" &&
        Math.abs((pile.material.contents.walnut ?? 0) - 45) < 1e-9,
    );
    // Sweeping takes time: the rest of the sweep is busy ticks
    assert.strictEqual(result.player.canWork, false);
    assert.strictEqual(result.player.busyTicks, 2);
    // A meaningful sweep earns token XP
    assert.strictEqual(
      result.progression.xp,
      initialGameState.progression.xp + 1,
    );
  });

  it("pulls dust out from under adjacent machines at a reduced rate", () => {
    // The workspace occupies [1,2], orthogonal to the player at [1,1]
    const result = sweepAction()(
      sweepingState({ dust: { "1,2": { pine: 20 } } }),
    );
    assert.ok(Math.abs((result.dust["1,2"]?.pine ?? 0) - 10) < 1e-9);
    const pile = result.materialPiles.find(
      (pile) => pile.material.type === "sawdustPile",
    );
    assert.ok(
      pile &&
        pile.material.type === "sawdustPile" &&
        Math.abs((pile.material.contents.pine ?? 0) - 10) < 1e-9,
    );
  });

  it("merges into an existing pile and stops at the pile cap", () => {
    const existing = makeMaterial<SawdustPile>({
      type: "sawdustPile",
      contents: { oak: 90 },
    });
    const result = sweepAction()(
      sweepingState({
        dust: { "1,1": { walnut: 50 } },
        materialPiles: [{ material: existing, position: [2, 1] }],
      }),
    );
    // Only 10 units fit; the rest stays on the floor
    const pile = result.materialPiles.find(
      (pile) => pile.material.type === "sawdustPile",
    );
    assert.ok(pile && pile.material.type === "sawdustPile");
    assert.ok(Math.abs(dustTotal(pile.material.contents) - 100) < 1e-9);
    assert.ok(Math.abs((result.dust["1,1"]?.walnut ?? 0) - 40) < 1e-9);
  });

  it("piles up underfoot when facing a machine", () => {
    // Direction 3 faces +y — straight at the workspace on [1,2]
    const result = sweepAction()(
      sweepingState({
        dust: { "1,1": { walnut: 50 } },
        player: {
          ...initialGameState.player,
          position: [1, 1],
          direction: 3,
        },
      }),
    );
    const pile = result.materialPiles.find(
      (pile) => pile.material.type === "sawdustPile",
    );
    assert.ok(pile);
    assert.deepStrictEqual(pile.position, [1, 1]);
  });

  it("is a free no-op on a clean floor", () => {
    const state = sweepingState();
    const result = sweepAction()(state);
    assert.strictEqual(result, state);
  });

  it("grants no XP for token sweeps", () => {
    const result = sweepAction()(
      sweepingState({ dust: { "1,1": { walnut: 2 } } }),
    );
    assert.strictEqual(result.progression.xp, initialGameState.progression.xp);
  });
});
