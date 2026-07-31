import assert from "node:assert";
import { describe, it } from "node:test";
import { board, isBoard } from "../board-helpers";
import { Machine, MachineState, Operation, ParameterValues } from "../Machine";
import {
  explainFeedRefusal,
  findFeedableOperation,
  stockOrientation,
} from "../machine-helpers";
import { materialMeetsInput } from "../material-helpers";
import { resawFence } from "../tools/resawFence";
import { bandSaw } from "./bandSaw";
import { jobsiteTableSaw } from "./jobsiteTableSaw";

const resaw = bandSaw.operations.find((op) => op.id === "resaw") as Operation;
const bandSawRip = bandSaw.operations.find(
  (op) => op.id === "ripBoard",
) as Operation;
const resawOnTableSaw = resawFence.operations.find(
  (op) => op.id === "resawOnTableSaw",
) as Operation;

/** 8/4 stock, milled flat and straight — the resaw's happy path. */
const blank = (thickness: 4 | 6 | 8 = 8, width: 4 | 6 | 8 = 6) =>
  board("walnut", 6, width, thickness, "rough", { faces: 2, edges: 2 });

const idleSaw = (
  machineTypeId: MachineState["machineTypeId"],
  tools: MachineState["tools"] = [],
  selectedParameters?: ParameterValues,
) =>
  new Machine({
    machineTypeId,
    position: [0, 0],
    rotation: 0,
    selectedOperationId: "none",
    selectedParameters,
    operationProgress: {
      status: "notStarted",
      phaseIndex: 0,
      ticksRemaining: 0,
    },
    inputMaterials: [],
    processingMaterials: [],
    outputMaterials: [],
    tools,
  });

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

  it("takes stock with no flat face — the pieces just come away unreferenced", () => {
    const requirement = resaw.getInputMaterials({ targetThickness: 4 })[0];
    const rough = board("walnut", 6, 6, 8, "rough", { faces: 0, edges: 0 });
    assert.ok(materialMeetsInput(rough, requirement));
    const { outputs } = resaw.output([rough], { targetThickness: 4 });
    for (const piece of outputs) {
      assert.ok(isBoard(piece));
      assert.strictEqual(piece.jointedFaces, 0);
    }
  });

  it("refuses stock no thicker than the fence setting", () => {
    const requirement = resaw.getInputMaterials({ targetThickness: 4 })[0];
    assert.ok(!materialMeetsInput(blank(4), requirement));
    assert.ok(materialMeetsInput(blank(6), requirement));
  });
});

describe("band saw rip", () => {
  it("splits at the fence width, kerf-free", () => {
    const { outputs } = bandSawRip.output([blank()], { targetWidth: 4 });
    assert.deepStrictEqual(
      outputs.map((piece) => (isBoard(piece) ? piece.width : null)),
      [4, 2],
    );
  });

  it("leaves both fresh edges too rough to count as jointed", () => {
    const { outputs } = bandSawRip.output([blank()], { targetWidth: 4 });
    const [fenceSide, offcut] = outputs;
    assert.ok(isBoard(fenceSide) && isBoard(offcut));
    // Off milled stock each piece keeps only its untouched edge
    assert.strictEqual(fenceSide.jointedEdges, 1);
    assert.strictEqual(offcut.jointedEdges, 1);
    // Faces and length were never touched
    assert.strictEqual(fenceSide.jointedFaces, 2);
    assert.strictEqual(fenceSide.length, 6);
  });

  it("takes a rough-edged board the table saw would refuse", () => {
    const roughEdged = board("walnut", 6, 6, 8, "rough", {
      faces: 0,
      edges: 0,
    });
    const bandSawRequirement = bandSawRip.getInputMaterials({
      targetWidth: 4,
    })[0];
    assert.ok(materialMeetsInput(roughEdged, bandSawRequirement));

    const tableSawRip = jobsiteTableSaw.operations.find(
      (op) => op.id === "ripBoard",
    ) as Operation;
    const tableSawRequirement = tableSawRip.getInputMaterials({
      targetWidth: 4,
    })[0];
    assert.ok(!materialMeetsInput(roughEdged, tableSawRequirement));

    // And a board with no straight edge to begin with yields none either
    const { outputs } = bandSawRip.output([roughEdged], { targetWidth: 4 });
    for (const piece of outputs) {
      assert.ok(isBoard(piece));
      assert.strictEqual(piece.jointedEdges, 0);
    }
  });

  it("refuses stock no wider than the fence setting", () => {
    const requirement = bandSawRip.getInputMaterials({ targetWidth: 4 })[0];
    assert.ok(!materialMeetsInput(blank(8, 4), requirement));
    assert.ok(materialMeetsInput(blank(8, 6), requirement));
    assert.match(
      bandSawRip.explainRejection?.(blank(8, 4), { targetWidth: 4 }) ?? "",
      /no wider/,
    );
  });
});

