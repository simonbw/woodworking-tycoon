import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "../board-helpers";
import { initialGameState } from "../initialGameState";
import { getMachines, MachineState } from "../Machine";
import { Pallet } from "../Materials";
import {
  benchScriptFor,
  pieceSize,
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
  return getMachines([state])[0];
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
  stringerBoardsLeft: 3,
});

describe("workpiece geometry", () => {
  it("a board's stroked face is width × length in inches", () => {
    const size = strokeSurfaceSize(board("maple", 2, 4, 4, "rough"));
    assert.deepStrictEqual(size, { widthIn: 4, heightIn: 24 });
  });

  it("edge work strokes the thickness band instead", () => {
    const size = strokeSurfaceSize(board("maple", 2, 4, 4, "rough"), "edge");
    assert.deepStrictEqual(size, { widthIn: 1, heightIn: 24 });
  });

  it("rowLayout spaces pieces with gaps and reports the span", () => {
    const strips = [
      board("maple", 2, 2, 4, "smooth"),
      board("maple", 2, 2, 4, "smooth"),
      board("maple", 2, 2, 4, "smooth"),
    ];
    const { slots, size } = rowLayout(strips, 2);
    assert.strictEqual(slots.length, 3);
    assert.strictEqual(slots[0].xIn, 0);
    assert.strictEqual(slots[1].xIn, 4);
    assert.strictEqual(slots[2].xIn, 8);
    assert.deepStrictEqual(size, { widthIn: 10, heightIn: 24 });
  });

  it("pieceSize knows sheets in feet and boards in inches", () => {
    assert.deepStrictEqual(pieceSize(board("pine", 3, 4, 1)), {
      widthIn: 4,
      heightIn: 36,
    });
  });

  it("sawLineFraction measures the kept length from the uncut end", () => {
    const stock = board("pine", 4, 4, 1);
    // Cutting the right end to keep 3 of 4 feet: the line sits 3/4 down
    assert.strictEqual(
      sawLineFraction(stock, { targetLength: 3, cutEnd: "right", angle: 0 }),
      0.75,
    );
    assert.strictEqual(
      sawLineFraction(stock, { targetLength: 3, cutEnd: "left", angle: 0 }),
      0.25,
    );
  });

  it("pryTargets counts every remaining nail, deck first", () => {
    const targets = pryTargets(fullPallet());
    assert.strictEqual(targets.length, 14);
    assert.strictEqual(targets.filter((t) => t.kind === "deck").length, 11);
    assert.strictEqual(targets.filter((t) => t.kind === "stringer").length, 3);
  });
});

describe("benchScriptFor", () => {
  it("offers prying when a pallet is staged and the plan is dismantle", () => {
    const machine = workspaceWith({ inputMaterials: [fullPallet()] });
    const script = benchScriptFor(machine, progressionWith());
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

  it("offers an unstarted stroke script once the board is staged", () => {
    const machine = workspaceWith({
      tools: ["sandingBlock"],
      selectedOperationId: "blockSandBoard",
      inputMaterials: [board("maple", 2, 4, 4, "rough")],
    });
    const script = benchScriptFor(machine, progressionWith("surfacePrep"));
    assert.ok(script?.kind === "stroke" && script.started === false);
  });

  it("keeps the stroke script through a refresh of a started pass", () => {
    const machine = workspaceWith({
      tools: ["sandingBlock"],
      selectedOperationId: "blockSandBoard",
      processingMaterials: [board("maple", 2, 4, 4, "rough")],
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

  it("locked skills hide the script entirely — no grayed-out teasers", () => {
    // Glue Up Pair sits behind freeformLamination, which nobody starts with
    const machine = workspaceWith({
      selectedOperationId: "glueUpPair",
      inputMaterials: [
        board("maple", 2, 2, 4, "smooth"),
        board("maple", 2, 2, 4, "smooth"),
      ],
    });
    assert.strictEqual(benchScriptFor(machine, progressionWith()), null);
    assert.strictEqual(
      benchScriptFor(machine, progressionWith("freeformLamination"))?.kind,
      "glue",
    );
  });
});
