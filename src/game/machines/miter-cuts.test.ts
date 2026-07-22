import assert from "node:assert";
import { describe, it } from "node:test";
import { board, isBoard, isMiteredFrameRail } from "../board-helpers";
import { MachineOperation, ParameterizedOperation } from "../Machine";
import {
  getMaterialName,
  materialMeetsInput,
  makeMaterial,
} from "../material-helpers";
import { getSellValue } from "../material-values";
import { Board, boardEnds, endsLabel, FinishedProduct } from "../Materials";
import { miterSaw } from "./miterSaw";
import { jobsiteTableSaw } from "./jobsiteTableSaw";
import { workspace } from "./workspace";

const cutBoardOp = miterSaw.operations.find(
  (op) => op.id === "cutBoard",
) as ParameterizedOperation;
const ripBoard = jobsiteTableSaw.operations.find(
  (op) => op.id === "ripBoard",
) as ParameterizedOperation;
const buildPictureFrame = workspace.operations.find(
  (op) => op.id === "buildPictureFrame",
) as MachineOperation;

const withEnds = (base: Board, ends: Board["ends"]): Board => ({
  ...base,
  ends,
});

const MITERED_45 = { kind: "mitered", angle: 45 } as const;
const SQUARE = { kind: "square" } as const;

describe("miter saw angle stops", () => {
  it("a 45° cut miters the kept piece's cut end and the offcut's facing end", () => {
    const { outputs } = cutBoardOp.output([board("oak", 8, 4, 4)], {
      angle: 45,
      cutEnd: "left",
      targetLength: 5,
    });
    const [kept, offcut] = outputs;
    assert.ok(isBoard(kept) && isBoard(offcut));
    assert.strictEqual(kept.length, 5);
    assert.deepStrictEqual(boardEnds(kept).left, MITERED_45);
    assert.deepStrictEqual(boardEnds(kept).right, SQUARE);
    assert.strictEqual(offcut.length, 3);
    assert.deepStrictEqual(boardEnds(offcut).right, MITERED_45);
    assert.deepStrictEqual(boardEnds(offcut).left, SQUARE);
  });

  it("cutEnd chooses which end of the kept piece gets the fresh face", () => {
    const { outputs } = cutBoardOp.output([board("oak", 8, 4, 4)], {
      angle: 30,
      cutEnd: "right",
      targetLength: 6,
    });
    const [kept, offcut] = outputs;
    assert.ok(isBoard(kept) && isBoard(offcut));
    assert.deepStrictEqual(boardEnds(kept).right, {
      kind: "mitered",
      angle: 30,
    });
    assert.deepStrictEqual(boardEnds(kept).left, SQUARE);
    assert.deepStrictEqual(boardEnds(offcut).left, {
      kind: "mitered",
      angle: 30,
    });
  });

  it("a square crosscut squares the end it cuts and keeps the far end's miter", () => {
    const mitered = withEnds(board("oak", 6, 4, 4), {
      left: MITERED_45,
      right: MITERED_45,
    });
    const { outputs } = cutBoardOp.output([mitered], {
      angle: 0,
      cutEnd: "left",
      targetLength: 4,
    });
    const kept = outputs[0];
    assert.ok(isBoard(kept));
    assert.deepStrictEqual(boardEnds(kept).left, SQUARE);
    assert.deepStrictEqual(boardEnds(kept).right, MITERED_45);
  });

  it("pre-angle-stop saves cut square on the left, as the saw always did", () => {
    const { outputs } = cutBoardOp.output([board("pallet", 3, 4, 1)], {
      targetLength: 2,
    });
    const kept = outputs[0];
    assert.ok(isBoard(kept));
    assert.deepStrictEqual(boardEnds(kept), { left: SQUARE, right: SQUARE });
  });

  it("a frame rail takes both stops: +45 one end, -45 the other", () => {
    const first = cutBoardOp.output([board("walnut", 8, 1, 1, "sanded")], {
      angle: 45,
      cutEnd: "left",
      targetLength: 4,
    });
    const halfDone = first.outputs[0];
    assert.ok(isBoard(halfDone));
    // Swing the head the other way for the mirrored end
    const second = cutBoardOp.output([halfDone], {
      angle: -45,
      cutEnd: "right",
      targetLength: 2,
    });
    const rail = second.outputs[0];
    assert.ok(isBoard(rail));
    assert.strictEqual(rail.length, 2);
    assert.ok(isMiteredFrameRail(rail, 45));
  });

  it("the same stop twice makes parallel ends, not a rail", () => {
    const first = cutBoardOp.output([board("walnut", 8, 1, 1, "sanded")], {
      angle: 45,
      cutEnd: "left",
      targetLength: 4,
    });
    const halfDone = first.outputs[0];
    assert.ok(isBoard(halfDone));
    // Head never moves: both end lines are parallel — a parallelogram
    const second = cutBoardOp.output([halfDone], {
      angle: 45,
      cutEnd: "right",
      targetLength: 2,
    });
    const skewed = second.outputs[0];
    assert.ok(isBoard(skewed));
    assert.deepStrictEqual(boardEnds(skewed).left, MITERED_45);
    assert.deepStrictEqual(boardEnds(skewed).right, MITERED_45);
    assert.ok(!isMiteredFrameRail(skewed, 45));
  });

  it("a negative stop records the signed angle on both fresh ends", () => {
    const { outputs } = cutBoardOp.output([board("oak", 8, 4, 4)], {
      angle: -30,
      cutEnd: "left",
      targetLength: 5,
    });
    const [kept, offcut] = outputs;
    assert.ok(isBoard(kept) && isBoard(offcut));
    // Both pieces share the cut line, so both record -30
    assert.deepStrictEqual(boardEnds(kept).left, {
      kind: "mitered",
      angle: -30,
    });
    assert.deepStrictEqual(boardEnds(offcut).right, {
      kind: "mitered",
      angle: -30,
    });
  });

  it("ripping runs along the board, so both pieces keep their ends", () => {
    const mitered = withEnds(board("oak", 4, 4, 4, "smooth"), {
      left: MITERED_45,
      right: SQUARE,
    });
    const { outputs } = ripBoard.output([mitered], { targetWidth: 2 });
    for (const piece of outputs) {
      assert.ok(isBoard(piece));
      assert.deepStrictEqual(boardEnds(piece).left, MITERED_45);
      assert.deepStrictEqual(boardEnds(piece).right, SQUARE);
    }
  });
});

