import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "../board-helpers";
import { MACHINE_TYPES, MachineOperation } from "../Machine";
import { TOOL_TYPES } from "../Tool";
import { isFinishedProduct, materialMeetsInput } from "../material-helpers";
import { getSellValue } from "../material-values";
import {
  isSunrisePattern,
  panel,
  stripsAlternate,
  widthDominantSpecies,
} from "../panel-helpers";
import { getOperationDuration, getOperationPhases } from "../skill-helpers";
import { PanelStrip, Species } from "../Materials";
import { GLUE_CURE_TICKS, workspace } from "./workspace";

const glueUpPair = workspace.operations.find(
  (op) => op.id === "glueUpPair",
) as MachineOperation;
const extendPanel = workspace.operations.find(
  (op) => op.id === "extendPanel",
) as MachineOperation;
const joinPanels = workspace.operations.find(
  (op) => op.id === "joinPanels",
) as MachineOperation;
const finishStriped = workspace.operations.find(
  (op) => op.id === "finishStripedBoard",
) as MachineOperation;
const finishSunrise = workspace.operations.find(
  (op) => op.id === "finishSunriseBoard",
) as MachineOperation;

/** Shorthand: strips from [species, width] pairs. */
function strips(...pairs: [Species, PanelStrip["width"]][]): PanelStrip[] {
  return pairs.map(([species, width]) => ({ species, width }));
}

describe("stripsAlternate", () => {
  it("accepts strict alternation and rejects repeats", () => {
    assert.ok(
      stripsAlternate(strips(["walnut", 2], ["maple", 2], ["walnut", 2])),
    );
    assert.ok(
      !stripsAlternate(strips(["walnut", 2], ["walnut", 2], ["maple", 2])),
    );
  });
});

describe("isSunrisePattern", () => {
  it("accepts a fade in either direction", () => {
    assert.ok(
      isSunrisePattern(
        strips(
          ["walnut", 3],
          ["maple", 1],
          ["walnut", 2],
          ["maple", 2],
          ["walnut", 1],
          ["maple", 3],
        ),
      ),
    );
    assert.ok(
      isSunrisePattern(
        strips(
          ["walnut", 1],
          ["maple", 3],
          ["walnut", 2],
          ["maple", 2],
          ["walnut", 3],
          ["maple", 1],
        ),
      ),
    );
  });

  it("rejects equal-width alternation (that's a striped board)", () => {
    assert.ok(
      !isSunrisePattern(
        strips(
          ["walnut", 2],
          ["maple", 2],
          ["walnut", 2],
          ["maple", 2],
          ["walnut", 2],
          ["maple", 2],
        ),
      ),
    );
  });

  it("rejects short and non-monotonic fades", () => {
    // Only two strips of each wood
    assert.ok(
      !isSunrisePattern(
        strips(["walnut", 2], ["maple", 1], ["walnut", 1], ["maple", 2]),
      ),
    );
    // Fade stalls in the middle
    assert.ok(
      !isSunrisePattern(
        strips(
          ["walnut", 3],
          ["maple", 1],
          ["walnut", 3],
          ["maple", 2],
          ["walnut", 1],
          ["maple", 3],
        ),
      ),
    );
  });
});

describe("widthDominantSpecies", () => {
  it("picks the wood covering the most width", () => {
    assert.strictEqual(
      widthDominantSpecies(strips(["maple", 1], ["walnut", 4], ["maple", 2])),
      "walnut",
    );
  });

  it("breaks ties by first appearance", () => {
    assert.strictEqual(
      widthDominantSpecies(strips(["maple", 2], ["walnut", 2])),
      "maple",
    );
  });
});

describe("glueUpPair", () => {
  it("glues two strips of any width into a rough panel, in order", () => {
    const { outputs } = glueUpPair.output([
      board("walnut", 2, 3, 4, "smooth"),
      board("maple", 2, 1, 4, "sanded"),
    ]);
    const output = outputs[0];
    assert.strictEqual(output.type, "panel");
    if (output.type !== "panel") return;
    assert.deepStrictEqual(output.strips, [
      { species: "walnut", width: 3 },
      { species: "maple", width: 1 },
    ]);
    assert.strictEqual(output.surface, "rough");
  });
});

