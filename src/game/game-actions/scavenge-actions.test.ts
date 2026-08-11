import assert from "node:assert";
import { describe, it } from "node:test";
import { GameState } from "../GameState";
import { initialGameState } from "../initialGameState";
import { truckCabSideCell } from "../lot";
import { personCanWork, ScavengingTrip } from "../Person";
import { TICKS_PER_DAY } from "../time";
import {
  continueScavengingAction,
  headHomeFromScavengingAction,
  keepScavengingBlock,
  rollScavengeStops,
  scavengeLoot,
  SCAVENGE_STOP_NAMES,
  SCAVENGE_STOP_TICKS,
  startScavengingAction,
} from "./scavenge-actions";
import { tickAction } from "./tickAction";

/** rng stub cycling through the given values */
function fakeRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

/** The player standing at the truck's cab. */
function stateWithFreeSelling(): GameState {
  return {
    ...initialGameState,
    player: {
      ...initialGameState.player,
      position: truckCabSideCell(initialGameState.shopInfo),
    },
  };
}

/** A trip mid-decision, one stop searched (a find, on the cycling 0.1s). */
function tripWith(overrides: Partial<ScavengingTrip>): ScavengingTrip {
  return {
    kind: "scavenging",
    startTick: 0,
    stops: rollScavengeStops(fakeRng([0.1])),
    stopsSearched: 1,
    phase: { kind: "deciding" },
    ...overrides,
  };
}

function stateWithTrip(
  trip: ScavengingTrip,
  overrides: Partial<GameState> = {},
): GameState {
  return {
    ...initialGameState,
    ...overrides,
    player: { ...initialGameState.player, away: trip },
  };
}

describe("rollScavengeStops", () => {
  it("rolls a result for every stop on the circuit", () => {
    const stops = rollScavengeStops(fakeRng([0.1]));
    assert.strictEqual(stops.length, SCAVENGE_STOP_NAMES.length);
    assert.deepStrictEqual(
      stops.map((stop) => stop.stopName),
      [...SCAVENGE_STOP_NAMES],
    );
  });

  it("produces pallets with 5-8 deck boards and 2-3 stringers", () => {
    for (const roll of [0, 0.25, 0.5, 0.75, 0.999]) {
      const [first] = rollScavengeStops(fakeRng([0.1, roll]));
      assert.ok(first.pallet, "a 0.1 find roll should find a pallet");
      const deckCount = first.pallet.deckBoards.filter(Boolean).length;
      assert.ok(deckCount >= 5 && deckCount <= 8, `deck=${deckCount}`);
      const stringerCount = first.pallet.stringers.filter(Boolean).length;
      assert.ok(stringerCount >= 2 && stringerCount <= 3);
    }
  });

  it("plants one find on an all-empty roll — no trip can strike out completely", () => {
    const stops = rollScavengeStops(fakeRng([0.9]));
    assert.strictEqual(stops.filter((stop) => stop.pallet !== null).length, 1);
  });
});

describe("the first-trip guarantee", () => {
  it("moves the washout plant to the first stop", () => {
    const stops = rollScavengeStops(fakeRng([0.9]), true);
    assert.ok(stops[0].pallet, "stop one should hold the guaranteed find");
  });

  it("leaves a lucky circuit alone", () => {
    const stops = rollScavengeStops(fakeRng([0.1]), true);
    // Every stop found its own pallet; nothing extra was planted
    assert.strictEqual(
      stops.filter((stop) => stop.pallet !== null).length,
      SCAVENGE_STOP_NAMES.length,
    );
  });

  it("a brand-new shop's trip can't miss at stop one", () => {
    const result = startScavengingAction(fakeRng([0.9]))(
      stateWithFreeSelling(),
    );
    const away = result.player.away as ScavengingTrip;
    assert.ok(away.stops[0].pallet);
  });

  it("a shop that has wood rolls the circuit straight", () => {
    const pallet = rollScavengeStops(fakeRng([0.1]))[0].pallet;
    assert.ok(pallet);
    const base = stateWithFreeSelling();
    const state: GameState = {
      ...base,
      truck: { ...base.truck, bed: [pallet] },
    };
    const result = startScavengingAction(fakeRng([0.9]))(state);
    const away = result.player.away as ScavengingTrip;
    // The washout plant lands wherever the roll says, not at stop one
    assert.strictEqual(away.stops[0].pallet, null);
    assert.strictEqual(
      away.stops.filter((stop) => stop.pallet !== null).length,
      1,
    );
  });
});

