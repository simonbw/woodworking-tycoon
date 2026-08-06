import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "../board-helpers";
import { MACHINE_TYPES, Machine, MachineId, MachineState } from "../Machine";
import { makePallet } from "../material-helpers";
import { Direction, Vector } from "../Vectors";
import {
  benchGroupAt,
  groupPieces,
  memberFor,
  placementInFrame,
  placementOnMember,
  seatInGroup,
} from "./bench-group";
import { BenchPlacement, defaultBenchPlacement } from "./bench-layout";

function bench(
  machineTypeId: MachineId,
  position: Vector,
  rotation: Direction = 0,
  overrides: Partial<MachineState> = {},
): Machine {
  return new Machine({
    machineTypeId,
    position,
    rotation,
    inputMaterials: [],
    processingMaterials: [],
    outputMaterials: [],
    selectedOperationId: "",
    selectedParameters: undefined,
    operationProgress: {
      status: "notStarted",
      phaseIndex: 0,
      ticksRemaining: 0,
    },
    tools: [],
    ...overrides,
  });
}

const flat = (xIn: number, yIn: number): BenchPlacement => ({
  xIn,
  yIn,
  angleDeg: 0,
  flipped: false,
});

describe("bench groups", () => {
  describe("finding the run", () => {
    it("makes a lone table a group of one, framed on its own top", () => {
      const table = bench("worktable1x2", [4, 4]);
      const group = benchGroupAt([table], table);
      assert.strictEqual(group.members.length, 1);
      assert.strictEqual(group.widthIn, 48);
      assert.strictEqual(group.heightIn, 24);
      // The frame IS the top, so the member fills it exactly
      assert.deepStrictEqual(group.members[0].rect, {
        xIn: 0,
        yIn: 0,
        widthIn: 48,
        heightIn: 24,
      });
    });

    it("joins two tables pushed shoulder to shoulder into one run", () => {
      // A 4-ft table at x=0..3 and another at x=4..7, same row
      const left = bench("worktable1x2", [0, 0]);
      const right = bench("worktable1x2", [4, 0]);
      const group = benchGroupAt([left, right], left);
      assert.strictEqual(group.members.length, 2);
      assert.strictEqual(group.widthIn, 96);
      assert.strictEqual(group.heightIn, 24);
      // Butted, not overlapping: the seam is a single line at 48"
      const [first, second] = group.members;
      assert.strictEqual(first.rect.xIn, 0);
      assert.strictEqual(second.rect.xIn, 48);
    });

    it("joins tables back to back into a deep island", () => {
      // Facing away from each other — the classic shove-them-together
      const front = bench("worktable1x2", [0, 2], 0);
      const back = bench("worktable1x2", [3, 1], 2);
      const group = benchGroupAt([front, back], front);
      assert.strictEqual(group.members.length, 2);
      assert.strictEqual(group.widthIn, 48);
      assert.strictEqual(group.heightIn, 48);
    });

    it("carries a chain of tables three deep", () => {
      const a = bench("worktable1x2", [0, 0]);
      const b = bench("worktable1x2", [4, 0]);
      const c = bench("worktable1x1", [8, 0]);
      // Opened from the far end, the whole run still comes along
      const group = benchGroupAt([a, b, c], c);
      assert.strictEqual(group.members.length, 3);
      assert.strictEqual(group.widthIn, 120);
    });

    it("leaves a table that only touches at the corner alone", () => {
      const table = bench("worktable1x2", [0, 0]);
      const diagonal = bench("worktable1x2", [4, 2]);
      const group = benchGroupAt([table, diagonal], table);
      assert.strictEqual(group.members.length, 1);
    });

    it("never joins the makeshift bench to a table it is touching", () => {
      // Plywood on paint buckets, at its own height — always alone
      // Butted right up against it: the bench spans x 1..4, the table 5..8
      const makeshift = bench("workspace", [2, 2]);
      const table = bench("worktable1x2", [5, 0]);
      assert.strictEqual(
        benchGroupAt([makeshift, table], makeshift).members.length,
        1,
      );
      assert.strictEqual(
        benchGroupAt([makeshift, table], table).members.length,
        1,
      );
    });

    it("orders members the same way whichever one was opened", () => {
      const left = bench("worktable1x2", [0, 0]);
      const right = bench("worktable1x2", [4, 0]);
      const fromLeft = benchGroupAt([left, right], left);
      const fromRight = benchGroupAt([left, right], right);
      assert.deepStrictEqual(
        fromLeft.members.map((member) => member.key),
        fromRight.members.map((member) => member.key),
      );
    });
  });

  describe("measuring placements into the frame", () => {
    it("leaves a lone unrotated bench's placements untouched", () => {
      const table = bench("worktable1x2", [4, 4]);
      const group = benchGroupAt([table], table);
      const member = memberFor(group, table)!;
      const placement = { xIn: 13, yIn: 7, angleDeg: 20, flipped: true };
      assert.deepStrictEqual(
        placementInFrame(group, member, placement),
        placement,
      );
    });

    it("offsets the far table's placements by the seam", () => {
      const left = bench("worktable1x2", [0, 0]);
      const right = bench("worktable1x2", [4, 0]);
      const group = benchGroupAt([left, right], left);
      const seat = flat(10, 12);
      assert.deepStrictEqual(
        placementInFrame(group, memberFor(group, left)!, seat),
        {
          ...seat,
          xIn: 10,
        },
      );
      assert.deepStrictEqual(
        placementInFrame(group, memberFor(group, right)!, seat),
        {
          ...seat,
          xIn: 58,
        },
      );
    });

    it("frames a lone bench the same way however it sits on the floor", () => {
      // You lean over a bench square to it: a table turned sideways in
      // the shop still reads 48 × 24 with its stock where it was left.
      const placement = { xIn: 13, yIn: 7, angleDeg: 20, flipped: true };
      for (const rotation of [0, 1, 2, 3] as Direction[]) {
        const table = bench("worktable1x2", [4, 4], rotation);
        const group = benchGroupAt([table], table);
        assert.strictEqual(group.widthIn, 48, `width at ${rotation}`);
        assert.strictEqual(group.heightIn, 24, `height at ${rotation}`);
        assert.deepStrictEqual(
          placementInFrame(group, memberFor(group, table)!, placement),
          placement,
        );
      }
    });

    it("turns a member pushed on at an angle into the frame", () => {
      // Opened from the front table, so the frame faces the way it does
      const front = bench("worktable1x2", [0, 2], 0);
      const back = bench("worktable1x2", [3, 1], 2);
      const group = benchGroupAt([front, back], front);
      // The back table is a half-turn off, so its own top's middle lands
      // in the middle of its patch of frame with a half-turn folded in
      assert.deepStrictEqual(
        placementInFrame(group, memberFor(group, back)!, flat(24, 12)),
        { xIn: 24, yIn: 12, angleDeg: -180, flipped: false },
      );
    });

    it("round-trips a placement back onto its member", () => {
      for (const rotation of [0, 1, 2, 3] as Direction[]) {
        const table = bench("worktable1x2", [3, 5], rotation);
        const group = benchGroupAt([table], table);
        const member = memberFor(group, table)!;
        const original = { xIn: 11, yIn: 19, angleDeg: 35, flipped: true };
        const back = placementOnMember(
          group,
          member,
          placementInFrame(group, member, original),
        );
        assert.ok(Math.abs(back.xIn - original.xIn) < 1e-9, `x at ${rotation}`);
        assert.ok(Math.abs(back.yIn - original.yIn) < 1e-9, `y at ${rotation}`);
        assert.strictEqual(back.angleDeg, original.angleDeg);
        assert.strictEqual(back.flipped, original.flipped);
      }
    });

    it("re-measures a piece handed across a seam between rotations", () => {
      const front = bench("worktable1x2", [0, 2], 0);
      const back = bench("worktable1x2", [3, 1], 2);
      const group = benchGroupAt([front, back], front);
      const frontMember = memberFor(group, front)!;
      const backMember = memberFor(group, back)!;
      // A spot on the front table, carried over to the back one: the
      // frame position is unchanged, the stored numbers are not
      const inFrame = placementInFrame(group, frontMember, flat(12, 6));
      const onBack = placementOnMember(group, backMember, inFrame);
      assert.deepStrictEqual(
        placementInFrame(group, backMember, onBack).xIn,
        inFrame.xIn,
      );
      assert.deepStrictEqual(
        placementInFrame(group, backMember, onBack).yIn,
        inFrame.yIn,
      );
      // Facing the other way, so the stored angle is a half turn off
      assert.strictEqual(onBack.angleDeg, 180);
    });
  });

  describe("seating across the run", () => {
    const left = bench("worktable1x2", [0, 0]);
    const right = bench("worktable1x2", [4, 0]);
    const group = benchGroupAt([left, right], left);

    it("leaves a piece over the seam alone, and names its table", () => {
      // Straddling the join at 48": still on the bench, and on the left
      const seated = seatInGroup(group, flat(47, 12));
      assert.deepStrictEqual(seated.placement, flat(47, 12));
      assert.strictEqual(seated.member.key, memberFor(group, left)!.key);
      // A hair past the seam and it belongs to the right-hand table
      assert.strictEqual(
        seatInGroup(group, flat(60, 12)).member.key,
        memberFor(group, right)!.key,
      );
    });

    it("stops at the far end of the whole run, not the first table", () => {
      // 96" of bench now, so 70" in is fine where it used to be clamped
      assert.deepStrictEqual(
        seatInGroup(group, flat(70, 12)).placement,
        flat(70, 12),
      );
      assert.strictEqual(seatInGroup(group, flat(200, 12)).placement.xIn, 96);
    });

    it("pulls a piece back onto the nearest top from outside", () => {
      const seated = seatInGroup(group, flat(80, 40));
      assert.strictEqual(seated.placement.xIn, 80);
      assert.strictEqual(seated.placement.yIn, 24);
      assert.strictEqual(seated.member.key, memberFor(group, right)!.key);
    });

    it("holds a lone bench to its own edges, overhang and all", () => {
      // The makeshift bench: 40 × 30 of plywood, never joined to anything
      const makeshift = bench("workspace", [2, 2]);
      const alone = benchGroupAt([makeshift], makeshift);
      // Hanging well off the front edge is fine — it's still on the bench
      const overhanging = { xIn: 20, yIn: 29, angleDeg: 90, flipped: false };
      assert.deepStrictEqual(
        seatInGroup(alone, overhanging).placement,
        overhanging,
      );
      // Shoved off the right and the front, and off the back and the left
      const far = seatInGroup(alone, flat(60, 40)).placement;
      assert.strictEqual(far.xIn, 40);
      assert.strictEqual(far.yIn, 30);
      const near = seatInGroup(alone, flat(-18, -4)).placement;
      assert.strictEqual(near.xIn, 0);
      assert.strictEqual(near.yIn, 0);
      // Stock too big for the top is held to exactly the same rule: a
      // 46 × 34 pallet outsizes it on both axes and still sits centered
      const pallet = makePallet();
      const seat = defaultBenchPlacement(MACHINE_TYPES.workspace, pallet);
      assert.deepStrictEqual(seatInGroup(alone, seat).placement, seat);
    });

    it("keeps a piece off the notch in an L-shaped run", () => {
      // A small table pushed against the back of a full-size one, turned
      // to face the other way so both keep their standing room — an L,
      // with a quarter of the frame that is not bench at all
      const long = bench("worktable1x2", [1, 4], 0);
      const stub = bench("worktable1x1", [2, 3], 2);
      const ell = benchGroupAt([long, stub], long);
      assert.strictEqual(ell.widthIn, 48);
      assert.strictEqual(ell.heightIn, 48);
      assert.deepStrictEqual(memberFor(ell, stub)!.rect, {
        xIn: 0,
        yIn: 0,
        widthIn: 24,
        heightIn: 24,
      });
      // Over the stub: fine, overhang and all.
      assert.deepStrictEqual(
        seatInGroup(ell, flat(12, 12)).placement,
        flat(12, 12),
      );
      // Over the empty quarter beside it: pulled back onto the nearer top.
      const off = seatInGroup(ell, flat(30, 4));
      assert.strictEqual(off.placement.xIn, 24);
      assert.strictEqual(off.placement.yIn, 4);
      assert.strictEqual(off.member.key, memberFor(ell, stub)!.key);
    });
  });

  it("hands a group's pieces over in frame coordinates", () => {
    const piece = board("pallet", 36, 4, 2);
    const left = bench("worktable1x2", [0, 0], 0, {
      inputMaterials: [piece],
      benchLayout: { [piece.id]: flat(10, 12) },
    });
    const right = bench("worktable1x2", [4, 0]);
    const group = benchGroupAt([left, right], right);
    const pieces = groupPieces(group);
    assert.strictEqual(pieces.length, 1);
    assert.strictEqual(pieces[0].material.id, piece.id);
    assert.strictEqual(pieces[0].placement.xIn, 10);
    assert.strictEqual(pieces[0].member.key, memberFor(group, left)!.key);
  });
});
