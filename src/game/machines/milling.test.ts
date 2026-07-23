import assert from "node:assert";
import { describe, it } from "node:test";
import { board, isBoard } from "../board-helpers";
import { MachineOperation, ParameterizedOperation } from "../Machine";
import { LUMBER_CHANNELS, unlockedLumberChannels } from "../lumberStock";
import { materialMeetsInput } from "../material-helpers";
import { millingLabel } from "../Materials";
import { handPlane } from "../tools/handPlane";
import { straightLineSled } from "../tools/straightLineSled";
import { jointer } from "./jointer";
import { jobsiteTableSaw } from "./jobsiteTableSaw";
import { lunchboxPlaner } from "./lunchboxPlaner";
import { workspace } from "./workspace";

const jointFace = jointer.operations.find(
  (op) => op.id === "jointFace",
) as MachineOperation;
const jointEdge = jointer.operations.find(
  (op) => op.id === "jointEdge",
) as MachineOperation;
const straightLineRip = straightLineSled.operations.find(
  (op) => op.id === "straightLineRip",
) as MachineOperation;
const plane = lunchboxPlaner.operations.find(
  (op) => op.id === "plane",
) as ParameterizedOperation;
const ripBoard = jobsiteTableSaw.operations.find(
  (op) => op.id === "ripBoard",
) as ParameterizedOperation;
const glueUp = workspace.operations.find(
  (op) => op.id === "glueUpPanel",
) as MachineOperation;

/** A board fresh off the rough rack: nothing flat, nothing straight. */
const roughBoard = (thickness: 4 | 8 = 4) =>
  board("walnut", 8, 6, thickness, "rough", { faces: 0, edges: 0 });

describe("jointer", () => {
  it("joints a face only on boards with no flat face", () => {
    const requirement = jointFace.inputMaterials[0];
    assert.ok(materialMeetsInput(roughBoard(), requirement));
    assert.ok(
      !materialMeetsInput(
        board("walnut", 8, 6, 4, "rough", { faces: 1, edges: 0 }),
        requirement,
      ),
    );
  });

  it("face jointing yields one flat face and touches nothing else", () => {
    const { outputs } = jointFace.output([roughBoard()]);
    const result = outputs[0];
    assert.ok(isBoard(result));
    assert.strictEqual(result.jointedFaces, 1);
    assert.strictEqual(result.jointedEdges, 0);
    assert.strictEqual(result.surface, "rough");
    assert.strictEqual(result.thickness, 4);
  });

  it("edge jointing references a flat face against the fence", () => {
    const requirement = jointEdge.inputMaterials[0];
    // No flat face: nothing to register on the fence
    assert.ok(!materialMeetsInput(roughBoard(), requirement));
    assert.ok(
      materialMeetsInput(
        board("walnut", 8, 6, 4, "rough", { faces: 1, edges: 0 }),
        requirement,
      ),
    );
    const { outputs } = jointEdge.output([
      board("walnut", 8, 6, 4, "rough", { faces: 1, edges: 0 }),
    ]);
    const result = outputs[0];
    assert.ok(isBoard(result));
    assert.strictEqual(result.jointedEdges, 1);
  });
});

describe("straight-line sled", () => {
  it("straightens an edge with no prerequisites at all", () => {
    // The sled rides the rails, not the fence — even fully rough stock works
    const requirement = straightLineRip.inputMaterials[0];
    assert.ok(materialMeetsInput(roughBoard(), requirement));
    const { outputs } = straightLineRip.output([roughBoard()]);
    const result = outputs[0];
    assert.ok(isBoard(result));
    assert.strictEqual(result.jointedEdges, 1);
    assert.strictEqual(result.jointedFaces, 0);
  });

  it("only mounts on the table saw", () => {
    assert.deepStrictEqual(straightLineSled.compatibleMachines, [
      "jobsiteTableSaw",
    ]);
    assert.ok(straightLineSled.craftedOnly);
  });
});

