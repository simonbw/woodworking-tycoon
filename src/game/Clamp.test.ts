import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "./board-helpers";
import { clampsFree, clampsInUse } from "./Clamp";
import { initialGameState } from "./initialGameState";
import { MachineState } from "./Machine";

/**
 * The clamp rack's arithmetic. What the rack *gates* — a glue-up refused
 * when the bars are all tied up, the checkout and return around a cure,
 * buying another bar — is driven through the live commands in
 * `sim/commands/machine-commands.test.ts`, `sim/commands/store-commands.test.ts`,
 * and `sim/sequences/glue-up-scene.test.ts`.
 */

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

  it("counts the clamps a running glue-up holds — one per foot, min two", () => {
    // Five 24" strips: two feet of glue-up, two clamps
    assert.strictEqual(clampsInUse([gluingWorkspace()]), 2);
  });

  it("longer stock ties up more of the rack", () => {
    // 48" boards lie across four feet of clamp bed
    const long = gluingWorkspace({
      processingMaterials: [
        board("maple", 48, 2, 4, "smooth", { faces: 2, edges: 2 }),
        board("maple", 48, 2, 4, "smooth", { faces: 2, edges: 2 }),
      ],
      selectedOperationId: "glueUpPair",
    });
    assert.strictEqual(clampsInUse([long]), 4);
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
    assert.strictEqual(clampsInUse([gluingWorkspace(), second]), 4);
  });
});

describe("clampsFree", () => {
  it("is what's left on the rack after the glue-ups take theirs", () => {
    assert.strictEqual(clampsFree(6, [gluingWorkspace()]), 4);
  });
});
