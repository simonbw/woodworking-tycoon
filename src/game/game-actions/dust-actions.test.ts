import assert from "node:assert";
import { describe, it } from "node:test";
import { dustTotal } from "../Dust";
import { GameState } from "../GameState";
import { initialGameState } from "../initialGameState";
import {
  DUSTPAN_CAPACITY,
  DUSTPAN_EMPTY_RATE,
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
    broomOwned: true,
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

  it("gathers swath dust into the dustpan, paced by the stroke cap", () => {
    const result = sweepTickPass()(
      sweepingState({ dust: { "7,8": { walnut: 10 }, "8,8": { oak: 10 } } }),
    );
    // The stroke wants 90% of each cell (18 units) but the tick cap is
    // 8, taken proportionally: each cell gives up 4
    assert.ok(Math.abs((result.dust["7,8"]?.walnut ?? 0) - 6) < 1e-9);
    assert.ok(Math.abs((result.dust["8,8"]?.oak ?? 0) - 6) < 1e-9);
    assert.ok(Math.abs(dustTotal(result.dustpan) - 8) < 1e-9);
    assert.ok(Math.abs((result.dustpan.walnut ?? 0) - 4) < 1e-9);
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
    // One 10-unit cell: the stroke wants 9, the cap allows 8
    assert.ok(Math.abs((result.dust["6,8"]?.walnut ?? 0) - 2) < 1e-9);
    assert.ok(Math.abs(dustTotal(result.dustpan) - 8) < 1e-9);
  });

  it("leaves dust behind the player alone", () => {
    const state = sweepingState({ dust: { "4,8": { walnut: 10 } } });
    assert.strictEqual(sweepTickPass()(state), state);
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

  it("stops gathering at a full pan, leaving the rest on the floor", () => {
    const result = sweepTickPass()(
      sweepingState({
        dust: { "6,8": { walnut: 10 } },
        dustpan: { oak: DUSTPAN_CAPACITY - 5 },
      }),
    );
    // Only 5 of the 9 the stroke would take fit in the pan
    assert.ok(Math.abs(dustTotal(result.dustpan) - DUSTPAN_CAPACITY) < 1e-9);
    assert.ok(Math.abs(dustTotal(result.dust["6,8"]) - 5) < 1e-9);
  });

  it("is a no-op with a completely full pan", () => {
    const state = sweepingState({
      dust: { "7,8": { walnut: 10 } },
      dustpan: { oak: DUSTPAN_CAPACITY },
    });
    assert.strictEqual(sweepTickPass()(state), state);
  });

  it("empties the pan a chunk per tick next to the garbage can", () => {
    // The garbage can occupies [0..1, 13..14]; [2,13] touches it
    const state = sweepingState({
      dustpan: { walnut: 60, oak: 40 },
      player: { ...sweepingState().player, position: [2, 13] },
    });
    const result = sweepTickPass()(state);
    assert.ok(
      Math.abs(dustTotal(result.dustpan) - (100 - DUSTPAN_EMPTY_RATE)) < 1e-9,
    );
    // Species drain proportionally
    assert.ok(Math.abs((result.dustpan.walnut ?? 0) - 48) < 1e-9);
  });

  it("emptying wins over sweeping when both apply", () => {
    const state = sweepingState({
      dust: { "2,13": { pine: 10 } },
      dustpan: { walnut: 50 },
      player: { ...sweepingState().player, position: [2, 13] },
    });
    const result = sweepTickPass()(state);
    assert.ok(dustTotal(result.dustpan) < 50);
    // The floor is untouched while the pour happens
    assert.strictEqual(result.dust, state.dust);
  });

  it("a mouse aim steers the swath to the aimed patch", () => {
    // [6,6] is out of the facing swath (facing +x) but within reach
    const result = sweepTickPass()(
      sweepingState({
        dust: { "6,6": { walnut: 10 }, "5,5": { oak: 10 } },
        player: { ...sweepingState().player, sweepAim: [6, 6] },
      }),
    );
    // The aimed cell and its neighbors get swept into the pan
    assert.ok(Math.abs((result.dust["6,6"]?.walnut ?? 0) - 6) < 1e-9);
    assert.ok(Math.abs((result.dust["5,5"]?.oak ?? 0) - 6) < 1e-9);
    assert.ok(Math.abs(dustTotal(result.dustpan) - 8) < 1e-9);
  });

  it("ignores an aim beyond arm's reach", () => {
    const result = sweepTickPass()(
      sweepingState({
        dust: { "7,8": { walnut: 10 }, "0,0": { oak: 10 } },
        player: { ...sweepingState().player, sweepAim: [0, 0] },
      }),
    );
    // Falls back to the facing swath; the far cell is untouched
    assert.ok(Math.abs((result.dust["7,8"]?.walnut ?? 0) - 2) < 1e-9);
    assert.ok(Math.abs((result.dust["0,0"]?.oak ?? 0) - 10) < 1e-9);
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
