import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "../board-helpers";
import { GameState } from "../GameState";
import { getMachines, MachineState } from "../Machine";
import { GLUE_CURE_TICKS } from "../machines/workspace";
import { initialGameState } from "../initialGameState";
import { NO_CONSUMABLES } from "../Consumable";
import {
  arrangeBenchMaterialAction,
  finishAttendedWorkAction,
  gatherBenchPiecesAction,
  pryPalletNailAction,
} from "./operation-actions";
import {
  berthPlacementOnBench,
  defaultBenchPlacement,
} from "../bench-work/bench-layout";
import {
  initialPalletNails,
  palletBoardSlot,
} from "../bench-work/pallet-geometry";
import { MACHINE_TYPES } from "../Machine";
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
    const shelfBoards = [
      board("pallet", 48, 6, 6),
      board("pallet", 48, 6, 6),
      board("pallet", 36, 4, 2),
      board("pallet", 36, 4, 2),
      board("pallet", 36, 4, 2),
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
    assert.strictEqual(state.consumables.nails, 4);
    state = finishAttendedWorkAction(getMachines(state.machines)[0])(state);
    assert.strictEqual(state.machines[0].outputMaterials.length, 1);
    const product = state.machines[0].outputMaterials[0];
    assert.strictEqual(product.type, "rusticShelf");
    // The bill of materials rides the product: the very boards that went
    // in, their ids as grain seeds (see bench-work/blueprint.ts)
    assert.strictEqual(
      (product as { parts?: readonly { seed: string }[] }).parts?.length,
      5,
    );
    assert.strictEqual(
      (product as { parts: readonly { seed: string }[] }).parts[0].seed,
      shelfBoards[0].id,
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
          stringers: [true, true, true] as never,
          nails: initialPalletNails(Array(11).fill(true), [true, true, true]),
        },
      ],
    });
  }

  it("pulls exactly the nail the player pressed — no board frees yet", () => {
    const state = stateWith({ machines: [palletOnBench()] });
    const result = pryPalletNailAction(getMachines(state.machines)[0], {
      deck: 2,
      stringer: 1,
    })(state);
    const pallet = result.machines[0].inputMaterials[0];
    assert.ok(pallet.type === "pallet");
    assert.strictEqual(pallet.nails.length, 32);
    assert.ok(!pallet.nails.some((n) => n.deck === 2 && n.stringer === 1));
    // Two nails still hold deck board 2; nothing came free
    assert.strictEqual(pallet.deckBoards[2], true);
    assert.deepStrictEqual(pallet.stringers, [true, true, true]);
    assert.strictEqual(result.machines[0].inputMaterials.length, 1);
    assert.strictEqual(result.consumables.nails, 1);
  });

  it("a board comes free when its last nail is pulled", () => {
    let state = stateWith({ machines: [palletOnBench()] });
    for (const stringer of [0, 1, 2]) {
      state = pryPalletNailAction(getMachines(state.machines)[0], {
        deck: 6,
        stringer,
      })(state);
    }
    const pallet = state.machines[0].inputMaterials[0];
    assert.ok(pallet.type === "pallet");
    assert.strictEqual(pallet.deckBoards[6], false);
    assert.strictEqual(pallet.deckBoards[10], true);
    // The freed board stays lying on the bench, not in an output bay
    const freed = state.machines[0].inputMaterials.at(-1)!;
    assert.ok(freed.type === "board" && freed.width === 4);
    assert.strictEqual(state.machines[0].outputMaterials.length, 0);
    assert.strictEqual(state.consumables.nails, 3);
  });

  it("the last nail on a crossing frees both of its boards", () => {
    let state = stateWith({ machines: [palletOnBench()] });
    const machine = () => getMachines(state.machines)[0];
    // Pull every nail; the very last one frees a deck board AND the
    // last stringer in the same commit.
    let guard = 40;
    while (guard-- > 0) {
      const pallet = machine().inputMaterials.find((m) => m.type === "pallet");
      if (!pallet || pallet.type !== "pallet" || pallet.nails.length === 0)
        break;
      state = pryPalletNailAction(machine(), pallet.nails[0])(state);
    }
    // 33 pulls: the pallet is gone, all 14 boards lie on the bench
    assert.ok(!machine().inputMaterials.some((m) => m.type === "pallet"));
    assert.strictEqual(
      machine().inputMaterials.filter((m) => m.type === "board").length,
      14,
    );
    assert.strictEqual(state.consumables.nails, 33);
  });

  it("seats the freed board on its berth in the bench layout", () => {
    let state = stateWith({ machines: [palletOnBench()] });
    for (const stringer of [0, 1, 2]) {
      state = pryPalletNailAction(getMachines(state.machines)[0], {
        deck: 6,
        stringer,
      })(state);
    }
    const freed = state.machines[0].inputMaterials.at(-1)!;
    // The id is the slot's — the very board the pallet was drawing
    assert.strictEqual(freed.id, "test-pallet:deck-6");
    const placement = state.machines[0].benchLayout?.[freed.id];
    assert.ok(placement);
    const pallet = state.machines[0].inputMaterials[0];
    const expected = berthPlacementOnBench(
      defaultBenchPlacement(MACHINE_TYPES.workspace, pallet as never),
      palletBoardSlot({ kind: "deck", index: 6 }),
    );
    assert.deepStrictEqual(placement, expected);
  });

  it("the berth rides the pallet's own arrangement", () => {
    // The player dragged and quarter-turned the pallet before prying
    const moved = { xIn: 30, yIn: 20, angleDeg: 90, flipped: false };
    let state = stateWith({
      machines: [{ ...palletOnBench(), benchLayout: { "test-pallet": moved } }],
    });
    for (const stringer of [0, 1, 2]) {
      state = pryPalletNailAction(getMachines(state.machines)[0], {
        deck: 6,
        stringer,
      })(state);
    }
    const placement = state.machines[0].benchLayout?.["test-pallet:deck-6"];
    assert.ok(placement);
    assert.deepStrictEqual(
      placement,
      berthPlacementOnBench(moved, palletBoardSlot({ kind: "deck", index: 6 })),
    );
    assert.strictEqual(placement.angleDeg, 90);
  });
});

