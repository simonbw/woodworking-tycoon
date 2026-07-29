import assert from "node:assert";
import { describe, it } from "node:test";
import { dustTotal } from "../Dust";
import { GameState, MaterialPile } from "../GameState";
import { heldTool, holdingBroom } from "../HeldTool";
import { initialGameState } from "../initialGameState";
import { SawdustPile } from "../Materials";
import { makeMaterial } from "../material-helpers";
import {
  pickUpBroomAction,
  putDownBroomAction,
  sweepTickPass,
} from "./dust-actions";

/**
 * Player mid-shop on open floor at [6,8] facing +x (direction 0), broom
 * in hand and the operate key held — one tick of sweeping away. The
 * default shop's workspace occupies [1..3, 1..2] and the garbage can
 * [0..1, 13..14], both well outside the swath.
 */
function sweepingState(overrides: Partial<GameState> = {}): GameState {
  return {
    ...initialGameState,
    progression: { ...initialGameState.progression, sweepingUnlocked: true },
    broomPosition: null,
    player: {
      ...initialGameState.player,
      position: [6, 8],
      direction: 0,
      operating: true,
    },
    ...overrides,
  };
}

function theSawdustPile(state: GameState): MaterialPile {
  const piles = state.materialPiles.filter(
    (pile) => pile.material.type === "sawdustPile",
  );
  assert.strictEqual(piles.length, 1);
  return piles[0];
}

describe("pickUpBroomAction", () => {
  it("takes the broom from an adjacent cell into the hands", () => {
    const state: GameState = {
      ...sweepingState(),
      broomPosition: [6, 9],
    };
    const result = pickUpBroomAction()(state);
    assert.strictEqual(result.broomPosition, null);
    assert.strictEqual(holdingBroom(result), true);
    assert.strictEqual(heldTool(result), "broom");
  });

  it("won't reach a broom more than a cell away", () => {
    const state: GameState = { ...sweepingState(), broomPosition: [0, 0] };
    assert.strictEqual(pickUpBroomAction()(state), state);
  });

  it("needs empty hands", () => {
    const state: GameState = {
      ...sweepingState(),
      broomPosition: [6, 9],
      player: {
        ...sweepingState().player,
        inventory: initialGameState.materialPiles.map((pile) => pile.material),
      },
    };
    assert.strictEqual(pickUpBroomAction()(state), state);
  });

  it("stays on the floor before sweeping is unlocked", () => {
    const state: GameState = {
      ...sweepingState(),
      broomPosition: [6, 9],
      progression: initialGameState.progression,
    };
    assert.strictEqual(pickUpBroomAction()(state), state);
  });
});

describe("putDownBroomAction", () => {
  it("leans the broom where the player stands", () => {
    const result = putDownBroomAction()(sweepingState());
    assert.deepStrictEqual(result.broomPosition, [6, 8]);
    assert.strictEqual(heldTool(result), null);
  });

  it("does nothing when the broom isn't in hand", () => {
    const state: GameState = { ...sweepingState(), broomPosition: [3, 3] };
    assert.strictEqual(putDownBroomAction()(state), state);
  });
});

