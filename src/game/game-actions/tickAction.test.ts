import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "../board-helpers";
import { cellDust } from "../Dust";
import { GameState } from "../GameState";
import { MachineState } from "../Machine";
import { initialGameState } from "../initialGameState";
import { makeMaterial } from "../material-helpers";
import { Pallet } from "../Materials";
import { GLUE_CURE_TICKS } from "../machines/workspace";
import { tickAction } from "./tickAction";

/** The fixture workspace sits at [1,2] rotation 0 — its operation cell. */
const WORKSPACE_OPERATION_CELL: [number, number] = [1, 3];

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
  return { ...initialGameState, ...overrides };
}

/** Game state with the player standing at the workspace's operation cell. */
function attendingStateWith(overrides: Partial<GameState>): GameState {
  return stateWith({
    player: { ...initialGameState.player, position: WORKSPACE_OPERATION_CELL },
    ...overrides,
  });
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

/** Five smooth maple strips, mid-glue-up. */
function glueStrips() {
  return Array.from({ length: 5 }, () => board("maple", 2, 2, 4, "smooth"));
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

  it("counts down an attended operation while the player is at the machine", () => {
    const machine = workspaceMachine({
      processingMaterials: [nearlyDismantledPallet()],
      operationProgress: {
        status: "inProgress",
        phaseIndex: 0,
        ticksRemaining: 3,
      },
    });
    const result = tickAction(attendingStateWith({ machines: [machine] }));
    assert.deepStrictEqual(result.machines[0].operationProgress, {
      status: "inProgress",
      phaseIndex: 0,
      ticksRemaining: 2,
    });
  });

  it("pauses an attended operation while the player is elsewhere", () => {
    const machine = workspaceMachine({
      processingMaterials: [nearlyDismantledPallet()],
      operationProgress: {
        status: "inProgress",
        phaseIndex: 0,
        ticksRemaining: 3,
      },
    });
    // Player at [0,0], not the operation cell — no progress, no cancel
    const result = tickAction(stateWith({ machines: [machine] }));
    assert.strictEqual(result.machines[0], machine);
  });

  it("emits an operation-complete sound cue when an operation finishes", () => {
    const machine = workspaceMachine({
      processingMaterials: [nearlyDismantledPallet()],
      operationProgress: {
        status: "inProgress",
        phaseIndex: 0,
        ticksRemaining: 1,
      },
    });
    const result = tickAction(attendingStateWith({ machines: [machine] }));
    assert.deepStrictEqual(result.pendingSounds, [
      {
        kind: "operation-complete",
        machineTypeId: "workspace",
        operationId: "dismantlePallet",
      },
    ]);
  });

  it("keeps the pendingSounds reference stable on a tick with no completions", () => {
    const before = stateWith({ tick: 1 });
    const result = tickAction(before);
    assert.strictEqual(result.pendingSounds, before.pendingSounds);
  });

  it("pauses attended work during away trips — you're not there to do it", () => {
    const machine = workspaceMachine({
      processingMaterials: [nearlyDismantledPallet()],
      operationProgress: {
        status: "inProgress",
        phaseIndex: 0,
        ticksRemaining: 5,
      },
    });
    const state = stateWith({
      tick: 10,
      machines: [machine],
      player: {
        ...initialGameState.player,
        // Standing at the cell doesn't count while away
        position: WORKSPACE_OPERATION_CELL,
        away: { kind: "scavenging", returnTick: 20, loot: [] },
        workQueue: [{ type: "move", direction: 0 }],
      },
    });
    const result = tickAction(state);
    assert.strictEqual(result.player.workQueue.length, 1);
    assert.strictEqual(result.machines[0].operationProgress.ticksRemaining, 5);
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
      operationProgress: {
        status: "inProgress",
        phaseIndex: 0,
        ticksRemaining: 1,
      },
    });
    const result = tickAction(attendingStateWith({ machines: [machine] }));
    const finished = result.machines[0];

    // Dismantling the last deck board yields 3 stringers + 1 deck board
    assert.strictEqual(finished.outputMaterials.length, 4);
    assert.ok(finished.outputMaterials.every((m) => m.type === "board"));
    assert.deepStrictEqual(finished.processingMaterials, []);
    assert.deepStrictEqual(finished.operationProgress, {
      status: "notStarted",
      phaseIndex: 0,
      ticksRemaining: 0,
    });
    // Boards are not finished products: no craft XP for milling
    assert.strictEqual(result.progression.xp, 0);
  });

  it("awards craft XP equal to sell value when a product completes", () => {
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
      processingMaterials: shelfBoards,
      operationProgress: {
        status: "inProgress",
        phaseIndex: 0,
        ticksRemaining: 1,
      },
    });
    const result = tickAction(attendingStateWith({ machines: [machine] }));
    // Rustic shelf sells for $60 -> 60 XP
    assert.strictEqual(result.progression.xp, 60);
  });
});

