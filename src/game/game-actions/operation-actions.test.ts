import assert from "node:assert";
import { describe, it } from "node:test";
import { array } from "../../utils/arrayUtils";
import { board, palletBoard } from "../board-helpers";
import { GameState } from "../GameState";
import { getMachines, MachineState } from "../Machine";
import { GLUE_CURE_TICKS } from "../machines/workspace";
import { initialGameState } from "../initialGameState";
import { NO_CONSUMABLES } from "../Consumable";
import { finishAttendedWorkAction } from "./operation-actions";
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

const smoothMaple = () => board("maple", 24, 2, 4, "smooth");

describe("finishAttendedWorkAction", () => {
  it("resolves a started sanding pass: outputs, sound, and an idle bench", () => {
    const machine = workspaceMachine({
      tools: ["sandingBlock"],
      selectedOperationId: "blockSandBoard",
      inputMaterials: [board("maple", 24, 4, 4, "rough")],
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
      processingMaterials: [board("maple", 24, 4, 4, "rough")],
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
    const shelfBoards = array(6).map(palletBoard);
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
    const product = state.machines[0].outputMaterials[0];
    assert.strictEqual(product.type, "rusticShelf");
    // The bill of materials rides the product: the very boards that went
    // in, their ids as grain seeds (see bench-work/blueprint.ts)
    assert.strictEqual(
      (product as { parts?: readonly { seed: string }[] }).parts?.length,
      6,
    );
    assert.strictEqual(
      (product as { parts: readonly { seed: string }[] }).parts[0].seed,
      shelfBoards[0].id,
    );
    // Craft XP for the finished product, exactly as a tick completion pays
    assert.ok(state.progression.xp > 0);
  });
});

describe("tool-first claims (operateMachineAction with a BenchToolClaim)", () => {
  const roughBoard = () => board("maple", 24, 4, 4, "rough");

  it("claims exactly the piece under the tool, never the first match", () => {
    const first = roughBoard();
    const second = roughBoard();
    const machine = workspaceMachine({
      tools: ["sandingBlock"],
      selectedOperationId: undefined,
      inputMaterials: [first, second],
    });
    const state = stateWith({ machines: [machine] });
    const started = operateMachineAction(getMachines(state.machines)[0], {
      operationId: "blockSandBoard",
      materialId: second.id,
    })(state);
    assert.strictEqual(
      started.machines[0].processingMaterials[0].id,
      second.id,
    );
    assert.deepStrictEqual(
      started.machines[0].inputMaterials.map((m) => m.id),
      [first.id],
    );
    assert.strictEqual(
      started.machines[0].selectedOperationId,
      "blockSandBoard",
    );
    assert.strictEqual(
      started.machines[0].operationProgress.status,
      "inProgress",
    );
  });

  it("works a piece lying in the output bay too — rework needs no restaging", () => {
    const offcut = roughBoard();
    const machine = workspaceMachine({
      tools: ["sandingBlock"],
      selectedOperationId: undefined,
      outputMaterials: [offcut],
    });
    const state = stateWith({ machines: [machine] });
    const started = operateMachineAction(getMachines(state.machines)[0], {
      operationId: "blockSandBoard",
      materialId: offcut.id,
    })(state);
    assert.strictEqual(
      started.machines[0].processingMaterials[0].id,
      offcut.id,
    );
    assert.deepStrictEqual(started.machines[0].outputMaterials, []);
  });

  it("records the mark's parameters so completion cuts where it was marked", () => {
    const stock = board("pine", 48, 4, 4);
    const machine = workspaceMachine({
      tools: ["handSaw"],
      selectedOperationId: undefined,
      inputMaterials: [stock],
    });
    const state = stateWith({ machines: [machine] });
    const started = operateMachineAction(getMachines(state.machines)[0], {
      operationId: "handSawCut",
      materialId: stock.id,
      parameters: { targetLength: 18, cutEnd: "right", angle: 0 },
    })(state);
    assert.strictEqual(started.machines[0].selectedOperationId, "handSawCut");
    assert.strictEqual(
      started.machines[0].selectedParameters?.targetLength,
      18,
    );
    const done = finishAttendedWorkAction(getMachines(started.machines)[0])(
      started,
    );
    const lengths = done.machines[0].outputMaterials.map((m) =>
      m.type === "board" ? m.length : 0,
    );
    assert.deepStrictEqual(
      lengths.sort((a, b) => a - b),
      [18, 30],
    );
  });

  it("refuses a piece the operation doesn't take", () => {
    const doneBoard = board("maple", 24, 4, 4, "sanded");
    const machine = workspaceMachine({
      tools: ["sandingBlock"],
      selectedOperationId: undefined,
      inputMaterials: [doneBoard],
    });
    const state = stateWith({ machines: [machine] });
    const result = operateMachineAction(getMachines(state.machines)[0], {
      operationId: "blockSandBoard",
      materialId: doneBoard.id,
    })(state);
    assert.strictEqual(
      result.machines[0].operationProgress.status,
      "notStarted",
    );
  });
});

describe("finished tool work lies where the workpiece lay", () => {
  it("a sanded board keeps its exact spot — nothing moves at the commit", () => {
    const stock = board("maple", 24, 4, 4, "rough");
    const seat = { xIn: 10, yIn: 20, angleDeg: 97, flipped: false };
    const machine = workspaceMachine({
      tools: ["sandingBlock"],
      selectedOperationId: undefined,
      inputMaterials: [stock],
      benchLayout: { [stock.id]: seat },
    });
    const state = stateWith({ machines: [machine] });
    const started = operateMachineAction(getMachines(state.machines)[0], {
      operationId: "blockSandBoard",
      materialId: stock.id,
    })(state);
    const done = finishAttendedWorkAction(getMachines(started.machines)[0])(
      started,
    );
    const output = done.machines[0].outputMaterials[0];
    assert.deepStrictEqual(done.machines[0].benchLayout?.[output.id], seat);
    assert.strictEqual(done.machines[0].benchLayout?.[stock.id], undefined);
  });

  it("a cut parts into two pieces lying end to end at the mark", () => {
    const stock = board("pine", 48, 4, 4);
    const seat = { xIn: 24, yIn: 18, angleDeg: 0, flipped: false };
    const machine = workspaceMachine({
      tools: ["handSaw"],
      selectedOperationId: undefined,
      inputMaterials: [stock],
      benchLayout: { [stock.id]: seat },
    });
    const state = stateWith({ machines: [machine] });
    const started = operateMachineAction(getMachines(state.machines)[0], {
      operationId: "handSawCut",
      materialId: stock.id,
      parameters: { targetLength: 18, cutEnd: "right", angle: 0 },
    })(state);
    const done = finishAttendedWorkAction(getMachines(started.machines)[0])(
      started,
    );
    const [kept, offcut] = done.machines[0].outputMaterials;
    assert.ok(kept.type === "board" && kept.length === 18);
    assert.ok(offcut.type === "board" && offcut.length === 30);
    // Kept: center 9" down from the top end that sat at yIn 18 - 24 = -6
    assert.deepStrictEqual(done.machines[0].benchLayout?.[kept.id], {
      ...seat,
      yIn: 18 + (18 / 2 - 24),
    });
    // Offcut: the remaining stretch below the mark
    assert.deepStrictEqual(done.machines[0].benchLayout?.[offcut.id], {
      ...seat,
      yIn: 18 + (18 + 30 / 2 - 24),
    });
  });

  it("a turned board's pieces part along its turned length axis", () => {
    const stock = board("pine", 48, 4, 4);
    const seat = { xIn: 24, yIn: 18, angleDeg: 90, flipped: false };
    const machine = workspaceMachine({
      tools: ["handSaw"],
      selectedOperationId: undefined,
      inputMaterials: [stock],
      benchLayout: { [stock.id]: seat },
    });
    const state = stateWith({ machines: [machine] });
    const started = operateMachineAction(getMachines(state.machines)[0], {
      operationId: "handSawCut",
      materialId: stock.id,
      parameters: { targetLength: 18, cutEnd: "right", angle: 0 },
    })(state);
    const done = finishAttendedWorkAction(getMachines(started.machines)[0])(
      started,
    );
    const [kept] = done.machines[0].outputMaterials;
    const placement = done.machines[0].benchLayout?.[kept.id];
    // At 90° the length axis runs along -x: offset -15 lands at x 39
    assert.ok(placement);
    assert.ok(Math.abs(placement.xIn - 39) < 1e-9);
    assert.ok(Math.abs(placement.yIn - 18) < 1e-9);
  });
});