describe("extendPanel", () => {
  it("appends the strip and re-roughs the panel", () => {
    const base = panel(strips(["walnut", 3], ["maple", 1]), 2, 4, "sanded");
    const { outputs } = extendPanel.output([
      base,
      board("walnut", 2, 2, 4, "smooth"),
    ]);
    const output = outputs[0];
    assert.strictEqual(output.type, "panel");
    if (output.type !== "panel") return;
    assert.deepStrictEqual(output.strips, [
      { species: "walnut", width: 3 },
      { species: "maple", width: 1 },
      { species: "walnut", width: 2 },
    ]);
    assert.strictEqual(output.surface, "rough");
  });

  it("requires clean strips but takes the panel in any condition", () => {
    const [panelReq, stripReq] = extendPanel.inputMaterials;
    assert.ok(
      materialMeetsInput(panel(strips(["walnut", 3]), 2, 4, "rough"), panelReq),
    );
    assert.ok(!materialMeetsInput(board("maple", 2, 2, 4, "rough"), stripReq));
    assert.ok(materialMeetsInput(board("maple", 2, 2, 4, "smooth"), stripReq));
  });
});

describe("joinPanels", () => {
  it("marries two sub-panels in order and re-roughs the joint", () => {
    const left = panel(strips(["walnut", 3], ["maple", 1]), 2, 4, "sanded");
    const right = panel(strips(["walnut", 2], ["maple", 2]), 2, 4, "smooth");
    const { outputs } = joinPanels.output([left, right]);
    const output = outputs[0];
    assert.strictEqual(output.type, "panel");
    if (output.type !== "panel") return;
    assert.deepStrictEqual(output.strips, [
      { species: "walnut", width: 3 },
      { species: "maple", width: 1 },
      { species: "walnut", width: 2 },
      { species: "maple", width: 2 },
    ]);
    assert.strictEqual(output.surface, "rough");
  });
});

describe("glue-up phases", () => {
  const glueOpIds = ["glueUpPanel", "glueUpPair", "extendPanel", "joinPanels"];

  it("every glue-up clamps attended, then cures hands-free for the same long stretch", () => {
    for (const id of glueOpIds) {
      const op = workspace.operations.find((o) => o.id === id)!;
      assert.ok(op.phases, `${id} declares phases`);
      assert.strictEqual(op.phases[0].attended, true, `${id} clamps attended`);
      const cure = op.phases.find((phase) => !phase.attended)!;
      assert.strictEqual(cure.duration, GLUE_CURE_TICKS, `${id} cure time`);
    }
  });

  it("declared phases always sum to the operation's duration", () => {
    const allOperations = [
      ...Object.values(MACHINE_TYPES).flatMap((type) => type.operations),
      ...Object.values(TOOL_TYPES).flatMap((type) => type.operations),
    ];
    for (const op of allOperations) {
      if (op.phases) {
        const sum = op.phases.reduce(
          (total, phase) => total + phase.duration,
          0,
        );
        assert.strictEqual(sum, op.duration, `${op.id} phases sum`);
      }
    }
  });
});

