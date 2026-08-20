import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "../board-helpers";
import { GameState } from "../GameState";
import { MachineState } from "../Machine";
import { initialGameState } from "../initialGameState";
import {
  deliverMachineCrate,
  explainUnpackRefusal,
  freshMachineState,
  pickUpMachineAction,
} from "./machine-actions";
import { BASE_WALK_SPEED, playerWalkSpeed } from "../player-motion";

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

describe("pickUpMachineAction", () => {
  it("moves an idle, empty machine into the player's arms", () => {
    const saw = machineAt("miterSaw", [2, 2]);
    const result = pickUpMachineAction(saw)(stateWith({ machines: [saw] }));
    assert.strictEqual(result.machines.length, 0);
    assert.strictEqual(result.player.carriedMachine, saw);
  });

  it("refuses while the machine holds materials", () => {
    const saw = machineAt("miterSaw", [2, 2], {
      inputMaterials: [board("pallet", 24, 4, 2)],
    });
    const state = stateWith({ machines: [saw] });
    assert.strictEqual(pickUpMachineAction(saw)(state), state);
  });

  it("refuses mid-operation", () => {
    const saw = machineAt("miterSaw", [2, 2], {
      operationProgress: {
        status: "inProgress",
        phaseIndex: 0,
        ticksRemaining: 3,
      },
    });
    const state = stateWith({ machines: [saw] });
    assert.strictEqual(pickUpMachineAction(saw)(state), state);
  });

  it("refuses while the player's hands are full", () => {
    const saw = machineAt("miterSaw", [2, 2]);
    const state = stateWith({
      machines: [saw],
      player: {
        ...initialGameState.player,
        inventory: [board("pallet", 24, 4, 2)],
      },
    });
    assert.strictEqual(pickUpMachineAction(saw)(state), state);
  });

  it("refuses while already carrying a machine", () => {
    const saw = machineAt("miterSaw", [2, 2]);
    const state = stateWith({
      machines: [saw],
      player: {
        ...initialGameState.player,
        carriedMachine: freshMachineState(
          "jointer",
          initialGameState.progression,
        ),
      },
    });
    assert.strictEqual(pickUpMachineAction(saw)(state), state);
  });
});

describe("explainUnpackRefusal", () => {
  it("has nothing to say with empty hands", () => {
    assert.strictEqual(explainUnpackRefusal(initialGameState), null);
  });

  it("agrees with the action about an armload", () => {
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

describe("deliverMachineCrate", () => {
  it("lands the crate on the open floor nearest the entrance", () => {
    const machine = freshMachineState("miterSaw", initialGameState.progression);
    const result = deliverMachineCrate(initialGameState, machine);
    assert.deepStrictEqual(
      result.machineCrates[0].position,
      initialGameState.shopInfo.entrancePosition,
    );
  });

  it("skips cells that already hold a crate", () => {
    const machine = freshMachineState("miterSaw", initialGameState.progression);
    const once = deliverMachineCrate(initialGameState, machine);
    const twice = deliverMachineCrate(once, machine);
    assert.strictEqual(twice.machineCrates.length, 2);
    assert.notDeepStrictEqual(
      twice.machineCrates[1].position,
      twice.machineCrates[0].position,
    );
  });
});
