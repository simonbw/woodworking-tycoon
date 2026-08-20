import assert from "node:assert";
import { describe, it } from "node:test";
import { CellMap } from "../CellMap";
import { GameState } from "../GameState";
import { MACHINE_TYPES, Operation, MachineState } from "../Machine";
import { initialGameState } from "../initialGameState";
import {
  canPlaceMachine,
  machinesMountedOnTable,
} from "../game-actions/machine-actions";
import { getOperationPhases } from "../skill-helpers";
import { workspace } from "./workspace";
import { worktable1x1, worktable1x2 } from "./worktables";

/**
 * What a worktable is: the recipes that build one, the stats it beats the
 * makeshift bench with, and the placement rules that let benchtop
 * machines stand on it. Carrying a table, its shelf, and the crate a
 * finished build lands in are driven through the live commands in
 * `sim/commands/machine-commands.test.ts`.
 */

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

function stateWith(overrides: Partial<GameState>): GameState {
  return { ...initialGameState, ...overrides };
}

describe("worktable build recipes", () => {
  const buildSmall = workspace.operations.find(
    (op) => op.id === "build-worktable1x1",
  ) as Operation;

  it("every bench station carries both build recipes", () => {
    for (const stationType of [workspace, worktable1x1]) {
      for (const table of ["worktable1x1", "worktable1x2"]) {
        assert.ok(
          stationType.operations.some((op) => op.id === `build-${table}`),
          `${stationType.id} should offer build-${table}`,
        );
      }
    }
  });

  it("outputs the table as a machine, not a material", () => {
    const result = buildSmall.output([], {});
    assert.deepStrictEqual(result.outputs, []);
    assert.deepStrictEqual(result.machineOutputs, ["worktable1x1"]);
  });
});

describe("worktable stats", () => {
  it("beats the makeshift workbench on speed, slots, and shelf", () => {
    assert.ok((worktable1x1.workSpeed ?? 1) > (workspace.workSpeed ?? 1));
    assert.ok(worktable1x1.toolSlots > workspace.toolSlots);
    assert.ok(worktable1x1.materialStorage > workspace.materialStorage);
  });

  it("work speed shortens attended phases but never the glue cure", () => {
    const glueUp = workspace.operations.find(
      (op) => op.id === "glueUpPanel",
    ) as Operation;
    const baseline = getOperationPhases(glueUp, initialGameState.progression);
    const atTable = getOperationPhases(
      glueUp,
      initialGameState.progression,
      1,
      worktable1x1.workSpeed,
    );
    assert.ok(atTable[0].duration < baseline[0].duration, "clamping speeds up");
    assert.strictEqual(atTable[1].duration, baseline[1].duration);
  });
});

describe("benchtop mounting placement rules", () => {
  const table = machineAt("worktable1x2", [0, 0]);

  function cellMapWith(machines: ReadonlyArray<MachineState>): CellMap {
    return CellMap.fromGameState(stateWith({ machines }));
  }

  it("allows a benchtop machine on free worktable cells", () => {
    // Miter saw anchored at [1,1]: its whole 3×2 footprint lands on the
    // table top and its operator cells are open floor below
    assert.ok(
      canPlaceMachine(cellMapWith([table]), MACHINE_TYPES.miterSaw, [1, 1], 0),
    );
  });

  it("rejects a benchtop machine on table cells already hosting one", () => {
    const saw = machineAt("miterSaw", [1, 1]);
    assert.ok(
      !canPlaceMachine(
        cellMapWith([table, saw]),
        MACHINE_TYPES.lunchboxPlaner,
        [1, 1],
        0,
      ),
    );
  });

  it("rejects a non-benchtop machine on a table cell", () => {
    assert.ok(
      !canPlaceMachine(
        cellMapWith([table]),
        MACHINE_TYPES.garbageCan,
        [1, 0],
        0,
      ),
    );
  });

  it("rejects a table overlapping another table", () => {
    assert.ok(
      !canPlaceMachine(
        cellMapWith([table]),
        MACHINE_TYPES.worktable1x1,
        [2, 0],
        0,
      ),
    );
  });

  it("counts table cells as blocked for another machine's free cells", () => {
    // Planer just below the table, feeding toward it: its outfeed
    // clearance cells land on the table top — the table blocks it
    assert.ok(
      !canPlaceMachine(
        cellMapWith([table]),
        MACHINE_TYPES.lunchboxPlaner,
        [1, 3],
        0,
      ),
    );
  });

  it("stacks the cell map: benchtop on top, table underneath", () => {
    const saw = machineAt("miterSaw", [1, 1]);
    // Order in gameState.machines must not matter
    for (const machines of [
      [table, saw],
      [saw, table],
    ]) {
      const cell = cellMapWith(machines).at([1, 1])!;
      assert.strictEqual(cell.machine?.type.id, "miterSaw");
      assert.strictEqual(cell.tableMachine?.type.id, "worktable1x2");
    }
  });
});

describe("moving and removing tables", () => {
  const table = machineAt("worktable1x2", [0, 0]);
  const saw = machineAt("miterSaw", [1, 1]);

  it("reports machines mounted on a table", () => {
    const state = stateWith({ machines: [table, saw] });
    assert.strictEqual(machinesMountedOnTable(state.machines, 0).length, 1);
    assert.strictEqual(machinesMountedOnTable(state.machines, 1).length, 0);
  });
});