describe("startScavengingAction", () => {
  it("sends the player into the first stop's search", () => {
    const result = startScavengingAction(fakeRng([0.1]))(
      stateWithFreeSelling(),
    );
    const away = result.player.away;
    assert.ok(away);
    assert.strictEqual(away?.kind, "scavenging");
    if (away?.kind === "scavenging") {
      assert.strictEqual(away.startTick, result.tick);
      assert.strictEqual(away.stops.length, SCAVENGE_STOP_NAMES.length);
      assert.strictEqual(away.stopsSearched, 0);
      assert.deepStrictEqual(away.phase, {
        kind: "searching",
        doneTick: result.tick + SCAVENGE_STOP_TICKS,
      });
      // Nothing is loaded until a search actually finishes
      assert.strictEqual(scavengeLoot(away).length, 0);
    }
    assert.strictEqual(personCanWork(result.player), false);
  });

  it("does nothing before free selling is unlocked", () => {
    const state = initialGameState;
    assert.strictEqual(startScavengingAction(fakeRng([0.1]))(state), state);
  });

  it("does nothing away from the cab", () => {
    const state: GameState = {
      ...stateWithFreeSelling(),
      player: { ...stateWithFreeSelling().player, position: [0, 0] },
    };
    assert.strictEqual(startScavengingAction(fakeRng([0.1]))(state), state);
  });

  it("does nothing when the player is already away", () => {
    const awayState = startScavengingAction(fakeRng([0.1]))(
      stateWithFreeSelling(),
    );
    assert.strictEqual(
      startScavengingAction(fakeRng([0.1]))(awayState),
      awayState,
    );
  });

  it("does nothing at night", () => {
    const state: GameState = {
      ...stateWithFreeSelling(),
      tick: TICKS_PER_DAY,
    };
    assert.strictEqual(startScavengingAction(fakeRng([0.1]))(state), state);
  });
});

describe("the search tick", () => {
  it("reveals the stop, loads the find, and parks at a decision", () => {
    const started = startScavengingAction(fakeRng([0.1]))(
      stateWithFreeSelling(),
    );
    const trip = started.player.away as ScavengingTrip;
    assert.strictEqual(trip.phase.kind, "searching");
    const doneTick =
      trip.phase.kind === "searching" ? trip.phase.doneTick : NaN;

    const result = tickAction({ ...started, tick: doneTick });
    const away = result.player.away;
    assert.strictEqual(away?.kind, "scavenging");
    if (away?.kind === "scavenging") {
      assert.strictEqual(away.stopsSearched, 1);
      assert.deepStrictEqual(away.phase, { kind: "deciding" });
      // The cycling 0.1s find a pallet at every stop, so the first
      // search loaded one — with the thud to prove it
      assert.strictEqual(scavengeLoot(away).length, 1);
      assert.ok(
        result.pendingSounds?.some((sound) => sound.kind === "pallet-load"),
        "a find should queue the pallet-load sound",
      );
    }
  });

  it("stays quiet over an empty-handed stop", () => {
    // A shop with wood already, so the first-trip guarantee stays out of
    // it: all-0.9 rolls leave every stop empty except the planted find
    // at the last stop, so the first stop reveals nothing
    const pallet = rollScavengeStops(fakeRng([0.1]))[0].pallet;
    assert.ok(pallet);
    const base = stateWithFreeSelling();
    const started = startScavengingAction(fakeRng([0.9]))({
      ...base,
      truck: { ...base.truck, bed: [pallet] },
    });
    const trip = started.player.away as ScavengingTrip;
    const doneTick =
      trip.phase.kind === "searching" ? trip.phase.doneTick : NaN;

    const result = tickAction({ ...started, tick: doneTick });
    const away = result.player.away;
    if (away?.kind === "scavenging") {
      assert.strictEqual(scavengeLoot(away).length, 0);
    }
    assert.ok(
      !result.pendingSounds?.some((sound) => sound.kind === "pallet-load"),
    );
  });
});

