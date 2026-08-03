import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "../board-helpers";
import { GameState } from "../GameState";
import { getMachines, MachineState } from "../Machine";
import { GLUE_CURE_TICKS } from "../machines/workspace";
import { initialGameState } from "../initialGameState";
import { NO_CONSUMABLES } from "../Consumable";
import {
  finishAttendedWorkAction,
  pryPalletNailAction,
} from "./operation-actions";
import { operateMachineAction } from "./player-actions";
import { tickAction } from "./tickAction";

/** The fixture workspace sits at [1,2] rotation 0 — operation cell [1,4]. */
const OPERATION_CELL: [number, number] = [1, 4];

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
    operationProgress: {
      status: "notStarted",
      phaseIndex: 0,
      ticksRemaining: 0,
    },
    tools: [],
    ...overrides,
  };
}

function stateWith(overrides: Partial<GameState>): GameState {
  return {
    ...initialGameState,
    player: { ...initialGameState.player, position: OPERATION_CELL },
    ...overrides,
  };
}

const smoothMaple = () => board("maple", 2, 2, 4, "smooth");

describe("finishAttendedWorkAction", () => {
  it("resolves a started sanding pass: outputs, sound, and an idle bench", () => {
    const machine = workspaceMachine({
      tools: ["sandingBlock"],
      selectedOperationId: "blockSandBoard",
      inputMaterials: [board("maple", 2, 4, 4, "rough")],
    });
    let state = stateWith({
      machines: [machine],
      progression: {
        ...initialGameState.progression,
        unlockedSkills: [
          ...initialGameState.progression.unlockedSkills,
          "surfacePrep",
        ],
      },
    });
    // The first stroke starts the operation (claiming the board) —
    state = operateMachineAction(getMachines(state.machines)[0])(state);
    assert.strictEqual(
      state.machines[0].operationProgress.status,
      "inProgress",
    );
    // — and no amount of held Space moves it: the tick skips interactive
    // attended work outright.
    const ticked = tickAction({
      ...state,
      player: { ...state.player, operating: true },
    });
    assert.strictEqual(
      ticked.machines[0].operationProgress.ticksRemaining,
      state.machines[0].operationProgress.ticksRemaining,
    );

    // Coverage crossed the threshold: the bench view commits.
    const done = finishAttendedWorkAction(getMachines(state.machines)[0])(
      state,
    );
    assert.strictEqual(done.machines[0].outputMaterials.length, 1);
    const output = done.machines[0].outputMaterials[0];
    assert.ok(output.type === "board" && output.surface === "smooth");
    assert.strictEqual(done.machines[0].operationProgress.status, "notStarted");
    assert.deepStrictEqual(done.pendingSounds, [
      {
        kind: "operation-complete",
        machineTypeId: "workspace",
        operationId: "blockSandBoard",
      },
    ]);
  });

  it("refuses from across the shop — hand work needs hands", () => {
    const machine = workspaceMachine({
      tools: ["sandingBlock"],
      selectedOperationId: "blockSandBoard",
      processingMaterials: [board("maple", 2, 4, 4, "rough")],
      operationProgress: {
        status: "inProgress",
        phaseIndex: 0,
        ticksRemaining: 40,
      },
    });
    const state = stateWith({
      machines: [machine],
      player: { ...initialGameState.player, position: [8, 8] },
      progression: {
        ...initialGameState.progression,
        unlockedSkills: [
          ...initialGameState.progression.unlockedSkills,
          "surfacePrep",
        ],
      },
    });
    const result = finishAttendedWorkAction(getMachines(state.machines)[0])(
      state,
    );
    assert.strictEqual(result, state);
  });

  it("refuses to finish a legacy (non-interactive) operation", () => {
    const machine = workspaceMachine({
      selectedOperationId: "finishCuttingBoard",
      processingMaterials: [],
      operationProgress: {
        status: "inProgress",
        phaseIndex: 0,
        ticksRemaining: 5,
      },
    });
    const state = stateWith({ machines: [machine] });
    const result = finishAttendedWorkAction(getMachines(state.machines)[0])(
      state,
    );
    assert.strictEqual(result, state);
  });

  it("hands a glue-up to the cure: the last clamp starts the clock, not the panel", () => {
    const strips = [
      smoothMaple(),
      smoothMaple(),
      smoothMaple(),
      smoothMaple(),
      smoothMaple(),
    ];
    const machine = workspaceMachine({
      selectedOperationId: "glueUpPanel",
      inputMaterials: strips,
    });
    let state = stateWith({
      machines: [machine],
      clamps: 4,
      progression: {
        ...initialGameState.progression,
        unlockedSkills: [
          ...initialGameState.progression.unlockedSkills,
          "panelWork",
        ],
      },
    });
    // The single commit: start (ties up clamps) + finish (into the cure)
    state = operateMachineAction(getMachines(state.machines)[0])(state);
    state = finishAttendedWorkAction(getMachines(state.machines)[0])(state);
    assert.deepStrictEqual(state.machines[0].operationProgress, {
      status: "inProgress",
      phaseIndex: 1,
      ticksRemaining: GLUE_CURE_TICKS,
    });
    // No panel yet — the glue has to cure
    assert.strictEqual(state.machines[0].outputMaterials.length, 0);

    // The cure runs hands-free; nobody needs to stand there
    let cured = {
      ...state,
      player: { ...state.player, position: [8, 8] as [number, number] },
    };
    for (let i = 0; i < GLUE_CURE_TICKS; i++) {
      cured = tickAction(cured);
    }
    assert.strictEqual(cured.machines[0].outputMaterials.length, 1);
    assert.strictEqual(cured.machines[0].outputMaterials[0].type, "panel");
  });

  it("assembly's paired commit spends the fasteners and yields the build", () => {
    const shelfBoards = [
      board("pallet", 4, 6, 3),
      board("pallet", 4, 6, 3),
      board("pallet", 3, 4, 1),
      board("pallet", 3, 4, 1),
      board("pallet", 3, 4, 1),
    ];
    const machine = workspaceMachine({
      tools: ["hammer"],
      selectedOperationId: "buildRusticPalletShelf",
      inputMaterials: shelfBoards,
    });
    let state = stateWith({
      machines: [machine],
      consumables: { ...NO_CONSUMABLES, nails: 10 },
      progression: {
        ...initialGameState.progression,
        unlockedSkills: [
          ...initialGameState.progression.unlockedSkills,
          "rusticCarpentry",
        ],
      },
    });
    state = operateMachineAction(getMachines(state.machines)[0])(state);
    assert.strictEqual(state.consumables.nails, 2);
    state = finishAttendedWorkAction(getMachines(state.machines)[0])(state);
    assert.strictEqual(state.machines[0].outputMaterials.length, 1);
    assert.strictEqual(
      state.machines[0].outputMaterials[0].type,
      "rusticShelf",
    );
    // Craft XP for the finished product, exactly as a tick completion pays
    assert.ok(state.progression.xp > 0);
  });
});

