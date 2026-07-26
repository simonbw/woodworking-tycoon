import assert from "node:assert";
import { describe, it } from "node:test";
import { board, isBoard } from "../board-helpers";
import { Machine, Operation } from "../Machine";
import { materialMeetsInput } from "../material-helpers";
import { resawFence } from "../tools/resawFence";
import { bandSaw } from "./bandSaw";
import { jobsiteTableSaw } from "./jobsiteTableSaw";

const resaw = bandSaw.operations.find((op) => op.id === "resaw") as Operation;
const resawOnTableSaw = resawFence.operations.find(
  (op) => op.id === "resawOnTableSaw",
) as Operation;

/** 8/4 stock, milled flat and straight — the resaw's happy path. */
const blank = (thickness: 4 | 6 | 8 = 8, width: 4 | 6 | 8 = 6) =>
  board("walnut", 6, width, thickness, "rough", { faces: 2, edges: 2 });

describe("band saw resaw", () => {
  it("splits a blank in two at the fence setting, kerf-free", () => {
    const { outputs } = resaw.output([blank()], { targetThickness: 4 });
    assert.strictEqual(outputs.length, 2);
    assert.deepStrictEqual(
      outputs.map((piece) => (isBoard(piece) ? piece.thickness : null)),
      [4, 4],
    );
  });

  it("leaves both pieces one-face-jointed, with a rough sawn face", () => {
    const { outputs } = resaw.output([blank()], { targetThickness: 4 });
    for (const piece of outputs) {
      assert.ok(isBoard(piece));
      assert.strictEqual(piece.jointedFaces, 1);
      assert.strictEqual(piece.surface, "rough");
      // Nothing touched the edges or the length
      assert.strictEqual(piece.jointedEdges, 2);
      assert.strictEqual(piece.width, 6);
      assert.strictEqual(piece.length, 6);
    }
  });

  it("only the fence-side piece keeps a flat face off a one-faced board", () => {
    const oneFaced = board("walnut", 6, 6, 8, "rough", { faces: 1, edges: 2 });
    const { outputs } = resaw.output([oneFaced], { targetThickness: 4 });
    const [fenceSide, offcut] = outputs;
    assert.ok(isBoard(fenceSide) && isBoard(offcut));
    assert.strictEqual(fenceSide.jointedFaces, 1);
    assert.strictEqual(offcut.jointedFaces, 0);
  });

  it("gives both halves their own identity", () => {
    const { outputs } = resaw.output([blank()], { targetThickness: 4 });
    assert.notStrictEqual(outputs[0].id, outputs[1].id);
  });

  it("refuses stock with no flat reference face", () => {
    const requirement = resaw.getInputMaterials({ targetThickness: 4 })[0];
    const rough = board("walnut", 6, 6, 8, "rough", { faces: 0, edges: 0 });
    assert.ok(!materialMeetsInput(rough, requirement));
    assert.match(
      resaw.explainRejection?.(rough, { targetThickness: 4 }) ?? "",
      /flat reference face/,
    );
  });

  it("refuses stock no thicker than the fence setting", () => {
    const requirement = resaw.getInputMaterials({ targetThickness: 4 })[0];
    assert.ok(!materialMeetsInput(blank(4), requirement));
    assert.ok(materialMeetsInput(blank(6), requirement));
  });
});

describe("table saw resaw", () => {
  it("loses a kerf detent the band saw doesn't", () => {
    const { outputs } = resawOnTableSaw.output([blank()], {
      targetThickness: 4,
    });
    assert.deepStrictEqual(
      outputs.map((piece) => (isBoard(piece) ? piece.thickness : null)),
      [4, 3],
    );
  });

  it("leaves a cleaner face: smooth stock stays smooth", () => {
    const smooth = board("walnut", 6, 6, 8, "smooth", { faces: 2, edges: 2 });
    const { outputs } = resawOnTableSaw.output([smooth], {
      targetThickness: 4,
    });
    assert.ok(outputs.every((piece) => "surface" in piece && piece.surface === "smooth"));
    // ...but the blade can't improve what was rough to begin with
    const { outputs: fromRough } = resawOnTableSaw.output([blank()], {
      targetThickness: 4,
    });
    assert.ok(
      fromRough.every((piece) => "surface" in piece && piece.surface === "rough"),
    );
  });

  it("needs a straight edge to stand on, as well as a flat face", () => {
    const requirement = resawOnTableSaw.getInputMaterials({
      targetThickness: 4,
    })[0];
    const roughEdged = board("walnut", 6, 6, 8, "rough", {
      faces: 2,
      edges: 0,
    });
    assert.ok(!materialMeetsInput(roughEdged, requirement));
    assert.match(
      resawOnTableSaw.explainRejection?.(roughEdged) ?? "",
      /rough edge/,
    );
  });

  it("caps out at what two blade-height passes can reach", () => {
    const requirement = resawOnTableSaw.getInputMaterials({
      targetThickness: 4,
    })[0];
    assert.ok(materialMeetsInput(blank(8, 6), requirement));
    assert.ok(!materialMeetsInput(blank(8, 8), requirement));
    assert.match(
      resawOnTableSaw.explainRejection?.(blank(8, 8), { targetThickness: 4 }) ??
        "",
      /band saw cut/,
    );
  });

  it("refuses stock too thin to give two pieces after the kerf", () => {
    const requirement = resawOnTableSaw.getInputMaterials({
      targetThickness: 4,
    })[0];
    // 5/4 would leave the fence piece and sawdust; 6/4 leaves a 1/4 offcut
    assert.ok(!materialMeetsInput(blank(4), requirement));
    assert.ok(materialMeetsInput(blank(6), requirement));
  });
});

describe("mounting the tall fence", () => {
  const sawAt = (tools: string[]) =>
    new Machine({
      machineTypeId: "jobsiteTableSaw",
      position: [0, 0],
      rotation: 0,
      selectedOperationId: "ripBoard",
      operationProgress: {
        status: "notStarted",
        phaseIndex: 0,
        ticksRemaining: 0,
      },
      inputMaterials: [],
      processingMaterials: [],
      outputMaterials: [],
      tools: tools as never,
    });

  it("takes ripping off the saw while it's bolted on", () => {
    const bare = sawAt([]).operations.map((op) => op.id);
    assert.ok(bare.includes("ripBoard"));

    const fenced = sawAt(["resawFence"]).operations.map((op) => op.id);
    assert.ok(!fenced.includes("ripBoard"));
    assert.ok(fenced.includes("resawOnTableSaw"));
  });

  it("gives the rip back when it comes off", () => {
    assert.ok(
      sawAt(["resawFence"])
        .operations.map((op) => op.id)
        .includes("resawOnTableSaw"),
    );
    assert.ok(
      sawAt(["crosscutSled"])
        .operations.map((op) => op.id)
        .includes("ripBoard"),
    );
  });

  it("mounts only on the table saw", () => {
    assert.deepStrictEqual(resawFence.compatibleMachines, [
      jobsiteTableSaw.id,
    ]);
  });
});
