import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "../board-helpers";
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
