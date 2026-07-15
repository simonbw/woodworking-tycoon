import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "../board-helpers";
import { GameState } from "../GameState";
import { MachineState } from "../Machine";
import { initialGameState } from "../initialGameState";
import { makeMaterial } from "../material-helpers";
import { getSellValue } from "../material-values";
import { FinishedProduct, Pallet } from "../Materials";
import { tickAction } from "./tickAction";

function workspaceMachine(overrides: Partial<MachineState>): MachineState {
  return {
    machineTypeId: "workspace",
    position: [1, 2],
    rotation: 0,
    inputMaterials: [],
    processingMaterials: [],
    outputMaterials: [],
    selectedOperationId: "dismantlePallet",
    selectedParameters: undefined,
    operationProgress: { status: "notStarted", ticksRemaining: 0 },
    tools: [],
    ...overrides,
  };
}

function stateWith(overrides: Partial<GameState>): GameState {
  return { ...initialGameState, ...overrides };
}

/** A pallet with a single deck board left, so dismantling finishes it. */
function nearlyDismantledPallet(): Pallet {
  return makeMaterial<Pallet>({
    type: "pallet",
    deckBoards: [
      true,
      ...(Array(10).fill(false) as boolean[]),
    ] as Pallet["deckBoards"],
    stringerBoardsLeft: 3,
  });
}

describe("tickAction", () => {
  it("increments the tick counter", () => {
    const result = tickAction(stateWith({ tick: 7 }));
    assert.strictEqual(result.tick, 8);
  });

  it("processes one queued move and leaves the rest for later ticks", () => {
    const state = stateWith({
      player: {
        ...initialGameState.player,
        position: [0, 0],
        workQueue: [
          { type: "move", direction: 0 },
          { type: "move", direction: 0 },
        ],
      },
    });
    const result = tickAction(state);
    assert.deepStrictEqual(result.player.position, [1, 0]);
    assert.strictEqual(result.player.workQueue.length, 1);
  });

  it("leaves idle machines untouched", () => {
    const machine = workspaceMachine({});
    const result = tickAction(stateWith({ machines: [machine] }));
    assert.strictEqual(result.machines[0], machine);
  });

  it("counts down an in-progress operation", () => {
    const machine = workspaceMachine({
      processingMaterials: [nearlyDismantledPallet()],
      operationProgress: { status: "inProgress", ticksRemaining: 3 },
    });
    const result = tickAction(stateWith({ machines: [machine] }));
    assert.deepStrictEqual(result.machines[0].operationProgress, {
      status: "inProgress",
      ticksRemaining: 2,
    });
  });

  it("sells one item per tick from a sales table", () => {
    const shelf = makeMaterial<FinishedProduct>({
      type: "rusticShelf",
      species: "pallet",
    });
    const deckBoard = board("pallet", 3, 4, 1);
    const table: MachineState = {
      ...workspaceMachine({}),
      machineTypeId: "salesTable",
      selectedOperationId: "none",
      inputMaterials: [shelf, deckBoard],
    };
    const afterOne = tickAction(stateWith({ money: 0, machines: [table] }));
    assert.strictEqual(afterOne.money, getSellValue(shelf));
    assert.deepStrictEqual(afterOne.machines[0].inputMaterials, [deckBoard]);

    const afterTwo = tickAction(afterOne);
    assert.strictEqual(
      afterTwo.money,
      getSellValue(shelf) + getSellValue(deckBoard),
    );
    assert.deepStrictEqual(afterTwo.machines[0].inputMaterials, []);
  });

  it("pauses player work while away and keeps machines running", () => {
    const machine = workspaceMachine({
      processingMaterials: [nearlyDismantledPallet()],
      operationProgress: { status: "inProgress", ticksRemaining: 5 },
    });
    const state = stateWith({
      tick: 10,
      machines: [machine],
      player: {
        ...initialGameState.player,
        away: { kind: "scavenging", returnTick: 20, loot: [] },
        workQueue: [{ type: "move", direction: 0 }],
      },
    });
    const result = tickAction(state);
    assert.strictEqual(result.player.workQueue.length, 1);
    assert.deepStrictEqual(result.player.position, [0, 0]);
    assert.strictEqual(
      result.machines[0].operationProgress.ticksRemaining,
      4,
    );
  });

  it("delivers scavenged loot to the dropoff spot on return", () => {
    const loot = [makeMaterial<Pallet>({ ...nearlyDismantledPallet() })];
    const state = stateWith({
      tick: 20,
      materialPiles: [],
      player: {
        ...initialGameState.player,
        away: { kind: "scavenging", returnTick: 20, loot },
      },
    });
    const result = tickAction(state);
    assert.strictEqual(result.player.away, null);
    assert.strictEqual(result.materialPiles.length, 1);
    assert.strictEqual(result.materialPiles[0].material, loot[0]);
    assert.deepStrictEqual(
      result.materialPiles[0].position,
      initialGameState.shopInfo.materialDropoffPosition,
    );
  });

  it("applies the operation output when the countdown finishes", () => {
    const machine = workspaceMachine({
      processingMaterials: [nearlyDismantledPallet()],
      operationProgress: { status: "inProgress", ticksRemaining: 1 },
    });
    const result = tickAction(stateWith({ machines: [machine] }));
    const finished = result.machines[0];

    // Dismantling the last deck board yields 3 stringers + 1 deck board
    assert.strictEqual(finished.outputMaterials.length, 4);
    assert.ok(finished.outputMaterials.every((m) => m.type === "board"));
    assert.deepStrictEqual(finished.processingMaterials, []);
    assert.deepStrictEqual(finished.operationProgress, {
      status: "notStarted",
      ticksRemaining: 0,
    });
  });
});
