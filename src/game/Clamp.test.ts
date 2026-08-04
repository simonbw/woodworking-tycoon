import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "./board-helpers";
import { CLAMP_COST, clampsFree, clampsInUse } from "./Clamp";
import { buyClampAction } from "./game-actions/store-actions";
import { operateMachineAction } from "./game-actions/player-actions";
import { tickAction } from "./game-actions/tickAction";
import { GameState } from "./GameState";
import { initialGameState } from "./initialGameState";
import { getMachines, MachineState } from "./Machine";

/** The starter workspace sits at [1,2] rotation 0 — its operation cell. */
const WORKSPACE_OPERATION_CELL: [number, number] = [1, 3];

function stateWith(overrides: Partial<GameState>): GameState {
  return { ...initialGameState, ...overrides };
}

/** The starter workspace with per-test tweaks applied. */
function workspaceMachine(overrides: Partial<MachineState>): MachineState {
  return { ...initialGameState.machines[0], ...overrides };
}

/** Five smooth, edge-jointed strips: one Glue Up Panel's worth. */
function panelStrips() {
  return Array.from({ length: 5 }, () =>
    board("maple", 24, 2, 4, "smooth", { faces: 2, edges: 2 }),
  );
}

/** A bench part-way through a panel glue-up, holding its clamps. */
function gluingWorkspace(overrides: Partial<MachineState> = {}): MachineState {
  return workspaceMachine({
    selectedOperationId: "glueUpPanel",
    processingMaterials: panelStrips(),
    operationProgress: {
      status: "inProgress",
      phaseIndex: 0,
      ticksRemaining: 4,
    },
    ...overrides,
  });
}

describe("clampsInUse", () => {
  it("is zero when nothing is glued up", () => {
    assert.strictEqual(clampsInUse(initialGameState.machines), 0);
  });

  it("counts the clamps a running glue-up holds", () => {
    assert.strictEqual(clampsInUse([gluingWorkspace()]), 4);
  });

  it("ignores machines running an operation that needs no clamps", () => {
    const sawing = workspaceMachine({
      selectedOperationId: "dismantlePallet",
      operationProgress: {
        status: "inProgress",
        phaseIndex: 0,
        ticksRemaining: 2,
      },
    });
    assert.strictEqual(clampsInUse([sawing]), 0);
  });

  it("adds up across benches", () => {
    const second = gluingWorkspace({ position: [6, 6] });
    assert.strictEqual(clampsInUse([gluingWorkspace(), second]), 8);
  });
});

describe("clampsFree", () => {
  it("is what's left on the rack after the glue-ups take theirs", () => {
    assert.strictEqual(clampsFree(6, [gluingWorkspace()]), 2);
  });
});

describe("starting a glue-up", () => {
  it("refuses when the shop owns no clamps", () => {
    const state = stateWith({
      clamps: 0,
      machines: [
        workspaceMachine({
          selectedOperationId: "glueUpPanel",
          inputMaterials: panelStrips(),
        }),
      ],
    });
    const result = operateMachineAction(getMachines(state.machines)[0])(state);
    assert.strictEqual(result, state);
  });

  it("refuses when the other bench is holding them all", () => {
    // Six clamps owned, four already curing a panel: not enough left for
    // a second four-clamp glue-up.
    const state = stateWith({
      clamps: 6,
      machines: [
        workspaceMachine({
          position: [6, 6],
          selectedOperationId: "glueUpPanel",
          inputMaterials: panelStrips(),
        }),
        gluingWorkspace(),
      ],
    });
    const result = operateMachineAction(getMachines(state.machines)[0])(state);
    assert.strictEqual(result, state);
  });

  it("starts when enough clamps are free, without spending them", () => {
    const state = stateWith({
      clamps: 4,
      machines: [
        workspaceMachine({
          selectedOperationId: "glueUpPanel",
          inputMaterials: panelStrips(),
        }),
      ],
    });
    const result = operateMachineAction(getMachines(state.machines)[0])(state);
    assert.strictEqual(
      result.machines[0].operationProgress.status,
      "inProgress",
    );
    // Borrowed, not spent: the rack count never moves, but they're all
    // tied up until the glue cures.
    assert.strictEqual(result.clamps, 4);
    assert.strictEqual(clampsFree(result.clamps, result.machines), 0);
  });
});

describe("finishing a glue-up", () => {
  it("gives the clamps back", () => {
    // One tick from the end of the hands-free cure.
    const state = stateWith({
      clamps: 4,
      player: {
        ...initialGameState.player,
        position: WORKSPACE_OPERATION_CELL,
      },
      machines: [
        gluingWorkspace({
          operationProgress: {
            status: "inProgress",
            phaseIndex: 1,
            ticksRemaining: 1,
          },
        }),
      ],
    });
    assert.strictEqual(clampsFree(state.clamps, state.machines), 0);

    const result = tickAction(state);
    assert.strictEqual(
      result.machines[0].operationProgress.status,
      "notStarted",
    );
    assert.strictEqual(result.machines[0].outputMaterials.length, 1);
    assert.strictEqual(clampsFree(result.clamps, result.machines), 4);
  });
});

describe("buyClampAction", () => {
  it("charges for the clamp and hangs it on the rack", () => {
    const result = buyClampAction()(stateWith({ money: 50, clamps: 2 }));
    assert.strictEqual(result.money, 50 - CLAMP_COST);
    assert.strictEqual(result.clamps, 3);
  });

  it("does nothing when the player can't afford one", () => {
    const state = stateWith({ money: 1, clamps: 0 });
    assert.strictEqual(buyClampAction()(state), state);
  });
});