describe("finishStripedBoard", () => {
  const requirement = finishStriped.inputMaterials[0];
  const alternating = panel(
    strips(
      ["walnut", 2],
      ["maple", 2],
      ["walnut", 2],
      ["maple", 2],
      ["walnut", 2],
    ),
    2,
    3,
    "sanded",
  );

  it("accepts a sanded strictly-alternating two-species panel", () => {
    assert.ok(materialMeetsInput(alternating, requirement));
  });

  it("rejects a clumped two-tone panel (no discipline, no premium)", () => {
    const clumped = panel(
      strips(
        ["walnut", 2],
        ["walnut", 2],
        ["walnut", 2],
        ["maple", 2],
        ["maple", 2],
      ),
      2,
      3,
      "sanded",
    );
    assert.ok(!materialMeetsInput(clumped, requirement));
  });

  it("rejects single-species and pallet-tainted panels", () => {
    const uniform = panel(
      strips(
        ["maple", 2],
        ["maple", 2],
        ["maple", 2],
        ["maple", 2],
        ["maple", 2],
      ),
      2,
      3,
      "sanded",
    );
    assert.ok(!materialMeetsInput(uniform, requirement));
    const tainted = panel(
      strips(
        ["walnut", 2],
        ["pallet", 2],
        ["walnut", 2],
        ["pallet", 2],
        ["walnut", 2],
      ),
      2,
      3,
      "sanded",
    );
    assert.ok(!materialMeetsInput(tainted, requirement));
  });

  it("produces a striped board worth more than the two-tone", () => {
    const { outputs } = finishStriped.output([alternating]);
    const output = outputs[0];
    assert.ok(isFinishedProduct(output));
    assert.strictEqual(output.type, "stripedCuttingBoard");
    assert.strictEqual(output.species, "walnut"); // 3 strips vs 2
    assert.strictEqual(output.accentSpecies, "maple");
    // walnut 5, maple 3 -> avg 4 x 1.5 premium on a $60 base
    assert.strictEqual(getSellValue(output), 60 * 6);
  });
});

describe("finishSunriseBoard", () => {
  const requirement = finishSunrise.inputMaterials[0];
  const sunrise = panel(
    strips(
      ["walnut", 3],
      ["maple", 1],
      ["walnut", 2],
      ["maple", 2],
      ["walnut", 1],
      ["maple", 3],
    ),
    2,
    3,
    "sanded",
  );

  it("accepts a sanded sunrise fade", () => {
    assert.ok(materialMeetsInput(sunrise, requirement));
  });

  it("rejects a striped panel — the fade is the recipe", () => {
    const striped = panel(
      strips(
        ["walnut", 2],
        ["maple", 2],
        ["walnut", 2],
        ["maple", 2],
        ["walnut", 2],
        ["maple", 2],
      ),
      2,
      3,
      "sanded",
    );
    assert.ok(!materialMeetsInput(striped, requirement));
  });

  it("names the wider wood first (asymmetric fades)", () => {
    const walnutHeavy = panel(
      strips(
        ["walnut", 4],
        ["maple", 1],
        ["walnut", 3],
        ["maple", 2],
        ["walnut", 2],
        ["maple", 3],
        ["walnut", 1],
      ),
      2,
      3,
      "sanded",
    );
    const { outputs } = finishSunrise.output([walnutHeavy]);
    const output = outputs[0];
    assert.ok(isFinishedProduct(output));
    assert.strictEqual(output.type, "sunriseCuttingBoard");
    assert.strictEqual(output.species, "walnut"); // 10" vs 6"
    assert.strictEqual(output.accentSpecies, "maple");
  });

  it("is the priciest strip board", () => {
    const { outputs } = finishSunrise.output([sunrise]);
    // walnut 5, maple 3 -> avg 4 x 1.5 premium on a $100 base
    assert.strictEqual(getSellValue(outputs[0]), 100 * 6);
  });
});

describe("quickDryGlue covers the freeform ops", () => {
  const progression = {
    tutorialStage: 2,
    storeUnlocked: true,
    shopLayoutUnlocked: true,
    freeSelling: true,
    commissionsCompleted: 0,
    tickSpeedControlsUnlocked: false,
    xp: 0,
    skillPoints: 0,
    unlockedSkills: ["quickDryGlue" as const],
  };

  it("speeds up curing but not the clamping handwork", () => {
    // Pair: 5 attended + 60 cure -> 5 + 36
    assert.strictEqual(getOperationDuration(glueUpPair, progression), 41);
    assert.strictEqual(getOperationDuration(extendPanel, progression), 41);
    const phases = getOperationPhases(glueUpPair, progression);
    assert.strictEqual(phases[0].duration, 5); // clamping unchanged
    assert.strictEqual(phases[1].duration, 36); // 60 x 0.6
    assert.strictEqual(phases[1].attended, false);
  });
});