describe("band saw stock orientation", () => {
  it("rests on edge, so the same blank resaws by default", () => {
    const saw = idleSaw("bandSaw");
    assert.strictEqual(stockOrientation(saw), "on edge");
    const match = findFeedableOperation(saw, saw.operations, [blank()]);
    assert.strictEqual(match?.operation.id, "resaw");
  });

  it("rips the blank once R lays it flat", () => {
    const saw = idleSaw("bandSaw", [], { stockOrientation: "flat" });
    const match = findFeedableOperation(saw, saw.operations, [blank()]);
    assert.strictEqual(match?.operation.id, "ripBoard");
  });

  it("teaches R when the stock would run the other way up", () => {
    // 4/4 stock can't resaw at a 4/4 fence, but it rips fine — the
    // refusal should blame the orientation, not the wood
    const saw = idleSaw("bandSaw");
    const refusal = explainFeedRefusal(saw, saw.operations, [blank(4)]);
    assert.match(refusal ?? "", /press R/);
    assert.match(refusal ?? "", /lay the stock flat/);
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
    assert.ok(
      outputs.every(
        (piece) => "surface" in piece && piece.surface === "smooth",
      ),
    );
    // ...but the blade can't improve what was rough to begin with
    const { outputs: fromRough } = resawOnTableSaw.output([blank()], {
      targetThickness: 4,
    });
    assert.ok(
      fromRough.every(
        (piece) => "surface" in piece && piece.surface === "rough",
      ),
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
  it("keeps ripping on the saw's list — orientation decides, not the rack", () => {
    const fenced = idleSaw("jobsiteTableSaw", ["resawFence"]);
    const ids = fenced.operations.map((op) => op.id);
    assert.ok(ids.includes("ripBoard"));
    assert.ok(ids.includes("resawOnTableSaw"));
  });

  it("stands the work on edge as soon as it's bolted on", () => {
    const fenced = idleSaw("jobsiteTableSaw", ["resawFence"]);
    assert.strictEqual(stockOrientation(fenced), "on edge");
    const match = findFeedableOperation(fenced, fenced.operations, [blank()]);
    assert.strictEqual(match?.operation.id, "resawOnTableSaw");
  });

  it("rips again once R lays the stock flat, fence still mounted", () => {
    const fenced = idleSaw("jobsiteTableSaw", ["resawFence"], {
      stockOrientation: "flat",
    });
    const match = findFeedableOperation(fenced, fenced.operations, [blank()]);
    assert.strictEqual(match?.operation.id, "ripBoard");
  });

  it("ignores a stale on-edge setting once the fence comes off", () => {
    // Unmounting removes the only operation that declares the
    // orientation, so the leftover bag value stops meaning anything and
    // the bare saw lies its work flat again
    const bare = idleSaw("jobsiteTableSaw", [], {
      stockOrientation: "on edge",
    });
    assert.strictEqual(stockOrientation(bare), "flat");
    const match = findFeedableOperation(bare, bare.operations, [blank()]);
    assert.strictEqual(match?.operation.id, "ripBoard");
  });

  it("mounts only on the table saw", () => {
    assert.deepStrictEqual(resawFence.compatibleMachines, [jobsiteTableSaw.id]);
  });
});
