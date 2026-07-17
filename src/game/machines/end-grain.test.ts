import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "../board-helpers";
import { GameState } from "../GameState";
import { getMachines, MachineOperation, MachineState } from "../Machine";
import { initialGameState } from "../initialGameState";
import { mountToolAction } from "../game-actions/tool-actions";
import { tickAction } from "../game-actions/tickAction";
import { isFinishedProduct, makeMaterial, materialMeetsInput } from "../material-helpers";
import { getSellValue } from "../material-values";
import { EndGrainSlice, SheetGood } from "../Materials";
import { panel, uniformPanel } from "../panel-helpers";
import { crosscutSled, SLICES_PER_PANEL } from "../tools/crosscutSled";
import { lunchboxPlaner } from "./lunchboxPlaner";
import { workspace } from "./workspace";

const crosscut = crosscutSled.operations[0];
const buildSled = workspace.operations.find(
  (op) => op.id === "buildCrosscutSled",
) as MachineOperation;
const glueEndGrain = workspace.operations.find(
  (op) => op.id === "glueUpEndGrain",
) as MachineOperation;
const finishEndGrain = workspace.operations.find(
  (op) => op.id === "finishEndGrainBoard",
) as MachineOperation;

function slice(species: "maple" | "walnut" = "maple"): EndGrainSlice {
  return makeMaterial<EndGrainSlice>({
    type: "endGrainSlice",
    thickness: 4,
    strips: Array.from({ length: 5 }, () => ({ species, width: 2 as const })),
  });
}

function plywood(): SheetGood {
  return makeMaterial<SheetGood>({
    type: "plywood",
    kind: "plywoodB",
    length: 4,
    width: 4,
    thickness: 2,
  });
}

describe("buildCrosscutSled", () => {
  it("takes a plywood base and two scrap boards", () => {
    const [baseReq, runnerReq] = buildSled.inputMaterials;
    assert.ok(materialMeetsInput(plywood(), baseReq));
    assert.ok(materialMeetsInput(board("pallet", 3, 4, 1), runnerReq));
    assert.strictEqual(runnerReq.quantity, 2);
  });

  it("produces tooling, not product", () => {
    const result = buildSled.output([
      plywood(),
      board("pallet", 3, 4, 1),
      board("pallet", 3, 4, 1),
    ]);
    assert.deepStrictEqual(result.outputs, []);
    assert.deepStrictEqual(result.toolOutputs, ["crosscutSled"]);
  });
});

describe("crosscutPanel", () => {
  const requirement = crosscut.inputMaterials[0];

  it("takes a clean long-grain panel, never an end-grain one", () => {
    assert.ok(
      materialMeetsInput(uniformPanel("maple", 5, 2, 2, 4, "sanded"), requirement),
    );
    assert.ok(
      !materialMeetsInput(uniformPanel("maple", 5, 2, 2, 4, "rough"), requirement),
    );
    const endGrain = {
      ...uniformPanel("maple", 5, 2, 2, 4, "sanded"),
      grain: "end" as const,
      length: 2 as const,
    };
    assert.ok(!materialMeetsInput(endGrain, requirement));
  });

  it("yields slices that inherit the strip pattern", () => {
    const striped = panel(
      [
        { species: "walnut", width: 2 },
        { species: "maple", width: 2 },
        { species: "walnut", width: 2 },
        { species: "maple", width: 2 },
        { species: "walnut", width: 2 },
      ],
      2,
      4,
      "sanded",
    );
    const { outputs } = crosscut.output([striped]);
    assert.strictEqual(outputs.length, SLICES_PER_PANEL);
    for (const output of outputs) {
      assert.strictEqual(output.type, "endGrainSlice");
      if (output.type !== "endGrainSlice") continue;
      assert.deepStrictEqual(output.strips, striped.strips);
      assert.strictEqual(output.thickness, 4);
    }
  });
});

describe("glueUpEndGrain", () => {
  it("stands four slices on end into a thick rough blank", () => {
    const { outputs } = glueEndGrain.output([
      slice(),
      slice(),
      slice(),
      slice(),
    ]);
    const blank = outputs[0];
    assert.strictEqual(blank.type, "panel");
    if (blank.type !== "panel") return;
    assert.strictEqual(blank.grain, "end");
    assert.strictEqual(blank.thickness, 8);
    assert.strictEqual(blank.length, 1);
    assert.strictEqual(blank.surface, "rough");
    assert.strictEqual(blank.strips.length, 5);
  });

  it("cures like every other glue-up", () => {
    assert.ok(glueEndGrain.phases);
    assert.strictEqual(glueEndGrain.phases[1].attended, false);
  });
});

