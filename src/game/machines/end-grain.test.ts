import assert from "node:assert";
import { describe, it } from "node:test";
import { TOOL_TYPES } from "../Tool";
import { board, palletBoard } from "../board-helpers";
import { Operation } from "../Machine";
import {
  isFinishedProduct,
  makeMaterial,
  materialMeetsInput,
} from "../material-helpers";
import { getSellValue } from "../material-values";
import { EndGrainSlice, SheetGood } from "../Materials";
import { panel, uniformPanel } from "../panel-helpers";
import { crosscutSled, SLICES_PER_PANEL } from "../tools/crosscutSled";
import { lunchboxPlaner } from "./lunchboxPlaner";
import { workspace } from "./workspace";

const crosscut = crosscutSled.operations[0] as Operation;
const buildSled = workspace.operations.find(
  (op) => op.id === "buildCrosscutSled",
) as Operation;
const glueEndGrain = workspace.operations.find(
  (op) => op.id === "glueUpEndGrain",
) as Operation;
const finishEndGrain = TOOL_TYPES.finishingKit.operations.find(
  (op) => op.id === "finishEndGrainBoard",
) as Operation;

function slice(species: "maple" | "walnut" = "maple"): EndGrainSlice {
  return makeMaterial<EndGrainSlice>({
    type: "endGrainSlice",
    thickness: 4,
    strips: Array.from({ length: 5 }, () => ({ species, width: 2 as const })),
  });
}

/** A sled base, cut to size — the sled takes a piece off a sheet now,
 * not a whole sheet (see docs/sheet-goods.md). */
function plywood(): SheetGood {
  return makeMaterial<SheetGood>({
    type: "plywood",
    kind: "plywoodB",
    length: 24,
    width: 20,
    thickness: 2,
  });
}

describe("buildCrosscutSled", () => {
  it("takes a plywood base and two scrap boards", () => {
    const [baseReq, runnerReq] = buildSled.getInputMaterials({});
    assert.ok(materialMeetsInput(plywood(), baseReq));
    assert.ok(materialMeetsInput(palletBoard(), runnerReq));
    assert.strictEqual(runnerReq.quantity, 2);
  });

  it("produces tooling, not product", () => {
    const result = buildSled.output(
      [plywood(), palletBoard(), palletBoard()],
      {},
    );
    assert.strictEqual(result.outputs.length, 1);
    const sled = result.outputs[0];
    assert.ok(sled.type === "tool" && sled.toolId === "crosscutSled");
  });
});

describe("crosscutPanel", () => {
  const requirement = crosscut.getInputMaterials({})[0];

  it("takes a clean long-grain panel, never an end-grain one", () => {
    assert.ok(
      materialMeetsInput(
        uniformPanel("maple", 5, 2, 24, 4, "sanded"),
        requirement,
      ),
    );
    assert.ok(
      !materialMeetsInput(
        uniformPanel("maple", 5, 2, 24, 4, "rough"),
        requirement,
      ),
    );
    const endGrain = {
      ...uniformPanel("maple", 5, 2, 24, 4, "sanded"),
      grain: "end" as const,
      length: 24,
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
      24,
      4,
      "sanded",
    );
    const { outputs } = crosscut.output([striped], {});
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
    const { outputs } = glueEndGrain.output(
      [slice(), slice(), slice(), slice()],
      {},
    );
    const blank = outputs[0];
    assert.strictEqual(blank.type, "panel");
    if (blank.type !== "panel") return;
    assert.strictEqual(blank.grain, "end");
    assert.strictEqual(blank.thickness, 8);
    assert.strictEqual(blank.length, 12);
    assert.strictEqual(blank.surface, "rough");
    assert.strictEqual(blank.strips.length, 5);
  });

  it("cures like every other glue-up", () => {
    assert.ok(glueEndGrain.phases);
    assert.strictEqual(glueEndGrain.phases[1].attended, false);
  });
});

describe("finishEndGrainBoard", () => {
  const requirement = finishEndGrain.getInputMaterials({})[0];
  const blank = (overrides: object = {}) => ({
    ...uniformPanel("maple", 5, 2, 12, 8, "sanded"),
    grain: "end" as const,
    ...overrides,
  });

  it("accepts a sanded single-species end-grain blank", () => {
    assert.ok(materialMeetsInput(blank(), requirement));
  });

  it("rejects long-grain panels of the same shape", () => {
    assert.ok(
      !materialMeetsInput(
        uniformPanel("maple", 5, 2, 12, 8, "sanded"),
        requirement,
      ),
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
    const { outputs } = finishEndGrain.output([blank()], {});
    const product = outputs[0];
    assert.ok(isFinishedProduct(product));
    assert.strictEqual(product.type, "endGrainCuttingBoard");
    assert.strictEqual(product.species, "maple");
    // $30 base x maple 3
    assert.strictEqual(getSellValue(product), 90);
  });
});

describe("planer vs end grain", () => {
  it("the planer refuses end-grain panels — sanding only", () => {
    const plane = lunchboxPlaner.operations.find((op) => op.id === "plane")!;
    if (!("getInputMaterials" in plane)) {
      assert.fail("plane should be parameterized");
    }
    const requirement = plane.getInputMaterials({ targetThickness: 8 })[0];
    assert.ok(
      materialMeetsInput(
        uniformPanel("maple", 5, 2, 12, 8, "rough"),
        requirement,
      ),
    );
    assert.ok(
      !materialMeetsInput(
        {
          ...uniformPanel("maple", 5, 2, 12, 8, "rough"),
          grain: "end" as const,
        },
        requirement,
      ),
    );
  });
});

/**
 * Building the sled and bolting it to the saw is a whole run, driven in
 * `sim/sequences/end-grain-chain.test.ts`; a station refusing a tool it
 * can't take is `sim/commands/tool-commands.test.ts`. What's left here is
 * the registry claim both of those rest on.
 */
describe("shop-made tooling", () => {
  it("the sled only mounts on the table saw", () => {
    assert.deepStrictEqual(crosscutSled.compatibleMachines, [
      "jobsiteTableSaw",
    ]);
  });
});
