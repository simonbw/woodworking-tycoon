import assert from "node:assert";
import { describe, it } from "node:test";
import { GameState } from "../GameState";
import { initialGameState } from "../initialGameState";
import { truckCabSideCell } from "../lot";
import { canLeaveShop } from "./door-actions";

/** Both stores unlocked and the player standing at the truck's cab. */
function stateAtCab(): GameState {
  return {
    ...initialGameState,
    player: {
      ...initialGameState.player,
      position: truckCabSideCell(initialGameState.shopInfo),
    },
    progression: {
      ...initialGameState.progression,
      storeUnlocked: true,
      lumberyardUnlocked: true,
    },
  };
}

describe("canLeaveShop", () => {
  it("allows leaving beside the cab", () => {
    const state = stateAtCab();
    assert.ok(canLeaveShop(state));
    const [cx, cy] = truckCabSideCell(state.shopInfo);
    assert.ok(
      canLeaveShop({
        ...state,
        player: { ...state.player, position: [cx, cy - 1] },
      }),
    );
  });

  it("refuses away from the truck — the door included", () => {
    const doorside = stateAtCab();
    assert.ok(
      !canLeaveShop({
        ...doorside,
        player: {
          ...doorside.player,
          position: doorside.shopInfo.entrancePosition,
        },
      }),
    );
  });

  it("refuses with a machine over the shoulders", () => {
    const state = stateAtCab();
    assert.ok(
      !canLeaveShop({
        ...state,
        player: {
          ...state.player,
          carriedMachine: initialGameState.machines[0],
        },
      }),
    );
  });
});
