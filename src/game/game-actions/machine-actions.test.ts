import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "../board-helpers";
import { GameState } from "../GameState";
import { MachineState } from "../Machine";
import { initialGameState } from "../initialGameState";
import { explainUnpackRefusal, freshMachineState } from "./machine-actions";
import { BASE_WALK_SPEED, playerWalkSpeed } from "../player-motion";

/**
 * The pure helpers behind carrying machines. Lifting one off the floor
 * and landing a delivered crate are driven through the commands in
 * `sim/sequences/machine-carrying.test.ts`.
 */

function machineAt(
  machineTypeId: MachineState["machineTypeId"],
  position: [number, number],
  overrides: Partial<MachineState> = {},
): MachineState {
  return {
    ...freshMachineState(machineTypeId, initialGameState.progression),
    position,
    ...overrides,
  };
}

function stateWith(overrides: Partial<GameState>): GameState {
  return { ...initialGameState, ...overrides };
}

describe("explainUnpackRefusal", () => {
  it("has nothing to say with empty hands", () => {
    assert.strictEqual(explainUnpackRefusal(initialGameState), null);
  });

  it("agrees with the command about an armload", () => {
    const holding = stateWith({
      player: { ...initialGameState.player, inventory: [board("pine", 12)] },
    });
    assert.strictEqual(
      explainUnpackRefusal(holding),
      "empty your hands to unpack",
    );
  });

  it("names the vac when it's the thing in hand", () => {
    const dragging = stateWith({ shopVac: { position: null, canister: {} } });
    assert.strictEqual(
      explainUnpackRefusal(dragging),
      "set the vac down to unpack",
    );
  });
});

describe("carry weight", () => {
  it("walks at full speed even under the biggest bench", () => {
    const state = stateWith({
      machines: [],
      player: {
        ...initialGameState.player,
        position: [2, 2],
        carriedMachine: machineAt("worktable1x2", [0, 0]),
      },
    });
    assert.strictEqual(playerWalkSpeed(state), BASE_WALK_SPEED);
  });
});