describe("hand plane", () => {
  it("flattens a face and straightens an edge, slowly", () => {
    const faceOp = handPlane.operations.find(
      (op) => op.id === "handPlaneFace",
    ) as MachineOperation;
    const edgeOp = handPlane.operations.find(
      (op) => op.id === "handPlaneEdge",
    ) as MachineOperation;
    const flattened = faceOp.output([roughBoard()]).outputs[0];
    assert.ok(isBoard(flattened));
    assert.strictEqual(flattened.jointedFaces, 1);
    const straightened = edgeOp.output([roughBoard()]).outputs[0];
    assert.ok(isBoard(straightened));
    assert.strictEqual(straightened.jointedEdges, 1);
    // Slower than the machines that replace it
    assert.ok(faceOp.duration > 10 && edgeOp.duration > 8);
  });
});

describe("planer face prerequisites", () => {
  it("refuses boards without a flat reference face", () => {
    const requirement = plane.getInputMaterials({ targetThickness: 4 })[0];
    assert.ok(!materialMeetsInput(roughBoard(), requirement));
    assert.ok(
      materialMeetsInput(
        board("walnut", 8, 6, 4, "rough", { faces: 1, edges: 0 }),
        requirement,
      ),
    );
  });

  it("skim-passes at nominal thickness and makes faces parallel", () => {
    // Rough stock carries sacrificial material: 4/4 rough planes to 4/4 done
    const { outputs } = plane.output(
      [board("walnut", 8, 6, 4, "rough", { faces: 1, edges: 0 })],
      { targetThickness: 4 },
    );
    const result = outputs[0];
    assert.ok(isBoard(result));
    assert.strictEqual(result.thickness, 4);
    assert.strictEqual(result.jointedFaces, 2);
    assert.strictEqual(result.surface, "smooth");
    assert.strictEqual(result.jointedEdges, 0);
  });

  it("takes stock at the cut height or one detent above, nothing thicker", () => {
    const requirement = plane.getInputMaterials({ targetThickness: 4 })[0];
    const atHeight = (thickness: 4 | 5 | 6) =>
      board("walnut", 8, 6, thickness, "rough", { faces: 1, edges: 0 });
    // Skim pass and full-depth bite
    assert.ok(materialMeetsInput(atHeight(4), requirement));
    assert.ok(materialMeetsInput(atHeight(5), requirement));
    // Two detents above won't fit under the cutter head
    assert.ok(!materialMeetsInput(atHeight(6), requirement));
  });

  it("removes one detent per pass — thicknessing is sequential passes", () => {
    // 8/4 down to 4/4: four passes, cranking the head down between each
    let stock = board("walnut", 8, 6, 8, "rough", { faces: 1, edges: 0 });
    for (const cutHeight of [7, 6, 5, 4]) {
      const requirement = plane.getInputMaterials({
        targetThickness: cutHeight,
      })[0];
      assert.ok(materialMeetsInput(stock, requirement));
      const result = plane.output([stock], { targetThickness: cutHeight })
        .outputs[0];
      assert.ok(isBoard(result));
      assert.strictEqual(result.thickness, cutHeight);
      stock = result;
    }
    assert.strictEqual(stock.thickness, 4);
    assert.strictEqual(stock.jointedFaces, 2);
    assert.strictEqual(stock.surface, "smooth");
  });

  it("at the top of the scale only a skim pass fits", () => {
    const requirement = plane.getInputMaterials({ targetThickness: 8 })[0];
    assert.ok(
      materialMeetsInput(
        board("walnut", 8, 6, 8, "rough", { faces: 1, edges: 0 }),
        requirement,
      ),
    );
  });
});

describe("table saw rip edge prerequisites", () => {
  it("refuses a rough edge against the fence", () => {
    const requirement = ripBoard.getInputMaterials({ targetWidth: 4 })[0];
    assert.ok(!materialMeetsInput(roughBoard(), requirement));
    assert.ok(
      materialMeetsInput(
        board("walnut", 8, 6, 4, "rough", { faces: 1, edges: 1 }),
        requirement,
      ),
    );
  });

  it("leaves the kept piece with two straight edges, the offcut as it was", () => {
    const input = board("walnut", 8, 6, 4, "rough", { faces: 2, edges: 1 });
    const { outputs } = ripBoard.output([input], { targetWidth: 4 });
    const [kept, offcut] = outputs;
    assert.ok(isBoard(kept) && isBoard(offcut));
    assert.strictEqual(kept.width, 4);
    assert.strictEqual(kept.jointedEdges, 2);
    // The offcut's far edge is untouched — it keeps the input's edge count
    assert.strictEqual(offcut.jointedEdges, 1);
    assert.strictEqual(kept.jointedFaces, 2);
  });
});

