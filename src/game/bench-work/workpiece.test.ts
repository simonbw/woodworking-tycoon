import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "../board-helpers";
import { initialGameState } from "../initialGameState";
import { machineViews, MachineState } from "../Machine";
import {
  CUTTING_BOARD_FOOTPRINTS,
  FINISHED_PRODUCT_TYPES,
  MaterialInstance,
  Pallet,
} from "../Materials";
import { initialPalletNails } from "./pallet-geometry";
import { productBlueprintFor } from "./blueprint";
import {
  benchScriptFor,
  pieceSize,
  placedPieceSize,
  pryTargets,
  rowLayout,
  sawLineFraction,
  strokeSurfaceSize,
} from "./workpiece";

function workspaceWith(overrides: Partial<MachineState>) {
  const state: MachineState = {
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
  return machineViews([state])[0];
}

function progressionWith(...skills: string[]) {
  return {
    ...initialGameState.progression,
    unlockedSkills: [
      ...initialGameState.progression.unlockedSkills,
      ...(skills as never[]),
    ],
  };
}

const fullPallet = (): Pallet => ({
  id: "p1",
  type: "pallet",
  deckBoards: Array(11).fill(true) as Pallet["deckBoards"],
  stringers: [true, true, true],
  nails: initialPalletNails(Array(11).fill(true), [true, true, true]),
});

describe("workpiece geometry", () => {
  it("a board's stroked face is width × length in inches", () => {
    const size = strokeSurfaceSize(board("maple", 24, 4, 4, "rough"));
    assert.deepStrictEqual(size, { widthIn: 4, heightIn: 24 });
  });

  it("edge work strokes the thickness band instead", () => {
    const size = strokeSurfaceSize(board("maple", 24, 4, 4, "rough"), "edge");
    assert.deepStrictEqual(size, { widthIn: 1, heightIn: 24 });
  });

  it("rowLayout spaces pieces with gaps and reports the span", () => {
    const strips = [
      board("maple", 24, 2, 4, "smooth"),
      board("maple", 24, 2, 4, "smooth"),
      board("maple", 24, 2, 4, "smooth"),
    ];
    const { slots, size } = rowLayout(strips, 2);
    assert.strictEqual(slots.length, 3);
    assert.strictEqual(slots[0].xIn, 0);
    assert.strictEqual(slots[1].xIn, 4);
    assert.strictEqual(slots[2].xIn, 8);
    assert.deepStrictEqual(size, { widthIn: 10, heightIn: 24 });
  });

  it("pieceSize knows sheets in feet and boards in inches", () => {
    assert.deepStrictEqual(pieceSize(board("pine", 36, 4, 1)), {
      widthIn: 4,
      heightIn: 36,
    });
  });

  it("every finished product has a real footprint, never the fallback", () => {
    // A product hit-tests exactly where its sprite draws: assembled
    // pieces read their blueprint's box, machine-made ones the shared
    // footprint declaration. A type covered by neither would fall to the
    // 10×10 fallback and be grabbable on a fraction of its visible area.
    for (const type of FINISHED_PRODUCT_TYPES) {
      const declared =
        productBlueprintFor(type) ?? CUTTING_BOARD_FOOTPRINTS[type as never];
      assert.ok(declared, `${type} has no declared footprint`);
    }
  });

  it("an assembled product's footprint is its blueprint's box", () => {
    const blueprint = productBlueprintFor("rusticShelf");
    assert.ok(blueprint);
    const shelf = {
      id: "shelf1",
      type: "rusticShelf",
      species: "pine",
    } as MaterialInstance;
    assert.deepStrictEqual(pieceSize(shelf), {
      widthIn: blueprint.widthIn,
      heightIn: blueprint.heightIn,
    });
  });

  it("sawLineFraction measures the kept length from the uncut end", () => {
    const stock = board("pine", 48, 4, 1);
    // Cutting the right end to keep 3 of 4 feet: the line sits 3/4 down
    assert.strictEqual(
      sawLineFraction(stock, { targetLength: 36, cutEnd: "right", angle: 0 }),
      0.75,
    );
    assert.strictEqual(
      sawLineFraction(stock, { targetLength: 36, cutEnd: "left", angle: 0 }),
      0.25,
    );
  });

  it("pryTargets is the pallet's own nails — one per crossing", () => {
    const targets = pryTargets(fullPallet());
    assert.strictEqual(targets.length, 33);
    assert.deepStrictEqual(targets[0], { deck: 0, stringer: 0 });
  });
});

describe("benchScriptFor", () => {
  it("offers prying when a pallet is staged and the plan is dismantle", () => {
    const machine = workspaceWith({ inputMaterials: [fullPallet()] });
    const script = benchScriptFor(machine, progressionWith());
    assert.strictEqual(script?.kind, "pry");
  });

  it("offers prying with no plan selected at all — the pallet is the offer", () => {
    const machine = workspaceWith({
      selectedOperationId: undefined,
      inputMaterials: [fullPallet()],
    });
    const script = benchScriptFor(machine, progressionWith());
    assert.strictEqual(script?.kind, "pry");
  });

  it("a staged pallet wins over a lingering plan selection", () => {
    // Sand Board is selected and its board is staged, but the pallet
    // physically covers the bench — prying is what's on offer until it
    // comes off.
    const machine = workspaceWith({
      tools: ["sandingBlock"],
      selectedOperationId: "blockSandBoard",
      inputMaterials: [board("maple", 24, 4, 4, "rough"), fullPallet()],
    });
    const script = benchScriptFor(machine, progressionWith("surfacePrep"));
    assert.strictEqual(script?.kind, "pry");
  });

  it("offers nothing when the selected plan is legacy hand work", () => {
    const machine = workspaceWith({
      selectedOperationId: "finishCuttingBoard",
    });
    assert.strictEqual(
      benchScriptFor(machine, progressionWith("panelWork")),
      null,
    );
  });

  it("never offers idle stroke work from a plan — the tool in hand does", () => {
    // A stale sanding selection (old saves may carry one) mounts nothing:
    // stroke and saw work is tool-first now (bench-work/tool-work.ts).
    const machine = workspaceWith({
      tools: ["sandingBlock"],
      selectedOperationId: "blockSandBoard",
      inputMaterials: [board("maple", 24, 4, 4, "rough")],
    });
    assert.strictEqual(
      benchScriptFor(machine, progressionWith("surfacePrep")),
      null,
    );
  });

  it("keeps the stroke script through a refresh of a started pass", () => {
    const machine = workspaceWith({
      tools: ["sandingBlock"],
      selectedOperationId: "blockSandBoard",
      processingMaterials: [board("maple", 24, 4, 4, "rough")],
      operationProgress: {
        status: "inProgress",
        phaseIndex: 0,
        ticksRemaining: 40,
      },
    });
    const script = benchScriptFor(machine, progressionWith("surfacePrep"));
    assert.ok(script?.kind === "stroke" && script.started === true);
  });

  it("reports the cure once a glue-up is past its attended phase", () => {
    const machine = workspaceWith({
      selectedOperationId: "glueUpPanel",
      processingMaterials: [],
      operationProgress: {
        status: "inProgress",
        phaseIndex: 1,
        ticksRemaining: 30,
      },
    });
    const script = benchScriptFor(machine, progressionWith("panelWork"));
    assert.strictEqual(script?.kind, "curing");
  });

  it("a glue selection never mounts a script — glue-ups are clamps-first", () => {
    // No plan is ever selected for a glue-up: the run lying in the
    // clamps decides (bench-work/glue-up.ts), so even a stale selection
    // with the skill known mounts nothing over the scene.
    const machine = workspaceWith({
      selectedOperationId: "glueUpPair",
      inputMaterials: [
        board("maple", 24, 2, 4, "smooth"),
        board("maple", 24, 2, 4, "smooth"),
      ],
    });
    assert.strictEqual(benchScriptFor(machine, progressionWith()), null);
    assert.strictEqual(
      benchScriptFor(machine, progressionWith("freeformLamination")),
      null,
    );
  });

  it("a glue-up in progress reads as curing, whatever the phase", () => {
    // The tighten commits start and finish back to back, so anything in
    // progress is as good as in the clamps already.
    const machine = workspaceWith({
      selectedOperationId: "glueUpPanel",
      processingMaterials: Array.from({ length: 5 }, () =>
        board("maple", 24, 2, 4, "smooth", { faces: 2, edges: 2 }),
      ),
      operationProgress: {
        status: "inProgress",
        phaseIndex: 0,
        ticksRemaining: 4,
      },
    });
    assert.strictEqual(
      benchScriptFor(machine, progressionWith())?.kind,
      "curing",
    );
  });
});

describe("placedPieceSize on end", () => {
  it("a standing board covers only its cross-section", () => {
    const b = board("oak", 24, 2, 6);
    assert.deepStrictEqual(placedPieceSize(b, { onEnd: true }), {
      widthIn: 2,
      heightIn: 1.5,
    });
  });
});