describe("pryPalletNailAction targeting", () => {
  function palletOnBench() {
    return workspaceMachine({
      inputMaterials: [
        {
          id: "test-pallet",
          type: "pallet" as const,
          deckBoards: Array(11).fill(true) as never,
          stringerBoardsLeft: 3,
        },
      ],
    });
  }

  it("pries the exact nail the player pressed", () => {
    const state = stateWith({ machines: [palletOnBench()] });
    const result = pryPalletNailAction(getMachines(state.machines)[0], {
      kind: "deck",
      index: 2,
    })(state);
    const pallet = result.machines[0].inputMaterials[0];
    assert.ok(pallet.type === "pallet");
    assert.strictEqual(pallet.deckBoards[2], false);
    assert.strictEqual(pallet.deckBoards[10], true);
    assert.strictEqual(result.consumables.nails, 1);
  });

  it("a stringer pull frees a stringer even while deck boards remain", () => {
    const state = stateWith({ machines: [palletOnBench()] });
    const result = pryPalletNailAction(getMachines(state.machines)[0], {
      kind: "stringer",
      index: 0,
    })(state);
    const pallet = result.machines[0].inputMaterials[0];
    assert.ok(pallet.type === "pallet");
    assert.strictEqual(pallet.stringerBoardsLeft, 2);
    // The freed board stays lying on the bench, not in an output bay
    const freed = result.machines[0].inputMaterials.at(-1)!;
    assert.ok(freed.type === "board" && freed.width === 6);
    assert.strictEqual(result.machines[0].outputMaterials.length, 0);
  });
});
