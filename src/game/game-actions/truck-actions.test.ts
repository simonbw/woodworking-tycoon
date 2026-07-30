import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "../board-helpers";
import { GameState } from "../GameState";
import { initialGameState } from "../initialGameState";
import { freshMachineState } from "./machine-actions";
import {
  loadTruckBedAction,
  takeCrateFromTruckAction,
  takeFromTruckBedAction,
} from "./truck-actions";

/** Standing in the tailgate aisle, one step out the door. */
const AT_BED: [number, number] = [6, 17];

function stateAt(
  position: [number, number],
  truck: Partial<GameState["truck"]> = {},
  inventory: GameState["player"]["inventory"] = [],
): GameState {
  return {
    ...initialGameState,
    player: { ...initialGameState.player, position, inventory },
    truck: { bed: [], crates: [], ...truck },
  };
}

describe("loadTruckBedAction", () => {
  it("moves carried stock over the rail into the bed", () => {
    const stock = board("pine", 4, 4, 1);
    const result = loadTruckBedAction([stock])(stateAt(AT_BED, {}, [stock]));
    assert.deepStrictEqual(result.truck.bed, [stock]);
    assert.strictEqual(result.player.inventory.length, 0);
  });

  it("does nothing away from the bed", () => {
    const stock = board("pine", 4, 4, 1);
    const state = stateAt([6, 12], {}, [stock]);
    assert.strictEqual(loadTruckBedAction([stock])(state), state);
  });
});

describe("takeFromTruckBedAction", () => {
  it("lifts stock out of the bed into the arms", () => {
    const stock = board("pine", 4, 4, 1);
    const result = takeFromTruckBedAction([stock])(
      stateAt(AT_BED, { bed: [stock] }),
    );
    assert.deepStrictEqual(result.player.inventory, [stock]);
    assert.strictEqual(result.truck.bed.length, 0);
  });

  it("does nothing from indoors, even at the door", () => {
    const stock = board("pine", 4, 4, 1);
    const state = stateAt([6, 15], { bed: [stock] });
    assert.strictEqual(takeFromTruckBedAction([stock])(state), state);
  });

  it("refuses an armful bigger than the room left in the hands", () => {
    // HAND_CAPACITY is 2: one board carried leaves room for one more
    const inBed = [board("pine", 4, 4, 1), board("pine", 4, 4, 1)];
    const state = stateAt(AT_BED, { bed: inBed }, [board("pine", 2, 4, 1)]);
    assert.strictEqual(takeFromTruckBedAction(inBed)(state), state);
  });
});

describe("takeCrateFromTruckAction", () => {
  it("hoists a crated machine onto the shoulders", () => {
    const crate = freshMachineState("miterSaw", initialGameState.progression);
    const result = takeCrateFromTruckAction("miterSaw")(
      stateAt(AT_BED, { crates: [crate] }),
    );
    assert.strictEqual(result.player.carriedMachine, crate);
    assert.strictEqual(result.truck.crates.length, 0);
  });

  it("needs genuinely empty hands", () => {
    const crate = freshMachineState("miterSaw", initialGameState.progression);
    const state = stateAt(AT_BED, { crates: [crate] }, [
      board("pine", 4, 4, 1),
    ]);
    assert.strictEqual(takeCrateFromTruckAction()(state), state);
  });
});