describe("sweepTickPass", () => {
  it("does nothing unless the operate key is held", () => {
    const state = sweepingState({
      dust: { "7,8": { walnut: 10 } },
      player: { ...sweepingState().player, operating: false },
    });
    assert.strictEqual(sweepTickPass()(state), state);
  });

  it("does nothing without the broom in hand", () => {
    const state = sweepingState({
      dust: { "7,8": { walnut: 10 } },
      broomPosition: [0, 0],
    });
    assert.strictEqual(sweepTickPass()(state), state);
  });

  it("plows swath dust into a pile on the facing cell, leaving a film", () => {
    const result = sweepTickPass()(
      sweepingState({ dust: { "7,8": { walnut: 10 }, "8,8": { oak: 10 } } }),
    );
    // 90% of each swath cell moves; the film stays behind
    assert.ok(Math.abs((result.dust["7,8"]?.walnut ?? 0) - 1) < 1e-9);
    assert.ok(Math.abs((result.dust["8,8"]?.oak ?? 0) - 1) < 1e-9);
    const pile = theSawdustPile(result);
    assert.deepStrictEqual(pile.position, [7, 8]);
    assert.ok(pile.material.type === "sawdustPile");
    assert.ok(Math.abs(dustTotal(pile.material.contents) - 18) < 1e-9);
    // Sweeping never freezes the feet
    assert.strictEqual(result.player.busyTicks, 0);
    // A heavy tick earns token XP
    assert.strictEqual(
      result.progression.xp,
      initialGameState.progression.xp + 1,
    );
  });

  it("sweeps the cell underfoot too", () => {
    const result = sweepTickPass()(
      sweepingState({ dust: { "6,8": { walnut: 10 } } }),
    );
    assert.ok(Math.abs((result.dust["6,8"]?.walnut ?? 0) - 1) < 1e-9);
  });

  it("leaves dust behind the player alone", () => {
    const state = sweepingState({ dust: { "4,8": { walnut: 10 } } });
    assert.strictEqual(sweepTickPass()(state), state);
  });

  it("pushes a pile in the swath along to the facing cell", () => {
    const ahead = makeMaterial<SawdustPile>({
      type: "sawdustPile",
      contents: { oak: 30 },
    });
    const result = sweepTickPass()(
      sweepingState({
        dust: { "7,8": { walnut: 10 } },
        materialPiles: [{ material: ahead, position: [8, 8] }],
      }),
    );
    const pile = theSawdustPile(result);
    assert.deepStrictEqual(pile.position, [7, 8]);
    assert.ok(pile.material.type === "sawdustPile");
    assert.ok(Math.abs((pile.material.contents.oak ?? 0) - 30) < 1e-9);
    assert.ok(Math.abs((pile.material.contents.walnut ?? 0) - 9) < 1e-9);
  });

  it("pulls dust out from under machines in reach at a reduced rate", () => {
    // The workspace occupies [1..3, 1..2]; standing at [2,4] facing -y
    // (direction 1) puts its cells in the swath.
    const result = sweepTickPass()(
      sweepingState({
        dust: { "2,2": { pine: 20 } },
        player: {
          ...sweepingState().player,
          position: [2, 4],
          direction: 1,
        },
      }),
    );
    assert.ok(Math.abs((result.dust["2,2"]?.pine ?? 0) - 14) < 1e-9);
  });

  it("piles up underfoot when facing a machine", () => {
    // Standing at [2,3] facing -y: the facing cell [2,2] is the workspace
    const result = sweepTickPass()(
      sweepingState({
        dust: { "2,3": { walnut: 50 } },
        player: {
          ...sweepingState().player,
          position: [2, 3],
          direction: 1,
        },
      }),
    );
    const pile = theSawdustPile(result);
    assert.deepStrictEqual(pile.position, [2, 3]);
  });

  it("merges into an existing pile and stops at the pile cap", () => {
    const existing = makeMaterial<SawdustPile>({
      type: "sawdustPile",
      contents: { oak: 95 },
    });
    const result = sweepTickPass()(
      sweepingState({
        dust: { "6,8": { walnut: 10 } },
        materialPiles: [{ material: existing, position: [7, 8] }],
      }),
    );
    // Only 5 units of the 9 gathered fit; the overflow stays on the floor
    const pile = theSawdustPile(result);
    assert.ok(pile.material.type === "sawdustPile");
    assert.ok(Math.abs(dustTotal(pile.material.contents) - 100) < 1e-9);
    const floorLeft = dustTotal(result.dust["6,8"]);
    assert.ok(Math.abs(floorLeft - 5) < 1e-9);
  });

  it("a mouse aim steers the swath and the pile to the aimed cell", () => {
    // [6,6] is out of the facing swath (facing +x) but within reach
    const result = sweepTickPass()(
      sweepingState({
        dust: { "6,6": { walnut: 10 }, "5,5": { oak: 10 } },
        player: { ...sweepingState().player, sweepAim: [6, 6] },
      }),
    );
    // The aimed cell and its neighbors get swept…
    assert.ok(Math.abs((result.dust["6,6"]?.walnut ?? 0) - 1) < 1e-9);
    assert.ok(Math.abs((result.dust["5,5"]?.oak ?? 0) - 1) < 1e-9);
    // …into a pile on the aimed cell, not the faced one
    const pile = theSawdustPile(result);
    assert.deepStrictEqual(pile.position, [6, 6]);
  });

  it("ignores an aim beyond arm's reach", () => {
    const result = sweepTickPass()(
      sweepingState({
        dust: { "7,8": { walnut: 10 } },
        player: { ...sweepingState().player, sweepAim: [0, 0] },
      }),
    );
    // Falls back to the facing swath
    const pile = theSawdustPile(result);
    assert.deepStrictEqual(pile.position, [7, 8]);
  });

  it("is a free no-op on a clean floor", () => {
    const state = sweepingState();
    assert.strictEqual(sweepTickPass()(state), state);
  });

  it("grants no XP for token ticks", () => {
    const result = sweepTickPass()(
      sweepingState({ dust: { "7,8": { walnut: 2 } } }),
    );
    assert.strictEqual(result.progression.xp, initialGameState.progression.xp);
  });
});