describe("arrangeBenchMaterialAction", () => {
  it("stores where a piece lies and prunes departed ids", () => {
    const loose = board("pallet", 36, 4, 2);
    const machine = workspaceMachine({
      inputMaterials: [loose],
      benchLayout: {
        "long-gone": { xIn: 1, yIn: 1, angleDeg: 0, flipped: false },
      },
    });
    const state = stateWith({ machines: [machine] });
    const placement = { xIn: 8, yIn: 14, angleDeg: 180, flipped: true };
    const result = arrangeBenchMaterialAction(
      getMachines(state.machines)[0],
      loose.id,
      placement,
    )(state);
    assert.deepStrictEqual(result.machines[0].benchLayout, {
      [loose.id]: placement,
    });
  });

  it("ignores a piece that isn't on the bench", () => {
    const machine = workspaceMachine({});
    const state = stateWith({ machines: [machine] });
    const result = arrangeBenchMaterialAction(
      getMachines(state.machines)[0],
      "nobody",
      { xIn: 0, yIn: 0, angleDeg: 0, flipped: false },
    )(state);
    assert.strictEqual(result, state);
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

describe("gatherBenchPiecesAction", () => {
  function table(
    position: [number, number],
    overrides: Partial<MachineState> = {},
  ): MachineState {
    return {
      machineTypeId: "worktable1x2",
      position,
      rotation: 0,
      inputMaterials: [],
      processingMaterials: [],
      outputMaterials: [],
      selectedOperationId: "",
      operationProgress: {
        status: "notStarted",
        phaseIndex: 0,
        ticksRemaining: 0,
      },
      tools: [],
      ...overrides,
    };
  }

  it("slides a neighbour's piece over without moving it an inch", () => {
    const piece = board("maple", 24, 4, 4, "smooth");
    // Two 4-ft tables shoulder to shoulder: the seam is at 48"
    const left = table([0, 0], {
      inputMaterials: [piece],
      benchLayout: {
        [piece.id]: { xIn: 40, yIn: 12, angleDeg: 0, flipped: false },
      },
    });
    const right = table([4, 0]);
    const state = stateWith({ machines: [left, right] });

    const gathered = gatherBenchPiecesAction(getMachines(state.machines)[1], [
      piece.id,
    ])(state);

    const [leftAfter, rightAfter] = gathered.machines;
    assert.deepStrictEqual(leftAfter.inputMaterials, []);
    assert.deepStrictEqual(leftAfter.benchLayout, {});
    assert.strictEqual(rightAfter.inputMaterials.length, 1);
    assert.strictEqual(rightAfter.inputMaterials[0].id, piece.id);
    // 40" along the left table is 8" back from the right table's own edge
    assert.deepStrictEqual(rightAfter.benchLayout?.[piece.id], {
      xIn: -8,
      yIn: 12,
      angleDeg: 0,
      flipped: false,
    });
  });

  it("keeps finished work in the output bay when it moves", () => {
    const done = board("maple", 24, 4, 4, "sanded");
    const left = table([0, 0], { outputMaterials: [done] });
    const state = stateWith({ machines: [left, table([4, 0])] });

    const gathered = gatherBenchPiecesAction(getMachines(state.machines)[1], [
      done.id,
    ])(state);

    assert.deepStrictEqual(gathered.machines[0].outputMaterials, []);
    assert.strictEqual(gathered.machines[1].outputMaterials.length, 1);
    assert.deepStrictEqual(gathered.machines[1].inputMaterials, []);
  });

  it("leaves a lone bench and its neighbours' other stock alone", () => {
    const mine = board("maple", 24, 4, 4, "smooth");
    const theirs = board("pine", 24, 4, 4, "rough");
    const left = table([0, 0], { inputMaterials: [mine, theirs] });
    const state = stateWith({ machines: [left, table([4, 0])] });

    const gathered = gatherBenchPiecesAction(getMachines(state.machines)[1], [
      mine.id,
    ])(state);
    assert.deepStrictEqual(
      gathered.machines[0].inputMaterials.map((m) => m.id),
      [theirs.id],
    );

    // A table with nobody pushed against it has nothing to gather
    const alone = stateWith({
      machines: [table([0, 0], { inputMaterials: [mine] })],
    });
    assert.strictEqual(
      gatherBenchPiecesAction(getMachines(alone.machines)[0], [mine.id])(alone),
      alone,
    );
  });
});
