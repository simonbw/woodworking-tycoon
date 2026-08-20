import assert from "node:assert";
import { describe, it } from "node:test";
import {
  FLOOR_WORK_PENALTY,
  isBenchtopOnFloor,
  isMountedOnWorktable,
  stationWorkSpeed,
} from "./bench-mounting";
import { CellMap } from "./CellMap";
import { GameState } from "./GameState";
import { machineViews, Machine, MachineState } from "./Machine";
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

/** The floor's cell map plus a lookup of the placed machine view. */
function shopWith(machines: ReadonlyArray<MachineState>): {
  gameState: GameState;
  cellMap: CellMap;
  machine: (typeId: string) => Machine;
} {
  const gameState: GameState = { ...initialGameState, machines };
  const views = machineViews(machines);
  return {
    gameState,
    cellMap: CellMap.fromGameState(gameState),
    machine: (typeId) => views.find((m) => m.type.id === typeId)!,
  };
}

describe("benchtop mounting", () => {
  // A 6'×2' run of two tables pushed together: the full-size table's top
  // spans x 0..3, the small one continues it over x 4..5. The miter
  // saw's 3×2 footprint fits entirely on the run when anchored at [1,1]
  // (see worktables.test.ts).
  const run = [
    machineAt("worktable1x2", [0, 0]),
    machineAt("worktable1x1", [4, 0]),
  ];

  it("counts a benchtop machine wholly on a table as mounted", () => {
    const { gameState, machine } = shopWith([
      ...run,
      machineAt("miterSaw", [1, 1]),
    ]);
    assert.ok(isMountedOnWorktable(machine("miterSaw"), CellMap.fromGameState(gameState)));
    assert.ok(!isBenchtopOnFloor(machine("miterSaw"), CellMap.fromGameState(gameState)));
  });

  it("counts a machine straddling the seam between two tables as mounted", () => {
    // Anchored at [4,1], the saw's footprint covers x 3..5 — one column
    // on the full-size table, two on the small one. Mounting is per
    // cell, so a run of tables carries a machine the same as one table.
    const { gameState, machine } = shopWith([
      ...run,
      machineAt("miterSaw", [4, 1]),
    ]);
    assert.ok(isMountedOnWorktable(machine("miterSaw"), CellMap.fromGameState(gameState)));
    assert.ok(!isBenchtopOnFloor(machine("miterSaw"), CellMap.fromGameState(gameState)));
  });

  it("counts a benchtop machine on bare floor as not mounted", () => {
    const { gameState, machine } = shopWith([machineAt("miterSaw", [6, 6])]);
    assert.ok(!isMountedOnWorktable(machine("miterSaw"), CellMap.fromGameState(gameState)));
    assert.ok(isBenchtopOnFloor(machine("miterSaw"), CellMap.fromGameState(gameState)));
  });

  it("does not count a machine half off the table as mounted", () => {
    // Anchored at [5,1], the saw's footprint runs past the run's right
    // edge — one foot on the top, one on the ground.
    const { gameState, machine } = shopWith([
      ...run,
      machineAt("miterSaw", [5, 1]),
    ]);
    assert.ok(!isMountedOnWorktable(machine("miterSaw"), CellMap.fromGameState(gameState)));
    assert.ok(isBenchtopOnFloor(machine("miterSaw"), CellMap.fromGameState(gameState)));
  });

  it("leaves floor-standing machines alone", () => {
    // The band saw belongs on the floor: no penalty, and it is never
    // "mounted" however it's placed.
    const { gameState, machine } = shopWith([machineAt("bandSaw", [6, 6])]);
    assert.ok(!isMountedOnWorktable(machine("bandSaw"), CellMap.fromGameState(gameState)));
    assert.ok(!isBenchtopOnFloor(machine("bandSaw"), CellMap.fromGameState(gameState)));
    assert.strictEqual(
      stationWorkSpeed(machine("bandSaw"), CellMap.fromGameState(gameState)),
      machine("bandSaw").workSpeed,
    );
  });
});

describe("the floor penalty", () => {
  const table = machineAt("worktable1x2", [0, 0]);

  it("halves work speed for a benchtop machine on the floor", () => {
    const onFloor = shopWith([machineAt("miterSaw", [6, 6])]);
    const mounted = shopWith([table, machineAt("miterSaw", [1, 1])]);
    assert.strictEqual(
      stationWorkSpeed(mounted.machine("miterSaw"), mounted.cellMap) /
        stationWorkSpeed(onFloor.machine("miterSaw"), onFloor.cellMap),
      FLOOR_WORK_PENALTY,
    );
  });

  it("runs a mounted machine at its own undiminished speed", () => {
    const { gameState, machine } = shopWith([
      table,
      machineAt("miterSaw", [1, 1]),
    ]);
    assert.strictEqual(
      stationWorkSpeed(machine("miterSaw"), CellMap.fromGameState(gameState)),
      machine("miterSaw").workSpeed,
    );
  });

  it("ignores the hosting table's own speed and upgrades", () => {
    // The penalty is binary: a vise on the bench has no business making
    // the saw cut faster.
    const bare = shopWith([table, machineAt("miterSaw", [1, 1])]);
    const upgraded = shopWith([
      machineAt("worktable1x2", [0, 0], { upgrades: ["vise"] }),
      machineAt("miterSaw", [1, 1]),
    ]);
    assert.strictEqual(
      stationWorkSpeed(upgraded.machine("miterSaw"), upgraded.cellMap),
      stationWorkSpeed(bare.machine("miterSaw"), bare.cellMap),
    );
  });
});
