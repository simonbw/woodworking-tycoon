import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "./board-helpers";
import { deriveMachineCutLoad } from "./cut-load";
import { Machine, MachineId, MachineState } from "./Machine";
import { MaterialInstance, Panel } from "./Materials";

function cuttingMachine(
  machineTypeId: MachineId,
  processingMaterials: MaterialInstance[],
  inputMaterials: MaterialInstance[] = [],
  operationId = "planeBoard",
): Machine {
  const state: MachineState = {
    machineTypeId,
    position: [2, 2],
    rotation: 0,
    selectedOperationId: operationId,
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

  it("face jointing strains by width, edge jointing by thickness", () => {
    const wideThinBoard = [board("pine", 4, 8, 2)];
    const face = deriveMachineCutLoad(
      cuttingMachine("jointer", wideThinBoard, [], "jointFace"),
    );
    const edge = deriveMachineCutLoad(
      cuttingMachine("jointer", wideThinBoard, [], "jointEdge"),
    );
    // 8" wide works the face hard; its 1/2" edge is nothing.
    assert.ok(face > 1, `face=${face}`);
    assert.ok(edge < 1, `edge=${edge}`);
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