describe("finishEndGrainBoard", () => {
  const requirement = finishEndGrain.inputMaterials[0];
  const blank = (overrides: object = {}) => ({
    ...uniformPanel("maple", 5, 2, 1, 8, "sanded"),
    grain: "end" as const,
    ...overrides,
  });

  it("accepts a sanded single-species end-grain blank", () => {
    assert.ok(materialMeetsInput(blank(), requirement));
  });

  it("rejects long-grain panels of the same shape", () => {
    assert.ok(
      !materialMeetsInput(uniformPanel("maple", 5, 2, 1, 8, "sanded"), requirement),
    );
  });

  it("rejects unsanded, multi-species, and pallet blanks", () => {
    assert.ok(!materialMeetsInput(blank({ surface: "smooth" }), requirement));
    assert.ok(
      !materialMeetsInput(
        blank({
          strips: [
            { species: "maple", width: 2 },
            { species: "walnut", width: 2 },
            { species: "maple", width: 2 },
            { species: "walnut", width: 2 },
            { species: "maple", width: 2 },
          ],
        }),
        requirement,
      ),
    );
    assert.ok(
      !materialMeetsInput(
        blank({
          strips: Array.from({ length: 5 }, () => ({
            species: "pallet" as const,
            width: 2 as const,
          })),
        }),
        requirement,
      ),
    );
  });

  it("is the top of the cutting board ladder", () => {
    const { outputs } = finishEndGrain.output([blank()]);
    const product = outputs[0];
    assert.ok(isFinishedProduct(product));
    assert.strictEqual(product.type, "endGrainCuttingBoard");
    assert.strictEqual(product.species, "maple");
    // 150 base x maple 3
    assert.strictEqual(getSellValue(product), 450);
  });
});

describe("planer vs end grain", () => {
  it("planePanel refuses end-grain panels — sanding only", () => {
    const planePanel = lunchboxPlaner.operations.find(
      (op) => op.id === "planePanel",
    )!;
    if (!("getInputMaterials" in planePanel)) {
      assert.fail("planePanel should be parameterized");
    }
    const requirement = planePanel.getInputMaterials({ targetThickness: 4 })[0];
    assert.ok(
      materialMeetsInput(uniformPanel("maple", 5, 2, 1, 8, "rough"), requirement),
    );
    assert.ok(
      !materialMeetsInput(
        { ...uniformPanel("maple", 5, 2, 1, 8, "rough"), grain: "end" as const },
        requirement,
      ),
    );
  });
});

describe("shop-made tooling", () => {
  function sledBuildState(): GameState {
    const machine: MachineState = {
      ...initialGameState.machines[0],
      selectedOperationId: "buildCrosscutSled",
      processingMaterials: [
        plywood(),
        board("pallet", 3, 4, 1),
        board("pallet", 3, 4, 1),
      ],
      operationProgress: {
        status: "inProgress",
        phaseIndex: 0,
        ticksRemaining: 1,
      },
    };
    return {
      ...initialGameState,
      machines: [machine],
      player: { ...initialGameState.player, position: [1, 3] },
    };
  }

  it("finishing the sled recipe delivers the sled to tool storage", () => {
    const result = tickAction(sledBuildState());
    assert.deepStrictEqual(result.storage.tools, ["crosscutSled"]);
    assert.deepStrictEqual(result.machines[0].outputMaterials, []);
    // Tooling is not a product: no craft XP
    assert.strictEqual(result.progression.xp, 0);
  });

  it("the sled only mounts on the table saw", () => {
    const withSled: GameState = {
      ...initialGameState,
      storage: { ...initialGameState.storage, tools: ["crosscutSled"] },
    };
    // Workspace (machine 0) refuses it
    const workspaceMachine = getMachines(withSled.machines)[0];
    const refused = mountToolAction(workspaceMachine, "crosscutSled")(withSled);
    assert.strictEqual(refused, withSled);

    // A table saw accepts it
    const sawState: GameState = {
      ...withSled,
      machines: [
        {
          ...withSled.machines[0],
          machineTypeId: "jobsiteTableSaw",
          selectedOperationId: "ripBoard",
          // The starter hammer stays at the bench — the saw's slot is free
          tools: [],
        },
      ],
    };
    const saw = getMachines(sawState.machines)[0];
    const mounted = mountToolAction(saw, "crosscutSled")(sawState);
    assert.deepStrictEqual(mounted.machines[0].tools, ["crosscutSled"]);
  });
});
