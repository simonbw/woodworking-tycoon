import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "../board-helpers";
import { initialGameState } from "../initialGameState";
import { machineViews, MachineState } from "../Machine";
import { Panel } from "../Materials";
import { makeMaterial } from "../material-helpers";
import { BenchPlacement } from "./bench-layout";
import {
  nearestSawMark,
  sawMarkParameters,
  sawMarkPositions,
  selectedBenchPlan,
  toolForOperation,
  toolOperationFor,
} from "./tool-work";

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

const flat: BenchPlacement = { xIn: 24, yIn: 18, angleDeg: 0, flipped: false };
const onEdge: BenchPlacement = { ...flat, onEdge: true };

describe("toolOperationFor", () => {
  it("the sanding block over a rough board offers the sanding pass", () => {
    const machine = workspaceWith({ tools: ["sandingBlock"] });
    const op = toolOperationFor(
      machine,
      progressionWith("surfacePrep"),
      "sandingBlock",
      board("maple", 24, 4, 4, "rough"),
      flat,
    );
    assert.strictEqual(op?.id, "blockSandBoard");
  });

  it("a sanded board offers nothing — the ladder is climbed", () => {
    const machine = workspaceWith({ tools: ["sandingBlock"] });
    assert.strictEqual(
      toolOperationFor(
        machine,
        progressionWith("surfacePrep"),
        "sandingBlock",
        board("maple", 24, 4, 4, "sanded"),
        flat,
      ),
      null,
    );
  });

  it("panels take the panel pass from the same tool", () => {
    const machine = workspaceWith({ tools: ["sandingBlock"] });
    const panel = makeMaterial<Panel>({
      type: "panel",
      length: 24,
      thickness: 4,
      surface: "rough",
      grain: "long",
      strips: [
        { species: "maple", width: 4 },
        { species: "maple", width: 4 },
      ],
    });
    const op = toolOperationFor(
      machine,
      progressionWith("surfacePrep"),
      "sandingBlock",
      panel,
      flat,
    );
    assert.strictEqual(op?.id, "blockSandPanel");
  });

  it("no skill, no offer — locked work is hidden, not grayed out", () => {
    const machine = workspaceWith({ tools: ["sandingBlock"] });
    assert.strictEqual(
      toolOperationFor(
        machine,
        { ...initialGameState.progression, unlockedSkills: [] },
        "sandingBlock",
        board("maple", 24, 4, 4, "rough"),
        flat,
      ),
      null,
    );
  });

  it("an unmounted tool offers nothing", () => {
    const machine = workspaceWith({ tools: [] });
    assert.strictEqual(
      toolOperationFor(
        machine,
        progressionWith("surfacePrep"),
        "sandingBlock",
        board("maple", 24, 4, 4, "rough"),
        flat,
      ),
      null,
    );
  });

  it("how the board lies picks the plane's job: flat is the face, on edge the edge", () => {
    const machine = workspaceWith({ tools: ["handPlane"] });
    // Genuinely unmilled stock — the plane's jobs want zeros to flatten
    const stock = board("oak", 24, 4, 4, "rough", { faces: 0, edges: 0 });
    assert.strictEqual(
      toolOperationFor(
        machine,
        progressionWith("basicMilling"),
        "handPlane",
        stock,
        flat,
      )?.id,
      "handPlaneFace",
    );
    assert.strictEqual(
      toolOperationFor(
        machine,
        progressionWith("basicMilling"),
        "handPlane",
        stock,
        onEdge,
      )?.id,
      "handPlaneEdge",
    );
  });

  it("the sanding block ignores a board stood on edge — faces sand flat", () => {
    const machine = workspaceWith({ tools: ["sandingBlock"] });
    assert.strictEqual(
      toolOperationFor(
        machine,
        progressionWith("surfacePrep"),
        "sandingBlock",
        board("maple", 24, 4, 4, "rough"),
        onEdge,
      ),
      null,
    );
  });

  it("the hand saw offers a cut on any board a detent fits inside", () => {
    const machine = workspaceWith({ tools: ["handSaw"] });
    assert.strictEqual(
      toolOperationFor(
        machine,
        progressionWith("basicMilling"),
        "handSaw",
        board("pine", 48, 4, 4),
        flat,
      )?.id,
      "handSawCut",
    );
    // A board at the shortest detent has nowhere to cut
    assert.strictEqual(
      toolOperationFor(
        machine,
        progressionWith("basicMilling"),
        "handSaw",
        board("pine", 6, 4, 4),
        flat,
      ),
      null,
    );
  });
});

