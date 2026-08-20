import assert from "node:assert";
import { describe, it } from "node:test";
import { GameState } from "./GameState";
import { initialGameState } from "./initialGameState";
import { makeMaterial } from "./material-helpers";
import { FinishedProduct } from "./Materials";
import { TICKS_PER_DAY } from "./time";
import { currentDayPhase, isNight, timeSpeed } from "./time-flow";

function fresh(edit: Partial<GameState> = {}): GameState {
  return { ...initialGameState, ...edit };
}

function shelf(): FinishedProduct {
  return makeMaterial<FinishedProduct>({
    type: "rusticShelf",
    species: "pallet",
  });
}

function withPlayer(
  edit: Partial<GameState["player"]>,
  base: GameState = initialGameState,
): GameState {
  return { ...base, player: { ...base.player, ...edit } };
}

describe("timeSpeed", () => {
  it("idles a fresh shop — the clock creeps, nothing more", () => {
    assert.equal(timeSpeed(fresh()), "idle");
  });

  it("spends time while the body is busy", () => {
    assert.equal(timeSpeed(withPlayer({ busyTicks: 3 })), "working");
  });

  it("spends time through a scavenging run's searches", () => {
    assert.equal(
      timeSpeed(
        withPlayer({
          away: {
            kind: "scavenging",
            startTick: 0,
            stops: [],
            stopsSearched: 0,
            phase: { kind: "searching", doneTick: 100 },
          },
        }),
      ),
      "working",
    );
  });

  it("idles at a scavenging decision — weighing another stop is thinking", () => {
    assert.equal(
      timeSpeed(
        withPlayer({
          away: {
            kind: "scavenging",
            startTick: 0,
            stops: [],
            stopsSearched: 1,
            phase: { kind: "deciding" },
          },
        }),
      ),
      "idle",
    );
  });

  it("idles through a store's aisles — browsing is thinking", () => {
    assert.equal(
      timeSpeed(
        withPlayer({
          away: {
            kind: "shopping",
            store: "orangeBox",
            cart: [],
            hasCart: true,
            position: [0, 0],
            direction: 1,
          },
        }),
      ),
      "idle",
    );
  });

  it("stops while the player is home in bed", () => {
    assert.equal(timeSpeed(withPlayer({ away: { kind: "home" } })), "stopped");
  });

  it("spins under the held wait key", () => {
    assert.equal(timeSpeed(withPlayer({ waiting: true })), "waiting");
  });

  it("stands the wait key down at night", () => {
    const night = withPlayer({ waiting: true }, fresh({ tick: TICKS_PER_DAY }));
    assert.ok(isNight(night));
    assert.equal(timeSpeed(night), "stopped");
  });

  it("stops a closed shop with nobody working", () => {
    const night = fresh({ tick: TICKS_PER_DAY });
    assert.equal(currentDayPhase(night), "night");
    assert.equal(timeSpeed(night), "stopped");
  });

  it("spends time while the first sale is pending — the dealt buyer is walking up", () => {
    assert.equal(timeSpeed(fresh({ stand: [shelf()] })), "working");
  });

  it("idles a stocked stand once the shop has sold before", () => {
    assert.equal(
      timeSpeed(
        fresh({
          stand: [shelf()],
          progression: { ...initialGameState.progression, salesCompleted: 1 },
        }),
      ),
      "idle",
    );
  });

  it("stops a pending first sale at night — the sale waits for morning", () => {
    assert.equal(
      timeSpeed(fresh({ stand: [shelf()], tick: TICKS_PER_DAY })),
      "stopped",
    );
  });
});

describe("timeSpeed precedence", () => {
  it("lets working outrank the wait key — waiting never speeds up work", () => {
    assert.equal(
      timeSpeed(withPlayer({ waiting: true, busyTicks: 3 })),
      "working",
    );
  });

  it("lets the wait key outrank the pending first sale — the hold can ramp past working pace", () => {
    assert.equal(
      timeSpeed(withPlayer({ waiting: true }, fresh({ stand: [shelf()] }))),
      "waiting",
    );
  });
});