describe("keepScavengingBlock", () => {
  it("allows another stop with daylight and circuit to spare", () => {
    assert.strictEqual(keepScavengingBlock(stateWithTrip(tripWith({}))), null);
  });

  it("refuses outside a decision", () => {
    const searching = tripWith({
      phase: { kind: "searching", doneTick: 100 },
    });
    assert.strictEqual(
      keepScavengingBlock(stateWithTrip(searching)),
      "notDeciding",
    );
  });

  it("refuses once the circuit is used up", () => {
    const usedUp = tripWith({
      stopsSearched: SCAVENGE_STOP_NAMES.length,
    });
    assert.strictEqual(
      keepScavengingBlock(stateWithTrip(usedUp)),
      "outOfStops",
    );
  });

  it("refuses when the search would run past close", () => {
    const lateTick = TICKS_PER_DAY - SCAVENGE_STOP_TICKS + 1;
    assert.strictEqual(
      keepScavengingBlock(stateWithTrip(tripWith({}), { tick: lateTick })),
      "outOfDaylight",
    );
    // One tick earlier still fits
    assert.strictEqual(
      keepScavengingBlock(stateWithTrip(tripWith({}), { tick: lateTick - 1 })),
      null,
    );
  });
});

describe("continueScavengingAction", () => {
  it("heads for the next stop, another search on the clock", () => {
    const state = stateWithTrip(tripWith({}), { tick: 100 });
    const result = continueScavengingAction()(state);
    const away = result.player.away;
    assert.strictEqual(away?.kind, "scavenging");
    if (away?.kind === "scavenging") {
      assert.deepStrictEqual(away.phase, {
        kind: "searching",
        doneTick: 100 + SCAVENGE_STOP_TICKS,
      });
      assert.strictEqual(away.stopsSearched, 1);
    }
  });

  it("does nothing when blocked", () => {
    const usedUp = stateWithTrip(
      tripWith({ stopsSearched: SCAVENGE_STOP_NAMES.length }),
    );
    assert.strictEqual(continueScavengingAction()(usedUp), usedUp);
  });
});

describe("headHomeFromScavengingAction", () => {
  it("pulls back into the shop with the haul, no time spent", () => {
    const trip = tripWith({ stopsSearched: 2 });
    const state = stateWithTrip(trip, { tick: 100 });
    const result = headHomeFromScavengingAction()(state);
    assert.strictEqual(result.player.away, null);
    // The drive back is free — the tick hasn't moved
    assert.strictEqual(result.tick, 100);
    assert.deepStrictEqual(result.truck.bed, [...scavengeLoot(trip)]);
    // The finds at the un-searched stops stay out there
    assert.strictEqual(result.truck.bed.length, 2);
    assert.deepStrictEqual(
      result.player.position,
      truckCabSideCell(result.shopInfo),
    );
    // Nothing appears on the shop floor — the haul waits at the tailgate
    assert.strictEqual(result.materialPiles.length, 0);
  });

  it("still works after close — driving back after hours is allowed", () => {
    const state = stateWithTrip(tripWith({}), { tick: TICKS_PER_DAY + 5 });
    const result = headHomeFromScavengingAction()(state);
    assert.strictEqual(result.player.away, null);
  });

  it("does nothing mid-search", () => {
    const state = stateWithTrip(
      tripWith({ phase: { kind: "searching", doneTick: 100 } }),
    );
    assert.strictEqual(headHomeFromScavengingAction()(state), state);
  });
});
