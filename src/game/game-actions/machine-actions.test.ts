import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "../board-helpers";
import { GameState } from "../GameState";
import { MACHINE_TYPES, MachineState } from "../Machine";
import { initialGameState } from "../initialGameState";
import {
  canPutDownCarriedMachine,
  carriedMachinePlacement,
  carryMoveBusyTicks,
  deliverMachineCrate,
  freshMachineState,
  pickUpCrateAction,
  pickUpMachineAction,
  putDownCarriedMachineAction,
  rotateCarriedMachineAction,
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
      inputMaterials: [board("pallet", 2, 4, 1)],
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
        inventory: [board("pallet", 2, 4, 1)],
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

describe("pickUpCrateAction", () => {
  it("unpacks the crate underfoot into the player's arms", () => {
    const machine = freshMachineState("miterSaw", initialGameState.progression);
    const state = stateWith({
      machineCrates: [{ machine, position: [2, 5] }],
      player: { ...initialGameState.player, position: [2, 5] },
    });
    const result = pickUpCrateAction()(state);
    assert.strictEqual(result.machineCrates.length, 0);
    assert.strictEqual(result.player.carriedMachine, machine);
  });

  it("does nothing without a crate underfoot", () => {
    const machine = freshMachineState("miterSaw", initialGameState.progression);
    const state = stateWith({
      machineCrates: [{ machine, position: [2, 5] }],
      player: { ...initialGameState.player, position: [0, 0] },
    });
    assert.strictEqual(pickUpCrateAction()(state), state);
  });
});

describe("putting the carried machine down", () => {
  const carryingState = (
    carried: MachineState,
    playerOverrides: Partial<GameState["player"]> = {},
  ) =>
    stateWith({
      machines: [],
      player: {
        ...initialGameState.player,
        position: [5, 5],
        direction: 0,
        carriedMachine: carried,
        ...playerOverrides,
      },
    });

  it("anchors the machine so the player stands at its operator cell", () => {
    // The miter saw's operator cell is [0, 2] machine-local; at rotation 0
    // the anchor lands two cells above the player (y - 2).
    const result = putDownCarriedMachineAction()(
      carryingState(machineAt("miterSaw", [0, 0])),
    );
    assert.strictEqual(result.player.carriedMachine, null);
    assert.strictEqual(result.machines.length, 1);
    assert.deepStrictEqual(result.machines[0].position, [5, 3]);
  });

  it("rotating spins the landing spot around the player", () => {
    const rotated = rotateCarriedMachineAction()(
      carryingState(machineAt("miterSaw", [0, 0])),
    );
    assert.strictEqual(rotated.player.carriedMachine?.rotation, 1);
    const placement = carriedMachinePlacement(rotated);
    // Operator offset [0,2] rotated once becomes [2,0]: anchor sits left
    assert.deepStrictEqual(placement?.position, [3, 5]);
  });

  it("machines without an operator cell land on the faced cell", () => {
    const result = putDownCarriedMachineAction()(
      carryingState(machineAt("garbageCan", [0, 0])),
    );
    // Facing direction 0 is +x
    assert.deepStrictEqual(result.machines[0].position, [6, 5]);
  });

  it("refuses when the landing cells are blocked", () => {
    const blocker = machineAt("garbageCan", [4, 2]);
    const state = {
      ...carryingState(machineAt("miterSaw", [0, 0])),
      machines: [blocker],
    };
    assert.strictEqual(canPutDownCarriedMachine(state), false);
    assert.strictEqual(putDownCarriedMachineAction()(state), state);
  });

  it("sets a benchtop machine down onto free worktable cells", () => {
    // A long worktable spanning [1..6, 2..3]: the saw's whole 3×2
    // footprint lands on the tabletop with the player at its operator cell
    const table = machineAt("worktable1x3", [1, 2]);
    const state = {
      ...carryingState(machineAt("miterSaw", [0, 0])),
      machines: [table],
    };
    const result = putDownCarriedMachineAction()(state);
    assert.strictEqual(result.machines.length, 2);
    assert.deepStrictEqual(result.machines[1].position, [5, 3]);
  });
});

describe("carry weight", () => {
  it("benchtop machines carry free; floor machines scale with footprint", () => {
    assert.strictEqual(carryMoveBusyTicks(MACHINE_TYPES.miterSaw), 0);
    assert.strictEqual(carryMoveBusyTicks(MACHINE_TYPES.garbageCan), 2);
    assert.strictEqual(carryMoveBusyTicks(MACHINE_TYPES.worktable2x2), 5);
  });

  it("slows the walk while carrying", () => {
    const state = stateWith({
      machines: [],
      player: {
        ...initialGameState.player,
        position: [2, 2],
        carriedMachine: machineAt("worktable1x1", [0, 0]),
      },
    });
    // worktable1x1 weighs 2 tick-equivalents: a third of walking pace
    assert.strictEqual(playerWalkSpeed(state), BASE_WALK_SPEED / 3);
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
