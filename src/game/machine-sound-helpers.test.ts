import assert from "node:assert";
import { describe, it } from "node:test";
import { initialGameState } from "./initialGameState";
import { Machine, MachineId, MachineState, OperationProgress } from "./Machine";
import { deriveMachineSoundPhase } from "./machine-sound-helpers";
import { Vector } from "./Vectors";

/** Planer at [2,2], rotation 0 — operation cell (infeed) is [2,3]. */
const PLANER_OPERATION_CELL: Vector = [2, 3];
const ELSEWHERE: Vector = [0, 0];

function machineWith(
  machineTypeId: MachineId,
  selectedOperationId: string,
  operationProgress: OperationProgress,
  poweredOn?: boolean,
): Machine {
  const state: MachineState = {
    machineTypeId,
    position: [2, 2],
    rotation: 0,
    selectedOperationId,
    selectedParameters: undefined,
    operationProgress,
    inputMaterials: [],
    processingMaterials: [],
    outputMaterials: [],
    tools: [],
    poweredOn,
  };
  return new Machine(state);
}

/** The planer has a power switch; it's flipped on unless a test says not. */
function planerMachine(
  operationProgress: OperationProgress,
  poweredOn = true,
): Machine {
  return new Machine({
    ...machineWith("lunchboxPlaner", "planeBoard", operationProgress, poweredOn)
      .state,
    selectedParameters: { targetThickness: 4 },
  });
}

function workspaceGluing(operationProgress: OperationProgress): Machine {
  return machineWith("workspace", "glueUpPanel", operationProgress);
}

const NOT_STARTED: OperationProgress = {
  status: "notStarted",
  phaseIndex: 0,
  ticksRemaining: 0,
};

const MID_CUT: OperationProgress = {
  status: "inProgress",
  phaseIndex: 0,
  ticksRemaining: 10,
};

const progression = initialGameState.progression;

describe("deriveMachineSoundPhase", () => {
  it("is off when switched off with no operation in progress", () => {
    const machine = planerMachine(NOT_STARTED, false);
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

  it("idles when switched on with no operation in progress", () => {
    const machine = planerMachine(NOT_STARTED, true);
    assert.equal(
      deriveMachineSoundPhase(machine, ELSEWHERE, false, progression),
      "running",
    );
  });

  it("a trigger machine (miter saw) is silent between operations", () => {
    const machine = machineWith("miterSaw", "cutBoard", NOT_STARTED);
    assert.equal(
      deriveMachineSoundPhase(machine, ELSEWHERE, false, progression),
      "off",
    );
  });

  it("cuts while the player attends an active attended phase", () => {
    const machine = planerMachine(MID_CUT);
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

  it("goes silent when switched off mid-operation", () => {
    const machine = planerMachine(MID_CUT, false);
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

  it("idles when the player steps away mid-operation", () => {
    const machine = planerMachine(MID_CUT);
    assert.equal(
      deriveMachineSoundPhase(machine, ELSEWHERE, false, progression),
      "running",
    );
  });

  it("idles while the player is on an away trip", () => {
    const machine = planerMachine(MID_CUT);
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

  it("keeps idling after the operation finishes, until switched off", () => {
    const finished: OperationProgress = {
      status: "finished",
      phaseIndex: 0,
      ticksRemaining: 0,
    };
    assert.equal(
      deriveMachineSoundPhase(
        planerMachine(finished, true),
        PLANER_OPERATION_CELL,
        false,
        progression,
      ),
      "running",
    );
    assert.equal(
      deriveMachineSoundPhase(
        planerMachine(finished, false),
        PLANER_OPERATION_CELL,
        false,
        progression,
      ),
      "off",
    );
  });
});