describe("end labels", () => {
  const MITERED_NEG_45 = { kind: "mitered", angle: -45 } as const;

  it("names mitered ends like a cut list", () => {
    const base = board("oak", 2, 1, 1, "sanded");
    assert.strictEqual(endsLabel(base), null);
    assert.strictEqual(
      endsLabel(withEnds(base, { left: MITERED_45, right: SQUARE })),
      "45° one end",
    );
    // Sign alone is meaningless on a lone end — the magnitude labels it
    assert.strictEqual(
      endsLabel(withEnds(base, { left: SQUARE, right: MITERED_NEG_45 })),
      "45° one end",
    );
    // Mirrored ends are the frame-rail pair; equal-signed are parallel
    assert.strictEqual(
      endsLabel(withEnds(base, { left: MITERED_NEG_45, right: MITERED_45 })),
      "45° both ends",
    );
    assert.strictEqual(
      endsLabel(withEnds(base, { left: MITERED_45, right: MITERED_45 })),
      "45° parallel ends",
    );
    assert.match(
      getMaterialName(
        withEnds(base, { left: MITERED_NEG_45, right: MITERED_45 }),
      ),
      /45° both ends/,
    );
  });
});

describe("picture frame", () => {
  const MIRRORED_45 = {
    left: { kind: "mitered", angle: -45 },
    right: { kind: "mitered", angle: 45 },
  } as const;
  const rail = () => withEnds(board("walnut", 2, 1, 1, "sanded"), MIRRORED_45);

  it("takes only true rails: 45° ends mirrored so the corners close", () => {
    const requirement = buildPictureFrame.inputMaterials[0];
    assert.ok(materialMeetsInput(rail(), requirement));
    // Either flip of the rail counts — flipping the board over negates
    // both ends at once
    assert.ok(
      materialMeetsInput(
        withEnds(board("walnut", 2, 1, 1, "sanded"), {
          left: { kind: "mitered", angle: 45 },
          right: { kind: "mitered", angle: -45 },
        }),
        requirement,
      ),
    );
    // A square-ended board of the right size is not a rail
    assert.ok(
      !materialMeetsInput(board("walnut", 2, 1, 1, "sanded"), requirement),
    );
    // A parallelogram has two 45° ends and still can't close a corner
    assert.ok(
      !materialMeetsInput(
        withEnds(board("walnut", 2, 1, 1, "sanded"), {
          left: MITERED_45,
          right: MITERED_45,
        }),
        requirement,
      ),
    );
    // Neither is one mitered at the wrong stop
    assert.ok(
      !materialMeetsInput(
        withEnds(board("walnut", 2, 1, 1, "sanded"), {
          left: { kind: "mitered", angle: -30 },
          right: { kind: "mitered", angle: 30 },
        }),
        requirement,
      ),
    );
    // Pallet wood stays out of fine work
    assert.ok(
      !materialMeetsInput(
        withEnds(board("pallet", 2, 1, 1, "sanded"), MIRRORED_45),
        requirement,
      ),
    );
  });

  it("four rails and four nails become a frame of the rails' species", () => {
    assert.deepStrictEqual(buildPictureFrame.requiredConsumables, [
      { id: "nails", amount: 4 },
    ]);
    const { outputs } = buildPictureFrame.output([
      rail(),
      rail(),
      rail(),
      rail(),
    ]);
    assert.strictEqual(outputs.length, 1);
    const frame = outputs[0];
    assert.strictEqual(frame.type, "pictureFrame");
    assert.strictEqual((frame as FinishedProduct).species, "walnut");
  });

  it("prices between the shelf and the striped board, scaled by species", () => {
    const frame = makeMaterial<FinishedProduct>({
      type: "pictureFrame",
      species: "walnut",
    });
    assert.strictEqual(getSellValue(frame), 55 * 5);
  });
});
