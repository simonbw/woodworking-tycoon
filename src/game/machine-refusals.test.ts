import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "./board-helpers";
import { ConsumableStock, NO_CONSUMABLES } from "./Consumable";
import { Machine, MachineId, ParameterValues } from "./Machine";
import { explainFeedRefusal } from "./machine-helpers";
import { makeMaterial } from "./material-helpers";
import { MaterialInstance, Pallet, Panel } from "./Materials";

/** The refusal line standing at a machine with this stock in hand. */
function refusalAt(
  machineTypeId: MachineId,
  selectedOperationId: string,
  selectedParameters: ParameterValues | undefined,
  carried: MaterialInstance[],
  consumables: ConsumableStock = NO_CONSUMABLES,
): string | null {
  const machine = new Machine({
    machineTypeId,
    position: [0, 0],
    rotation: 0,
    selectedOperationId,
    selectedParameters,
    operationProgress: {
      status: "notStarted",
      phaseIndex: 0,
      ticksRemaining: 0,
    },
    inputMaterials: [],
    processingMaterials: [],
    outputMaterials: [],
    tools: [],
  });
  return explainFeedRefusal(machine, machine.operations, carried, consumables);
}

describe("explainFeedRefusal", () => {
  it("says nothing when a feed would run", () => {
    // A skim pass: stock right at the cut height
    assert.strictEqual(
      refusalAt("lunchboxPlaner", "plane", { targetThickness: 4 }, [
        board("oak", 8, 4, 4),
      ]),
      null,
    );
  });

  it("names empty hands before anything else", () => {
    assert.match(
      refusalAt("lunchboxPlaner", "plane", { targetThickness: 4 }, [])!,
      /hands are empty/i,
    );
  });

  it("planer: a board with no flat face is taught to visit the jointer", () => {
    assert.match(
      refusalAt("lunchboxPlaner", "plane", { targetThickness: 4 }, [
        board("oak", 8, 4, 4, "rough", { faces: 0 }),
      ])!,
      /Joint a face first/,
    );
  });

  it("planer: stock too thick blames the crank, with the mark to hit", () => {
    assert.match(
      refusalAt("lunchboxPlaner", "plane", { targetThickness: 2 }, [
        board("oak", 8, 4, 8),
      ])!,
      /raise the cut height to 7\/4/,
    );
  });

  it("planer: stock below the head blames the crank the other way", () => {
    assert.match(
      refusalAt("lunchboxPlaner", "plane", { targetThickness: 4 }, [
        board("oak", 8, 4, 1),
      ])!,
      /lower the cut height to 1\/4/,
    );
  });

  it("planer: end grain is sent to the sander", () => {
    const endGrainPanel = makeMaterial<Panel>({
      type: "panel",
      strips: [
        { species: "oak", width: 2 },
        { species: "oak", width: 2 },
      ],
      length: 2,
      thickness: 2,
      surface: "smooth",
      grain: "end",
    });
    assert.match(
      refusalAt("lunchboxPlaner", "plane", { targetThickness: 2 }, [
        endGrainPanel,
      ])!,
      /End grain tears out/,
    );
  });

  it("jointer: fully milled stock hears there's nothing left to joint", () => {
    assert.match(
      refusalAt("jointer", "jointFace", undefined, [
        board("oak", 6, 4, 4, "smooth"),
      ])!,
      /nothing left to joint/i,
    );
  });

  it("table saw: a rough edge is warned off the fence", () => {
    assert.match(
      refusalAt("jobsiteTableSaw", "ripBoard", { targetWidth: 2 }, [
        board("pine", 6, 4, 4, "rough", { edges: 0 }),
      ])!,
      /rough edge can't ride the fence/i,
    );
  });

  it("table saw: a fence set wider than the stock blames the fence", () => {
    assert.match(
      refusalAt("jobsiteTableSaw", "ripBoard", { targetWidth: 4 }, [
        board("pine", 6, 2, 4),
      ])!,
      /fence is set to 4/,
    );
  });

  it("miter saw: a cut line past the board says slide it, not wrong wood", () => {
    assert.match(
      refusalAt("miterSaw", "cutBoard", { angle: 0, cutPosition: 4 }, [
        board("walnut", 2, 1, 1, "sanded"),
      ])!,
      /slide the cut line/i,
    );
  });

  it("falls back to the requirement description without an authored line", () => {
    const pallet = makeMaterial<Pallet>({
      type: "pallet",
      deckBoards: [
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
      ],
      stringerBoardsLeft: 3 as const,
    });
    assert.match(
      refusalAt("jointer", "jointFace", undefined, [pallet])!,
      /^Needs: /,
    );
  });

  it("reports missing supplies once the stock itself qualifies", () => {
    const rail = () => ({
      ...board("walnut", 2, 1, 1, "sanded"),
      ends: {
        left: { kind: "mitered", angle: -45 },
        right: { kind: "mitered", angle: 45 },
      },
    });
    const message = refusalAt(
      "workspace",
      "buildPictureFrame",
      undefined,
      [rail(), rail(), rail(), rail()] as MaterialInstance[],
      { ...NO_CONSUMABLES, nails: 2 },
    );
    assert.match(message!, /Out of nails — this needs 4, the shop has 2/);
  });
});