describe("glue-ups demand straight edges", () => {
  it("rejects smooth S2S stock until its edges are jointed and ripped", () => {
    const requirement = glueUp.inputMaterials[0];
    // Right size and surface, straight-from-the-lumberyard edges: no glue
    const s2sStrip = board("maple", 2, 2, 4, "smooth", { faces: 2, edges: 0 });
    assert.ok(!materialMeetsInput(s2sStrip, requirement));
    const rippedStrip = board("maple", 2, 2, 4, "smooth", {
      faces: 2,
      edges: 2,
    });
    assert.ok(materialMeetsInput(rippedStrip, requirement));
  });
});

describe("milling ladder integration", () => {
  it("mills rough stock plane-then-rip or rip-then-plane — both work", () => {
    // jointer x2 -> planer -> table saw
    let a = jointFace.output([roughBoard()]).outputs[0];
    assert.ok(isBoard(a));
    a = jointEdge.output([a]).outputs[0];
    assert.ok(isBoard(a));
    a = plane.output([a], { targetThickness: 4 }).outputs[0];
    assert.ok(isBoard(a));
    a = ripBoard.output([a], { targetWidth: 4 }).outputs[0];
    assert.ok(isBoard(a));
    assert.strictEqual(millingLabel(a), "S4S");

    // jointer x2 -> table saw -> planer
    let b = jointFace.output([roughBoard()]).outputs[0];
    assert.ok(isBoard(b));
    b = jointEdge.output([b]).outputs[0];
    assert.ok(isBoard(b));
    b = ripBoard.output([b], { targetWidth: 4 }).outputs[0];
    assert.ok(isBoard(b));
    b = plane.output([b], { targetThickness: 4 }).outputs[0];
    assert.ok(isBoard(b));
    assert.strictEqual(millingLabel(b), "S4S");
  });
});

describe("millingLabel", () => {
  it("names the classic lumber states", () => {
    const b = (faces: 0 | 1 | 2, edges: 0 | 1 | 2) =>
      board("maple", 8, 6, 4, "rough", { faces, edges });
    assert.strictEqual(millingLabel(b(2, 2)), "S4S");
    assert.strictEqual(millingLabel(b(2, 1)), "S3S");
    assert.strictEqual(millingLabel(b(2, 0)), "S2S");
    assert.strictEqual(millingLabel(b(0, 0)), "rough sawn");
    // The unremarkable default (pallet stock and legacy boards): no label
    assert.strictEqual(millingLabel(b(1, 2)), null);
  });
});

describe("lumber channels", () => {
  it("stocks Orange Box with ready-to-use wood from the start", () => {
    const atStart = unlockedLumberChannels(0, "orangeBox").map((c) => c.id);
    assert.deepStrictEqual(atStart, ["constructionLumber", "bigBoxRack"]);
    // Reputation never changes the big box's racks
    const later = unlockedLumberChannels(30, "orangeBox").map((c) => c.id);
    assert.deepStrictEqual(later, atStart);
  });

  it("hides the lumberyard's higher channels until reputation earns them", () => {
    assert.deepStrictEqual(unlockedLumberChannels(0, "lumberyard"), []);
    const atTwelve = unlockedLumberChannels(12, "lumberyard").map((c) => c.id);
    assert.deepStrictEqual(atTwelve, ["s2sRack"]);
    const all = unlockedLumberChannels(30, "lumberyard").map((c) => c.id);
    assert.deepStrictEqual(all, ["s2sRack", "roughRack"]);
  });

  it("keeps every unlock threshold reachable within the commission sequence", () => {
    // Commissions award 30 lifetime reputation; every channel must unlock
    for (const channel of LUMBER_CHANNELS) {
      assert.ok(
        channel.minReputation <= 30,
        `${channel.id} unlocks at ${channel.minReputation}`,
      );
    }
  });
});
