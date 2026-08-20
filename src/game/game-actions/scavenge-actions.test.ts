import assert from "node:assert";
import { describe, it } from "node:test";
import { GameState } from "../GameState";
import { initialGameState } from "../initialGameState";
import { truckCabSideCell } from "../lot";
import { ScavengingTrip } from "../Person";
import { TICKS_PER_DAY } from "../time";
import { needsFirstPallet } from "../tutorial";
import {
  keepScavengingBlock,
  rollScavengeStops,
  SCAVENGE_STOP_NAMES,
  SCAVENGE_STOP_TICKS,
} from "./scavenge-actions";

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
    const stops = rollScavengeStops(
      fakeRng([0.9]),
      needsFirstPallet(stateWithFreeSelling()),
    );
    assert.ok(stops[0].pallet);
  });

  it("a shop that has wood rolls the circuit straight", () => {
    const pallet = rollScavengeStops(fakeRng([0.1]))[0].pallet;
    assert.ok(pallet);
    const base = stateWithFreeSelling();
    const state: GameState = {
      ...base,
      truck: { ...base.truck, bed: [pallet] },
    };
    const stops = rollScavengeStops(fakeRng([0.9]), needsFirstPallet(state));
    // The washout plant lands wherever the roll says, not at stop one
    assert.strictEqual(stops[0].pallet, null);
    assert.strictEqual(stops.filter((stop) => stop.pallet !== null).length, 1);
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
