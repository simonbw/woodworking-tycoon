import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "./board-helpers";
import { initialGameState } from "./initialGameState";
import { Machine, MachineId, MachineState, OperationProgress } from "./Machine";
import {
  deriveMachineCutLoad,
  deriveMachineSoundPhase,
} from "./machine-sound-helpers";
import { MaterialInstance, Panel } from "./Materials";
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

function cuttingMachine(
  machineTypeId: MachineId,
  processingMaterials: MaterialInstance[],
  inputMaterials: MaterialInstance[] = [],
): Machine {
  const state: MachineState = {
    machineTypeId,
    position: [2, 2],
    rotation: 0,
    // The load derivation never reads the operation, only the stock.
    selectedOperationId: "planeBoard",
    selectedParameters: undefined,
    operationProgress: {
      status: "inProgress",
      phaseIndex: 0,
      ticksRemaining: 5,
    },
    inputMaterials,
    processingMaterials,
    outputMaterials: [],
    tools: [],
  };
  return new Machine(state);
}

describe("deriveMachineCutLoad", () => {
  it("defaults to 1 when there's no stock to measure", () => {
    assert.equal(deriveMachineCutLoad(cuttingMachine("lunchboxPlaner", [])), 1);
  });

  it("strains the planer more for wide boards than narrow ones", () => {
    const wide = deriveMachineCutLoad(
      cuttingMachine("lunchboxPlaner", [board("pine", 4, 8, 4)]),
    );
    const narrow = deriveMachineCutLoad(
      cuttingMachine("lunchboxPlaner", [board("pine", 4, 2, 4)]),
    );
    assert.ok(wide > 1, `wide=${wide}`);
    assert.ok(narrow < 1, `narrow=${narrow}`);
  });

  it("planer load ignores thickness", () => {
    const thick = deriveMachineCutLoad(
      cuttingMachine("lunchboxPlaner", [board("pine", 4, 4, 8)]),
    );
    const thin = deriveMachineCutLoad(
      cuttingMachine("lunchboxPlaner", [board("pine", 4, 4, 1)]),
    );
    assert.equal(thick, thin);
  });

  it("strains the table saw by thickness, not width", () => {
    const thick = deriveMachineCutLoad(
      cuttingMachine("jobsiteTableSaw", [board("pine", 4, 2, 8)]),
    );
    const thin = deriveMachineCutLoad(
      cuttingMachine("jobsiteTableSaw", [board("pine", 4, 8, 2)]),
    );
    assert.ok(thick > thin, `thick=${thick} thin=${thin}`);
  });

  it("strains the miter saw by both width and thickness", () => {
    const beefy = deriveMachineCutLoad(
      cuttingMachine("miterSaw", [board("pine", 4, 6, 6)]),
    );
    const wideButThin = deriveMachineCutLoad(
      cuttingMachine("miterSaw", [board("pine", 4, 6, 2)]),
    );
    const skinny = deriveMachineCutLoad(
      cuttingMachine("miterSaw", [board("pine", 4, 2, 2)]),
    );
    assert.ok(beefy > wideButThin, `beefy=${beefy} wideThin=${wideButThin}`);
    assert.ok(wideButThin > skinny, `wideThin=${wideButThin} skinny=${skinny}`);
  });

  it("clamps extreme stock to the strain range", () => {
    const max = deriveMachineCutLoad(
      cuttingMachine("lunchboxPlaner", [board("pine", 8, 8, 8)]),
    );
    const min = deriveMachineCutLoad(
      cuttingMachine("lunchboxPlaner", [board("pine", 1, 1, 1)]),
    );
    assert.equal(max, 1.3);
    assert.equal(min, 0.4);
  });

  it("measures a panel by its summed strip width", () => {
    const panel: Panel = {
      id: "p1",
      type: "panel",
      length: 4,
      thickness: 4,
      strips: [
        { species: "pine", width: 6 },
        { species: "pine", width: 6 },
      ],
      surface: "rough",
    };
    assert.equal(
      deriveMachineCutLoad(cuttingMachine("lunchboxPlaner", [panel])),
      1.3,
    );
  });

  it("falls back to the infeed when nothing is processing yet", () => {
    const machine = cuttingMachine(
      "lunchboxPlaner",
      [],
      [board("pine", 4, 8, 4)],
    );
    assert.ok(deriveMachineCutLoad(machine) > 1);
  });
});
