import assert from "node:assert";
import { describe, it } from "node:test";
import { board, isBoard } from "../board-helpers";
import { Machine, MachineState, Operation, ParameterValues } from "../Machine";
import {
  explainFeedRefusal,
  findFeedableOperation,
  liveSettingParameter,
  orientedOperations,
  stockOrientation,
} from "../machine-helpers";
import { availableOperations } from "../skill-helpers";
import { materialMeetsInput } from "../material-helpers";
import { initialGameState } from "../initialGameState";
import { STARTER_SKILLS } from "../Skill";
import { bandSaw } from "./bandSaw";
import { jobsiteTableSaw } from "./jobsiteTableSaw";

const resaw = bandSaw.operations.find((op) => op.id === "resaw") as Operation;
const bandSawRip = bandSaw.operations.find(
  (op) => op.id === "ripBoard",
) as Operation;
const resawOnTableSaw = jobsiteTableSaw.operations.find(
  (op) => op.id === "resawOnTableSaw",
) as Operation;

/** Before the Resawing skill: the saw only rips. */
const beforeResawing = initialGameState.progression;
/** After it: the saw can stand a board up. */
const afterResawing = {
  ...initialGameState.progression,
  unlockedSkills: [...STARTER_SKILLS, "resawing" as const],
};

/** 8/4 stock, milled flat and straight — the resaw's happy path. */
const blank = (thickness: 4 | 6 | 8 = 8, width: 4 | 6 | 8 = 6) =>
  board("walnut", 72, width, thickness, "rough", { faces: 2, edges: 2 });

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
      assert.strictEqual(piece.length, 72);
    }
  });

  it("only the fence-side piece keeps a flat face off a one-faced board", () => {
    const oneFaced = board("walnut", 72, 6, 8, "rough", { faces: 1, edges: 2 });
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
    const rough = board("walnut", 72, 6, 8, "rough", { faces: 0, edges: 0 });
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
    assert.strictEqual(fenceSide.length, 72);
  });

  it("takes a rough-edged board the table saw would refuse", () => {
    const roughEdged = board("walnut", 72, 6, 8, "rough", {
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
    const smooth = board("walnut", 72, 6, 8, "smooth", { faces: 2, edges: 2 });
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
    const roughEdged = board("walnut", 72, 6, 8, "rough", {
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

describe("table saw stock orientation", () => {
  it("resaws on a bare saw — no jig in the rack", () => {
    const bare = idleSaw("jobsiteTableSaw");
    const ids = bare.operations.map((op) => op.id);
    assert.ok(ids.includes("ripBoard"));
    assert.ok(ids.includes("resawOnTableSaw"));
    assert.deepStrictEqual(bare.state.tools, []);
  });

  it("rests flat, so the same blank rips by default", () => {
    const bare = idleSaw("jobsiteTableSaw");
    assert.strictEqual(stockOrientation(bare), "flat");
    const match = findFeedableOperation(bare, bare.operations, [blank()]);
    assert.strictEqual(match?.operation.id, "ripBoard");
  });

  it("resaws once R stands the stock up", () => {
    const bare = idleSaw("jobsiteTableSaw", [], {
      stockOrientation: "on edge",
    });
    const match = findFeedableOperation(bare, bare.operations, [blank()]);
    assert.strictEqual(match?.operation.id, "resawOnTableSaw");
  });

  it("keeps the two sleds' slots free", () => {
    assert.strictEqual(jobsiteTableSaw.toolSlots, 2);
  });
});

describe("R at the table saw", () => {
  it("turns the stock over once resawing is learned", () => {
    const bare = idleSaw("jobsiteTableSaw");
    const live = liveSettingParameter(bare, afterResawing, "rotate");
    assert.strictEqual(live?.parameter.id, "stockOrientation");
  });

  it("offers nothing to turn before then — the saw only rips", () => {
    const bare = idleSaw("jobsiteTableSaw");
    assert.strictEqual(
      liveSettingParameter(bare, beforeResawing, "rotate"),
      undefined,
    );
  });

  it("stays live standing on edge, so the stock can come back down", () => {
    const onEdge = idleSaw("jobsiteTableSaw", [], {
      stockOrientation: "on edge",
    });
    const live = liveSettingParameter(onEdge, afterResawing, "rotate");
    assert.strictEqual(live?.parameter.id, "stockOrientation");
  });

  it("reads flat for a player who can't resaw, whatever the bag says", () => {
    // A skill-filtered saw has nothing that wants a board on edge, so a
    // leftover setting stops meaning anything rather than stranding the
    // saw in a mode with no cut to run
    const onEdge = idleSaw("jobsiteTableSaw", [], {
      stockOrientation: "on edge",
    });
    const canRun = availableOperations(onEdge, beforeResawing);
    assert.strictEqual(stockOrientation(onEdge, canRun), "flat");
    const match = findFeedableOperation(
      onEdge,
      orientedOperations(onEdge, canRun),
      [blank()],
    );
    assert.strictEqual(match?.operation.id, "ripBoard");
  });
});