describe("saw marks", () => {
  it("the detents inside a board are the half-foot marks short of its length", () => {
    assert.deepStrictEqual(
      sawMarkPositions(board("pine", 20, 4, 4)),
      [6, 12, 18],
    );
    assert.deepStrictEqual(sawMarkPositions(board("pine", 6, 4, 4)), []);
  });

  it("the mark snaps to the nearest detent under the hand", () => {
    const stock = board("pine", 48, 4, 4);
    assert.strictEqual(nearestSawMark(stock, 13.4), 12);
    assert.strictEqual(nearestSawMark(stock, 16), 18);
    // Past the last detent it clamps to the longest cut that fits
    assert.strictEqual(nearestSawMark(stock, 47), 42);
    assert.strictEqual(nearestSawMark(board("pine", 6, 4, 4), 3), null);
  });

  it("a mark measures the kept length from the top end", () => {
    assert.deepStrictEqual(sawMarkParameters(18, -45), {
      targetLength: 18,
      cutEnd: "right",
      angle: -45,
    });
  });
});

describe("toolForOperation", () => {
  it("finds the mounted tool that owns an operation", () => {
    const machine = workspaceWith({ tools: ["sandingBlock", "handSaw"] });
    const ops = machine.operations;
    const saw = ops.find((op) => op.id === "handSawCut")!;
    const sand = ops.find((op) => op.id === "blockSandBoard")!;
    assert.strictEqual(toolForOperation(machine, saw), "handSaw");
    assert.strictEqual(toolForOperation(machine, sand), "sandingBlock");
    const bench = ops.find((op) => op.id === "dismantlePallet")!;
    assert.strictEqual(toolForOperation(machine, bench), null);
  });
});

describe("the finishing kit, tool-first", () => {
  const stripedPanel = () =>
    makeMaterial<Panel>({
      type: "panel",
      strips: [
        { species: "walnut", width: 2 },
        { species: "maple", width: 2 },
        { species: "walnut", width: 2 },
        { species: "maple", width: 2 },
        { species: "walnut", width: 2 },
      ],
      length: 24,
      thickness: 4,
      surface: "sanded",
    });

  it("offers the pickiest finish the panel satisfies — stripes beat two-tone", () => {
    const machine = workspaceWith({ tools: ["finishingKit"] });
    const op = toolOperationFor(
      machine,
      progressionWith("panelWork", "twoToneBoards", "stripedBoards"),
      "finishingKit",
      stripedPanel(),
      flat,
    );
    assert.strictEqual(op?.id, "finishStripedBoard");
  });

  it("falls back to the finish the skills actually cover", () => {
    const machine = workspaceWith({ tools: ["finishingKit"] });
    const op = toolOperationFor(
      machine,
      progressionWith("panelWork", "twoToneBoards"),
      "finishingKit",
      stripedPanel(),
      flat,
    );
    assert.strictEqual(op?.id, "finishTwoToneBoard");
  });

  it("the rag over a raw cutting board offers the oil wipe", () => {
    const machine = workspaceWith({ tools: ["finishingKit"] });
    const op = toolOperationFor(
      machine,
      progressionWith("panelWork"),
      "finishingKit",
      makeMaterial({ type: "simpleCuttingBoard", species: "maple" } as never),
      flat,
    );
    assert.strictEqual(op?.id, "oilCuttingBoard");
  });

  it("an oiled board offers nothing — boards oil once", () => {
    const machine = workspaceWith({ tools: ["finishingKit"] });
    assert.strictEqual(
      toolOperationFor(
        machine,
        progressionWith("panelWork"),
        "finishingKit",
        makeMaterial({
          type: "simpleCuttingBoard",
          species: "maple",
          finish: "mineralOil",
        } as never),
        flat,
      ),
      null,
    );
  });
});

describe("selectedBenchPlan", () => {
  it("is null for tool work — the last cut isn't a drawing off the pile", () => {
    // operateMachine records the tool operation it claimed in
    // selectedOperationId, so the id names the last pass, not a plan.
    assert.strictEqual(
      selectedBenchPlan(
        workspaceWith({
          tools: ["handSaw"],
          selectedOperationId: "handSawCut",
        }),
      ),
      null,
    );
  });

  it("is null for a glue-up — the clamps decide those, not a plan", () => {
    assert.strictEqual(
      selectedBenchPlan(workspaceWith({ selectedOperationId: "glueUpPanel" })),
      null,
    );
  });

  it("is the assembly build pulled off the pile", () => {
    assert.strictEqual(
      selectedBenchPlan(workspaceWith({ selectedOperationId: "buildShelf" }))
        ?.id,
      "buildShelf",
    );
  });

  it("is null when the id resolves to nothing", () => {
    assert.strictEqual(
      selectedBenchPlan(workspaceWith({ selectedOperationId: "none" })),
      null,
    );
  });
});