describe("tickAction operation phases", () => {
  it("advances from clamping into hands-free curing", () => {
    const machine = workspaceMachine({
      selectedOperationId: "glueUpPanel",
      processingMaterials: glueStrips(),
      operationProgress: {
        status: "inProgress",
        phaseIndex: 0,
        ticksRemaining: 1,
      },
    });
    const result = tickAction(attendingStateWith({ machines: [machine] }));
    assert.deepStrictEqual(result.machines[0].operationProgress, {
      status: "inProgress",
      phaseIndex: 1,
      ticksRemaining: GLUE_CURE_TICKS,
    });
  });

  it("pauses clamping when the player steps away", () => {
    const machine = workspaceMachine({
      selectedOperationId: "glueUpPanel",
      processingMaterials: glueStrips(),
      operationProgress: {
        status: "inProgress",
        phaseIndex: 0,
        ticksRemaining: 4,
      },
    });
    const result = tickAction(stateWith({ machines: [machine] }));
    assert.strictEqual(result.machines[0], machine);
  });

  it("cures with nobody at the bench — even during away trips", () => {
    const machine = workspaceMachine({
      selectedOperationId: "glueUpPanel",
      processingMaterials: glueStrips(),
      operationProgress: {
        status: "inProgress",
        phaseIndex: 1,
        ticksRemaining: 10,
      },
    });
    const state = stateWith({
      tick: 10,
      machines: [machine],
      player: {
        ...initialGameState.player,
        away: { kind: "scavenging", returnTick: 20, loot: [] },
      },
    });
    const result = tickAction(state);
    assert.strictEqual(result.machines[0].operationProgress.ticksRemaining, 9);
  });

  it("finishes the glue-up unattended and delivers the panel", () => {
    const machine = workspaceMachine({
      selectedOperationId: "glueUpPanel",
      processingMaterials: glueStrips(),
      operationProgress: {
        status: "inProgress",
        phaseIndex: 1,
        ticksRemaining: 1,
      },
    });
    // Player at [0,0], nowhere near the bench
    const result = tickAction(stateWith({ machines: [machine] }));
    const finished = result.machines[0];
    assert.strictEqual(finished.outputMaterials.length, 1);
    assert.strictEqual(finished.outputMaterials[0].type, "panel");
    assert.strictEqual(finished.operationProgress.status, "notStarted");
  });

  it("enters a hands-free phase from a boundary without the player", () => {
    // A boundary state (phase done, ticksRemaining 0): curing needs nobody,
    // so the machine moves on by itself
    const machine = workspaceMachine({
      selectedOperationId: "glueUpPanel",
      processingMaterials: glueStrips(),
      operationProgress: {
        status: "inProgress",
        phaseIndex: 0,
        ticksRemaining: 0,
      },
    });
    const result = tickAction(stateWith({ machines: [machine] }));
    assert.deepStrictEqual(result.machines[0].operationProgress, {
      status: "inProgress",
      phaseIndex: 1,
      ticksRemaining: GLUE_CURE_TICKS,
    });
  });
});

