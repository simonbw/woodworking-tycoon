import assert from "node:assert";
import { describe, it } from "node:test";
import { GameState } from "../GameState";
import { initialGameState } from "../initialGameState";
import { tickAction } from "./tickAction";
import {
  canLeaveShop,
  goToStoreAction,
  returnFromStoreAction,
} from "./door-actions";

/** Both stores unlocked and the player standing at the garage door. */
function stateAtDoor(): GameState {
  return {
    ...initialGameState,
    player: {
      ...initialGameState.player,
      position: initialGameState.shopInfo.entrancePosition,
    },
    progression: {
      ...initialGameState.progression,
      storeUnlocked: true,
      lumberyardUnlocked: true,
    },
  };
}

describe("canLeaveShop", () => {
  it("allows leaving at or next to the entrance cell", () => {
    const state = stateAtDoor();
    assert.ok(canLeaveShop(state));
    const [ex, ey] = state.shopInfo.entrancePosition;
    assert.ok(
      canLeaveShop({
        ...state,
        player: { ...state.player, position: [ex - 1, ey] },
      }),
    );
  });

  it("refuses away from the door", () => {
    const state = stateAtDoor();
    assert.ok(
      !canLeaveShop({
        ...state,
        player: { ...state.player, position: [0, 0] },
      }),
    );
  });

  it("refuses with a machine over the shoulders", () => {
    const state = stateAtDoor();
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

describe("goToStoreAction / returnFromStoreAction", () => {
  it("starts a shopping trip at the door and comes home on request", () => {
    const out = goToStoreAction("orangeBox")(stateAtDoor());
    assert.deepStrictEqual(out.player.away, {
      kind: "shopping",
      store: "orangeBox",
    });
    assert.strictEqual(out.player.canWork, false);

    const home = returnFromStoreAction()(out);
    assert.strictEqual(home.player.away, null);
    assert.strictEqual(home.player.canWork, true);
  });

  it("remembers which store the trip is to", () => {
    const out = goToStoreAction("lumberyard")(stateAtDoor());
    assert.deepStrictEqual(out.player.away, {
      kind: "shopping",
      store: "lumberyard",
    });
  });

  it("does nothing before the store is unlocked", () => {
    const locked: GameState = {
      ...stateAtDoor(),
      progression: { ...initialGameState.progression, storeUnlocked: false },
    };
    assert.strictEqual(goToStoreAction("orangeBox")(locked), locked);
  });

  it("gates each store on its own unlock", () => {
    const bigBoxOnly: GameState = {
      ...stateAtDoor(),
      progression: {
        ...initialGameState.progression,
        storeUnlocked: true,
        lumberyardUnlocked: false,
      },
    };
    assert.strictEqual(goToStoreAction("lumberyard")(bigBoxOnly), bigBoxOnly);
    assert.notStrictEqual(goToStoreAction("orangeBox")(bigBoxOnly), bigBoxOnly);
  });

  it("does nothing away from the door", () => {
    const elsewhere: GameState = {
      ...stateAtDoor(),
      player: { ...stateAtDoor().player, position: [0, 0] },
    };
    assert.strictEqual(goToStoreAction("orangeBox")(elsewhere), elsewhere);
  });

  it("ignores a return when nobody is out shopping", () => {
    const state = stateAtDoor();
    assert.strictEqual(returnFromStoreAction()(state), state);
  });

  it("stays out through ticks — shopping has no return timer", () => {
    let state = goToStoreAction("orangeBox")(stateAtDoor());
    for (let i = 0; i < 5; i++) {
      state = tickAction(state);
    }
    assert.deepStrictEqual(state.player.away, {
      kind: "shopping",
      store: "orangeBox",
    });
    assert.strictEqual(state.player.canWork, false);
  });
});
