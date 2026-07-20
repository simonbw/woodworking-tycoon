import assert from "node:assert";
import { describe, it } from "node:test";
import { initialGameState } from "./initialGameState";
import { Machine, MachineState, OperationProgress } from "./Machine";
import { deriveMachineSoundPhase } from "./machine-sound-helpers";
import { Vector } from "./Vectors";

/** Planer at [2,2], rotation 0 — operation cell (infeed) is [2,3]. */
const PLANER_OPERATION_CELL: Vector = [2, 3];
const ELSEWHERE: Vector = [0, 0];

function planerMachine(operationProgress: OperationProgress): Machine {
  const state: MachineState = {
    machineTypeId: "lunchboxPlaner",
    position: [2, 2],
    rotation: 0,
    selectedOperationId: "planeBoard",
    selectedParameters: { targetThickness: 4 },
    operationProgress,
    inputMaterials: [],
    processingMaterials: [],
    outputMaterials: [],
    tools: [],
  };
  return new Machine(state);
}

function workspaceGluing(operationProgress: OperationProgress): Machine {
  const state: MachineState = {
    machineTypeId: "workspace",
    position: [2, 2],
    rotation: 0,
    selectedOperationId: "glueUpPanel",
    selectedParameters: undefined,
    operationProgress,
    inputMaterials: [],
    processingMaterials: [],
    outputMaterials: [],
    tools: [],
  };
  return new Machine(state);
}

const progression = initialGameState.progression;

describe("deriveMachineSoundPhase", () => {
  it("is off when no operation is in progress", () => {
    const machine = planerMachine({
      status: "notStarted",
      phaseIndex: 0,
      ticksRemaining: 0,
    });
    assert.equal(
      deriveMachineSoundPhase(
        machine,
        PLANER_OPERATION_CELL,
        false,
        progression,
      ),
      "off",
    );
  });

  it("cuts while the player attends an active attended phase", () => {
    const machine = planerMachine({
      status: "inProgress",
      phaseIndex: 0,
      ticksRemaining: 10,
    });
    assert.equal(
      deriveMachineSoundPhase(
        machine,
        PLANER_OPERATION_CELL,
        false,
        progression,
      ),
      "cutting",
    );
  });

  it("idles when the player steps away mid-operation", () => {
    const machine = planerMachine({
      status: "inProgress",
      phaseIndex: 0,
      ticksRemaining: 10,
    });
    assert.equal(
      deriveMachineSoundPhase(machine, ELSEWHERE, false, progression),
      "running",
    );
  });

  it("idles while the player is on an away trip", () => {
    const machine = planerMachine({
      status: "inProgress",
      phaseIndex: 0,
      ticksRemaining: 10,
    });
    assert.equal(
      deriveMachineSoundPhase(
        machine,
        PLANER_OPERATION_CELL,
        true,
        progression,
      ),
      "running",
    );
  });

  it("idles while waiting at a phase boundary", () => {
    const machine = planerMachine({
      status: "inProgress",
      phaseIndex: 0,
      ticksRemaining: 0,
    });
    assert.equal(
      deriveMachineSoundPhase(machine, ELSEWHERE, false, progression),
      "running",
    );
  });

  it("is silent during a hands-free phase (glue curing)", () => {
    const machine = workspaceGluing({
      status: "inProgress",
      phaseIndex: 1,
      ticksRemaining: 30,
    });
    assert.equal(
      deriveMachineSoundPhase(machine, ELSEWHERE, false, progression),
      "off",
    );
  });

  it("is off once the operation has finished", () => {
    const machine = planerMachine({
      status: "finished",
      phaseIndex: 0,
      ticksRemaining: 0,
    });
    assert.equal(
      deriveMachineSoundPhase(
        machine,
        PLANER_OPERATION_CELL,
        false,
        progression,
      ),
      "off",
    );
  });
});