describe("tickAction dust emission", () => {
  /**
   * A planer at [1,1] (operation cell [1,2]) mid-way through planing
   * walnut. The 5"-wide board is exactly the cut-load reference, so the
   * dust numbers below read straight off dustOutput.
   */
  function planingStateWith(
    overrides: Partial<GameState> = {},
    stock = board("walnut", 4, 5, 4),
  ): GameState {
    const planer: MachineState = {
      machineTypeId: "lunchboxPlaner",
      position: [1, 1],
      rotation: 0,
      selectedOperationId: "planeBoard",
      selectedParameters: { targetThickness: 4 },
      operationProgress: {
        status: "inProgress",
        phaseIndex: 0,
        ticksRemaining: 5,
      },
      inputMaterials: [],
      processingMaterials: [stock],
      outputMaterials: [],
      tools: [],
    };
    return stateWith({
      machines: [planer],
      player: { ...initialGameState.player, position: [1, 2] },
      ...overrides,
    });
  }

  it("lands species-tagged dust around the machine while it cuts", () => {
    const result = tickAction(planingStateWith());
    assert.strictEqual(result.machines[0].operationProgress.ticksRemaining, 4);
    // The planer's dustOutput (4/tick): 70% split over the two core cells
    // (machine + operation position), 30% over the six ring cells
    assert.ok(Math.abs(cellDust(result.dust, [1, 1]) - 1.4) < 1e-9);
    assert.ok(Math.abs(cellDust(result.dust, [1, 2]) - 1.4) < 1e-9);
    assert.ok(Math.abs(cellDust(result.dust, [2, 1]) - 0.2) < 1e-9);
    assert.ok((result.dust["1,1"].walnut ?? 0) > 0);
  });

  it("sheds dust in proportion to the stock being cut", () => {
    const wide = tickAction(planingStateWith({}, board("walnut", 4, 8, 4)));
    const narrow = tickAction(planingStateWith({}, board("walnut", 4, 2, 4)));
    const reference = tickAction(planingStateWith());
    assert.ok(
      cellDust(wide.dust, [1, 1]) > cellDust(reference.dust, [1, 1]),
      "a wide board should shed more dust than the reference",
    );
    assert.ok(
      cellDust(narrow.dust, [1, 1]) < cellDust(reference.dust, [1, 1]),
      "a narrow board should shed less dust than the reference",
    );
  });

  it("accumulates across ticks", () => {
    let state = planingStateWith();
    for (let i = 0; i < 5; i++) {
      state = tickAction(state);
    }
    assert.ok(Math.abs(cellDust(state.dust, [1, 1]) - 7) < 1e-9);
  });

  it("makes no dust while the operation is paused", () => {
    const result = tickAction(
      planingStateWith({
        player: { ...initialGameState.player, position: [0, 0] },
      }),
    );
    assert.deepStrictEqual(result.dust, {});
    assert.strictEqual(result.machines[0].operationProgress.ticksRemaining, 5);
  });

  it("emits nothing for operations without a dustOutput", () => {
    const machine = workspaceMachine({
      processingMaterials: [nearlyDismantledPallet()],
      operationProgress: {
        status: "inProgress",
        phaseIndex: 0,
        ticksRemaining: 3,
      },
    });
    const result = tickAction(attendingStateWith({ machines: [machine] }));
    assert.strictEqual(result.machines[0].operationProgress.ticksRemaining, 2);
    assert.deepStrictEqual(result.dust, {});
  });

  it("keeps the dust reference stable on dustless ticks", () => {
    const before = stateWith({ dust: { "0,0": { pine: 1 } } });
    const result = tickAction(before);
    assert.strictEqual(result.dust, before.dust);
  });

  it("a mounted dust bag catches most of the emission at the port", () => {
    const bagged = planingStateWith();
    const withBag = {
      ...bagged,
      machines: [{ ...bagged.machines[0], tools: ["dustBag" as const] }],
    };
    const result = tickAction(withBag);
    // Planer emits 4/tick bare; the bag captures 60%, so 1.6 lands —
    // 70% split over the two core cells
    assert.ok(Math.abs(cellDust(result.dust, [1, 1]) - 0.56) < 1e-9);
    assert.ok(Math.abs(cellDust(result.dust, [2, 1]) - 0.08) < 1e-9);
  });

  it("unlocks sweeping once the floor crosses the dust threshold", () => {
    const before = stateWith({
      dust: { "0,0": { pine: 30 }, "0,1": { oak: 30 } },
    });
    assert.strictEqual(before.progression.sweepingUnlocked, false);
    const result = tickAction(before);
    assert.strictEqual(result.progression.sweepingUnlocked, true);
    // One-way latch: sweeping the floor clean doesn't relock it
    const cleaned = tickAction({ ...result, dust: {} });
    assert.strictEqual(cleaned.progression.sweepingUnlocked, true);
  });
});

describe("tickAction dust movement penalty", () => {
  it("costs extra ticks to step onto a deep drift", () => {
    let state = stateWith({
      dust: { "1,0": { pine: 100 } },
      player: {
        ...initialGameState.player,
        position: [0, 0],
        workQueue: [
          { type: "move", direction: 0 },
          { type: "move", direction: 0 },
        ],
      },
    });
    // Tick 1: steps onto the drift and starts trudging
    state = tickAction(state);
    assert.deepStrictEqual(state.player.position, [1, 0]);
    assert.strictEqual(state.player.busyTicks, 3);
    assert.strictEqual(state.player.workQueue.length, 1);
    // Ticks 2–4: still wading, second step waits
    for (let i = 0; i < 3; i++) {
      state = tickAction(state);
      assert.deepStrictEqual(state.player.position, [1, 0]);
    }
    // Tick 5: free again — the second step happens
    state = tickAction(state);
    assert.deepStrictEqual(state.player.position, [2, 0]);
  });
});
