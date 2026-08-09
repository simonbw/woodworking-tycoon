import assert from "node:assert";
import { describe, it } from "node:test";
import {
  FLOOR_WORK_PENALTY,
  isBenchtopOnFloor,
  isMountedOnWorktable,
  stationWorkSpeed,
} from "./bench-mounting";
import { GameState } from "./GameState";
import { getMachines, Machine, MachineState } from "./Machine";
import { initialGameState } from "./initialGameState";

function machineAt(
  machineTypeId: MachineState["machineTypeId"],
  position: [number, number],
  overrides: Partial<MachineState> = {},
): MachineState {
  return {
    machineTypeId,
    position,
    rotation: 0,
    inputMaterials: [],
    processingMaterials: [],
    outputMaterials: [],
    selectedOperationId: "none",
    selectedParameters: undefined,
    operationProgress: {
      status: "notStarted",
      phaseIndex: 0,
      ticksRemaining: 0,
    },
    tools: [],
    storedMaterials: [],
    ...overrides,
  };
}

/** The state plus a lookup of the placed machine view by type id. */
function shopWith(machines: ReadonlyArray<MachineState>): {
  gameState: GameState;
  machine: (typeId: string) => Machine;
} {
  const gameState: GameState = { ...initialGameState, machines };
  const views = getMachines(machines);
  return {
    gameState,
    machine: (typeId) => views.find((m) => m.type.id === typeId)!,
  };
}

describe("benchtop mounting", () => {
  // A 6'×2' table at the origin; the miter saw's 3×2 footprint fits
  // entirely on its top when anchored at [1,1] (see worktables.test.ts).
  const table = machineAt("worktable1x3", [0, 0]);

  it("counts a benchtop machine wholly on a table as mounted", () => {
    const { gameState, machine } = shopWith([
      table,
      machineAt("miterSaw", [1, 1]),
    ]);
    assert.ok(isMountedOnWorktable(machine("miterSaw"), gameState));
    assert.ok(!isBenchtopOnFloor(machine("miterSaw"), gameState));
  });

  it("counts a benchtop machine on bare floor as not mounted", () => {
    const { gameState, machine } = shopWith([machineAt("miterSaw", [6, 6])]);
    assert.ok(!isMountedOnWorktable(machine("miterSaw"), gameState));
    assert.ok(isBenchtopOnFloor(machine("miterSaw"), gameState));
  });

  it("does not count a machine half off the table as mounted", () => {
    // Anchored at [5,1], the saw's footprint runs past the table's right
    // edge — one foot on the top, one on the ground.
    const { gameState, machine } = shopWith([
      table,
      machineAt("miterSaw", [5, 1]),
    ]);
    assert.ok(!isMountedOnWorktable(machine("miterSaw"), gameState));
    assert.ok(isBenchtopOnFloor(machine("miterSaw"), gameState));
  });

  it("leaves floor-standing machines alone", () => {
    // The band saw belongs on the floor: no penalty, and it is never
    // "mounted" however it's placed.
    const { gameState, machine } = shopWith([machineAt("bandSaw", [6, 6])]);
    assert.ok(!isMountedOnWorktable(machine("bandSaw"), gameState));
    assert.ok(!isBenchtopOnFloor(machine("bandSaw"), gameState));
    assert.strictEqual(
      stationWorkSpeed(machine("bandSaw"), gameState),
      machine("bandSaw").workSpeed,
    );
  });
});

describe("the floor penalty", () => {
  const table = machineAt("worktable1x3", [0, 0]);

  it("halves work speed for a benchtop machine on the floor", () => {
    const onFloor = shopWith([machineAt("miterSaw", [6, 6])]);
    const mounted = shopWith([table, machineAt("miterSaw", [1, 1])]);
    assert.strictEqual(
      stationWorkSpeed(mounted.machine("miterSaw"), mounted.gameState) /
        stationWorkSpeed(onFloor.machine("miterSaw"), onFloor.gameState),
      FLOOR_WORK_PENALTY,
    );
  });

  it("runs a mounted machine at its own undiminished speed", () => {
    const { gameState, machine } = shopWith([
      table,
      machineAt("miterSaw", [1, 1]),
    ]);
    assert.strictEqual(
      stationWorkSpeed(machine("miterSaw"), gameState),
      machine("miterSaw").workSpeed,
    );
  });

  it("ignores the hosting table's own speed and upgrades", () => {
    // The penalty is binary: a vise on the bench has no business making
    // the saw cut faster.
    const bare = shopWith([table, machineAt("miterSaw", [1, 1])]);
    const upgraded = shopWith([
      machineAt("worktable1x3", [0, 0], { upgrades: ["vise"] }),
      machineAt("miterSaw", [1, 1]),
    ]);
    assert.strictEqual(
      stationWorkSpeed(upgraded.machine("miterSaw"), upgraded.gameState),
      stationWorkSpeed(bare.machine("miterSaw"), bare.gameState),
    );
  });
});
