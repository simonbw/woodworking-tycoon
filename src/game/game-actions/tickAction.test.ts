import assert from "node:assert";
import { describe, it } from "node:test";
import { GameState } from "../GameState";
import { MachineState } from "../Machine";
import { initialGameState } from "../initialGameState";
import { makeMaterial } from "../material-helpers";
import { Pallet } from "../Materials";
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
