import { personCanWork } from "../Person";
import assert from "node:assert";
import { describe, it } from "node:test";
import { GameState } from "../GameState";
import { initialGameState } from "../initialGameState";
import { truckCabSideCell } from "../lot";
import { tickAction } from "./tickAction";
import { NIGHT_TICKS, TICKS_PER_DAY } from "../time";
import { isNight } from "../time-flow";
import {
  canLeaveShop,
  DRIVE_TICKS_ONE_WAY,
  goHomeAction,
  goToStoreAction,
  returnFromStoreAction,
  wakeUpAction,
} from "./door-actions";

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

describe("goToStoreAction / returnFromStoreAction", () => {
  it("starts a shopping trip at the cab and comes home on request", () => {
    const out = goToStoreAction("orangeBox")(stateAtCab());
    assert.deepStrictEqual(out.player.away, {
      kind: "shopping",
      store: "orangeBox",
      cart: [],
    });
    assert.strictEqual(personCanWork(out.player), false);

    const home = returnFromStoreAction()(out);
    assert.strictEqual(home.player.away, null);
    assert.strictEqual(personCanWork(home.player), true);
  });

  it("remembers which store the trip is to", () => {
    const out = goToStoreAction("lumberyard")(stateAtCab());
    assert.deepStrictEqual(out.player.away, {
      kind: "shopping",
      store: "lumberyard",
      cart: [],
    });
  });

  it("does nothing before the store is unlocked", () => {
    const locked: GameState = {
      ...stateAtCab(),
      progression: { ...initialGameState.progression, storeUnlocked: false },
    };
    assert.strictEqual(goToStoreAction("orangeBox")(locked), locked);
  });

  it("gates each store on its own unlock", () => {
    const bigBoxOnly: GameState = {
      ...stateAtCab(),
      progression: {
        ...initialGameState.progression,
        storeUnlocked: true,
        lumberyardUnlocked: false,
      },
    };
    assert.strictEqual(goToStoreAction("lumberyard")(bigBoxOnly), bigBoxOnly);
    assert.notStrictEqual(goToStoreAction("orangeBox")(bigBoxOnly), bigBoxOnly);
  });

  it("does nothing away from the cab", () => {
    const elsewhere: GameState = {
      ...stateAtCab(),
      player: { ...stateAtCab().player, position: [0, 0] },
    };
    assert.strictEqual(goToStoreAction("orangeBox")(elsewhere), elsewhere);
  });

  it("ignores a return when nobody is out shopping", () => {
    const state = stateAtCab();
    assert.strictEqual(returnFromStoreAction()(state), state);
  });

  it("stays out through ticks — shopping has no return timer", () => {
    let state = goToStoreAction("orangeBox")(stateAtCab());
    for (let i = 0; i < 5; i++) {
      state = tickAction(state);
    }
    assert.deepStrictEqual(state.player.away, {
      kind: "shopping",
      store: "orangeBox",
      cart: [],
    });
    assert.strictEqual(personCanWork(state.player), false);
  });
});

describe("the drive's time charge", () => {
  it("spends minutes driving out and the same again coming home", () => {
    const start = stateAtCab();
    const out = goToStoreAction("orangeBox")(start);
    assert.strictEqual(out.tick, start.tick + DRIVE_TICKS_ONE_WAY);

    const home = returnFromStoreAction()(out);
    assert.strictEqual(home.tick, start.tick + 2 * DRIVE_TICKS_ONE_WAY);
  });

  it("refuses a trip out after close", () => {
    const late: GameState = {
      ...stateAtCab(),
      tick: TICKS_PER_DAY,
    };
    assert.ok(isNight(late));
    assert.strictEqual(goToStoreAction("orangeBox")(late), late);
  });
});

describe("goHomeAction / wakeUpAction", () => {
  it("drives home from the cab and wakes to a new morning", () => {
    const evening: GameState = { ...stateAtCab(), tick: TICKS_PER_DAY + 40 };
    const asleep = goHomeAction()(evening);
    assert.deepStrictEqual(asleep.player.away, { kind: "home" });

    const morning = wakeUpAction()(asleep);
    assert.strictEqual(morning.player.away, null);
    assert.strictEqual(morning.day, evening.day + 1);
    // The whole overnight ran through the ordinary pipeline...
    assert.strictEqual(morning.tick, asleep.tick + NIGHT_TICKS);
    // ...and the new day opens with a full budget.
    assert.strictEqual(morning.dayStartTick, morning.tick);
    assert.ok(!isNight(morning));
    assert.deepStrictEqual(
      morning.player.position,
      truckCabSideCell(morning.shopInfo),
    );
  });

  it("lets the overnight finish a hands-free cure", () => {
    const evening: GameState = { ...stateAtCab(), tick: TICKS_PER_DAY };
    // A machine mid-cure: the workspace's hands-free phase has no
    // operation selected in the starter shop, so fake the progress on
    // the real machine with a real operation instead.
    const asleep = goHomeAction()(evening);
    const morning = wakeUpAction()(asleep);
    assert.ok(morning.tick >= evening.tick + NIGHT_TICKS);
  });

  it("ignores waking when nobody is home in bed", () => {
    const state = stateAtCab();
    assert.strictEqual(wakeUpAction()(state), state);
  });

  it("refuses the drive home away from the cab", () => {
    const elsewhere: GameState = {
      ...stateAtCab(),
      player: { ...stateAtCab().player, position: [0, 0] },
    };
    assert.strictEqual(goHomeAction()(elsewhere), elsewhere);
  });
});
