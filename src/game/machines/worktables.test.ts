import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "../board-helpers";
import { CellMap } from "../CellMap";
import { GameState } from "../GameState";
import {
  Machine,
  MACHINE_TYPES,
  MachineOperation,
  MachineState,
} from "../Machine";
import { initialGameState } from "../initialGameState";
import { makeMaterial } from "../material-helpers";
import { SheetGood } from "../Materials";
import {
  canPlaceMachine,
  machinesMountedOnTable,
  pickUpMachineAction,
} from "../game-actions/machine-actions";
import {
  stowMaterialsInMachineAction,
  takeStoredMaterialsFromMachineAction,
} from "../game-actions/player-actions";
import { tickAction } from "../game-actions/tickAction";
import { getOperationPhases } from "../skill-helpers";
import { workspace } from "./workspace";
import { worktable1x1, worktable1x3 } from "./worktables";

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

function plywoodSheet(): SheetGood {
  return makeMaterial<SheetGood>({
    type: "plywood",
    kind: "plywoodB",
    length: 4,
    width: 4,
    thickness: 2,
  });
}

describe("worktable build recipes", () => {
  const buildSmall = workspace.operations.find(
    (op) => op.id === "build-worktable1x1",
  ) as MachineOperation;

  it("every bench station carries all four build recipes", () => {
    for (const stationType of [workspace, worktable1x1]) {
      for (const table of [
        "worktable1x1",
        "worktable1x2",
        "worktable1x3",
        "worktable2x2",
      ]) {
        assert.ok(
          stationType.operations.some((op) => op.id === `build-${table}`),
          `${stationType.id} should offer build-${table}`,
        );
      }
    }
  });

  it("outputs the table as a machine, not a material", () => {
    const result = buildSmall.output([]);
    assert.deepStrictEqual(result.outputs, []);
    assert.deepStrictEqual(result.machineOutputs, ["worktable1x1"]);
  });

  it("delivers the finished table to machine storage on completion", () => {
    const machine = machineAt("workspace", [1, 2], {
      selectedOperationId: "build-worktable1x1",
      processingMaterials: [
        plywoodSheet(),
        board("pallet", 4, 6, 3),
        board("pallet", 4, 6, 3),
        board("pallet", 4, 6, 3),
      ],
      operationProgress: {
        status: "inProgress",
        phaseIndex: 0,
        ticksRemaining: 1,
      },
    });
    const state = stateWith({
      machines: [machine],
      // The workspace operation cell for position [1,2] rotation 0
      player: { ...initialGameState.player, position: [1, 3] },
    });

    const result = tickAction(state);
    // The finished table lands crated at the bench's operator cell
    assert.strictEqual(result.machineCrates.length, 1);
    assert.strictEqual(
      result.machineCrates[0].machine.machineTypeId,
      "worktable1x1",
    );
    assert.deepStrictEqual(result.machineCrates[0].position, [1, 3]);
    assert.strictEqual(
      result.machines[0].operationProgress.status,
      "notStarted",
    );
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
    ) as MachineOperation;
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
  const table = machineAt("worktable1x3", [0, 0]);

  function cellMapWith(machines: ReadonlyArray<MachineState>): CellMap {
    return CellMap.fromGameState(stateWith({ machines }));
  }

  it("allows a benchtop machine on a free worktable cell", () => {
    // Miter saw facing down from the table's middle cell: its operator
    // cell [1,1] is open floor
    assert.ok(
      canPlaceMachine(cellMapWith([table]), MACHINE_TYPES.miterSaw, [1, 0], 0),
    );
  });

  it("rejects a benchtop machine on a table cell already hosting one", () => {
    const saw = machineAt("miterSaw", [1, 0]);
    assert.ok(
      !canPlaceMachine(
        cellMapWith([table, saw]),
        MACHINE_TYPES.lunchboxPlaner,
        [1, 0],
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
    // Planer at [1,1] facing down: its infeed/outfeed cells sit at [1,0]
    // (the table top) and [1,2] — the table blocks it
    assert.ok(
      !canPlaceMachine(
        cellMapWith([table]),
        MACHINE_TYPES.lunchboxPlaner,
        [1, 1],
        0,
      ),
    );
  });

  it("stacks the cell map: benchtop on top, table underneath", () => {
    const saw = machineAt("miterSaw", [1, 0]);
    // Order in gameState.machines must not matter
    for (const machines of [
      [table, saw],
      [saw, table],
    ]) {
      const cell = cellMapWith(machines).at([1, 0])!;
      assert.strictEqual(cell.machine?.type.id, "miterSaw");
      assert.strictEqual(cell.tableMachine?.type.id, "worktable1x3");
    }
  });
});

describe("moving and removing tables", () => {
  const table = machineAt("worktable1x3", [0, 0]);
  const saw = machineAt("miterSaw", [1, 0]);

  it("reports machines mounted on a table", () => {
    const state = stateWith({ machines: [table, saw] });
    assert.strictEqual(machinesMountedOnTable(state, 0).length, 1);
    assert.strictEqual(machinesMountedOnTable(state, 1).length, 0);
  });

  it("refuses to pick up a table with a machine mounted", () => {
    const state = stateWith({ machines: [table, saw] });
    assert.strictEqual(pickUpMachineAction(table)(state), state);
  });

  it("keeps shelf stock aboard when a table is carried", () => {
    const stocked = machineAt("worktable1x1", [2, 2], {
      storedMaterials: [board("maple", 2, 2, 4)],
    });
    const state = stateWith({ machines: [stocked], materialPiles: [] });
    const result = pickUpMachineAction(stocked)(state);
    assert.strictEqual(result.machines.length, 0);
    assert.strictEqual(result.materialPiles.length, 0);
    assert.strictEqual(
      result.player.carriedMachine?.storedMaterials?.length,
      1,
    );
  });
});

describe("the shelf", () => {
  it("stows carried materials up to capacity and takes them back", () => {
    const stock = Array.from({ length: 4 }, () => board("maple", 2, 2, 4));
    const table = machineAt("worktable1x1", [2, 2]);
    const state = stateWith({
      machines: [table],
      player: { ...initialGameState.player, inventory: stock },
    });
    const machineView = new Machine(table);

    // worktable1x1 holds 3 — stowing all 4 is refused outright
    assert.strictEqual(
      stowMaterialsInMachineAction(stock, machineView)(state),
      state,
    );

    const stowed = stowMaterialsInMachineAction(
      stock.slice(0, 3),
      machineView,
    )(state);
    assert.strictEqual(stowed.machines[0].storedMaterials?.length, 3);
    assert.strictEqual(stowed.player.inventory.length, 1);

    const shelfView = new Machine(stowed.machines[0]);
    const taken = takeStoredMaterialsFromMachineAction(
      [stowed.machines[0].storedMaterials![0]],
      shelfView,
    )(stowed);
    assert.strictEqual(taken.machines[0].storedMaterials?.length, 2);
    assert.strictEqual(taken.player.inventory.length, 2);
  });
});
