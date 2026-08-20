import { footprintCenter, Machine, machineKey } from "../Machine";
import { MaterialInstance } from "../Materials";
import { INCHES_PER_CELL } from "../shop-scale";
import { Direction, rotateVec, Vector, vectorKey } from "../Vectors";
import {
  BenchPlacement,
  benchPlacementFor,
  benchTopSizeIn,
} from "./bench-layout";

/**
 * Bench groups: worktables pushed together work as one bench.
 *
 * Shove two tables edge to edge in a real shop and you stop thinking of
 * them as two tables — you lay a long board across the seam and get on
 * with it. This module is that, and nothing more: it finds the connected
 * run of tables a bench belongs to and lays every member's top out in one
 * shared frame, so the bench view can work in group inches while each
 * piece's placement stays stored on the table it's actually lying on.
 *
 * Two properties keep this from spreading through the codebase:
 *
 * - **A lone bench is a group of one.** Its frame is exactly its own top,
 *   and every conversion below is the identity. Nothing needs to branch on
 *   "is this bench joined" — the makeshift workbench, which never joins,
 *   goes down the same path it always did.
 * - **Placements never move house.** `MachineState.benchLayout` still
 *   stores bench-top inches in the owning machine's own frame, so no save
 *   migration, and the shop view keeps drawing each table's stock from its
 *   own state. Only the view converts, and only while it's open.
 *
 * Tables may sit at any rotation relative to each other — pushed
 * shoulder to shoulder, or back to back into a deep island — so a
 * member's frame is rotated as well as offset, and a piece dragged across
 * a seam is re-measured into its new owner's frame (see
 * `placementOnMember`).
 */

/** An axis-aligned patch of bench top, in the group frame's inches. */
export interface BenchTopRect {
  /** Top-left corner. */
  readonly xIn: number;
  readonly yIn: number;
  readonly widthIn: number;
  readonly heightIn: number;
}

export interface BenchGroupMember {
  readonly machine: Machine;
  /** `machineKey` of the member, for keying maps and React lists. */
  readonly key: string;
  /** Where this member's top lies in the group frame. */
  readonly rect: BenchTopRect;
}

export interface BenchGroup {
  /** Every table in the run, in a stable order (back to front, left to
   * right) within the frame. */
  readonly members: ReadonlyArray<BenchGroupMember>;
  /** The frame: the bounding box of every member's top. Only for a lone
   * bench, or a perfectly rectangular run, is the frame all bench — an
   * L-shaped group leaves corners of frame that no member covers, which
   * is exactly what `seatInGroup` is for. */
  readonly widthIn: number;
  readonly heightIn: number;
  /**
   * Which way the frame faces: the rotation of the bench the player
   * walked up to. You lean over a bench square to *it*, not to the shop,
   * so the view is drawn in that bench's frame however it happens to be
   * turned on the floor — exactly as a lone bench has always been drawn.
   * Members turned differently (a table pushed on back to back) have
   * their placements turned into this frame.
   */
  readonly alignment: Direction;
  /** The frame's middle in shop inches — where the camera dives to. */
  readonly centerInShopIn: { readonly xIn: number; readonly yIn: number };
}

/**
 * A machine's bench top laid out in a frame facing `alignment`, still
 * axis-aligned: quarter turns keep a rectangle a rectangle, they only
 * swap its sides.
 */
function topRectInFrame(machine: Machine, alignment: Direction): BenchTopRect {
  const { widthIn, heightIn } = benchTopSizeIn(machine.type);
  const turned = (machine.rotation - alignment + 4) % 2 === 1;
  const spanX = turned ? heightIn : widthIn;
  const spanY = turned ? widthIn : heightIn;
  const [centerXIn, centerYIn] = rotateVec(
    topCenterInShop(machine),
    inverseOf(alignment),
  );
  return {
    xIn: centerXIn - spanX / 2,
    yIn: centerYIn - spanY / 2,
    widthIn: spanX,
    heightIn: spanY,
  };
}

/** The turn that undoes `rotation`. */
function inverseOf(rotation: Direction): Direction {
  return ((4 - rotation) % 4) as Direction;
}

/**
 * The middle of a machine's bench top in shop inches. The top is centered
 * on the footprint (`footprintCenter`, the same anchor the art mounts on),
 * and cell coordinates measure cell centers — hence the half cell.
 */
function topCenterInShop(machine: Machine): Vector {
  const [offsetX, offsetY] = rotateVec(
    footprintCenter(machine.type.cellsOccupied),
    machine.rotation,
  );
  return [
    (machine.position[0] + offsetX + 0.5) * INCHES_PER_CELL,
    (machine.position[1] + offsetY + 0.5) * INCHES_PER_CELL,
  ];
}

/** Whether two footprints share an edge — corners touching doesn't join
 * two tables any more than it does in a real shop. */
function footprintsTouch(a: Machine, b: Machine): boolean {
  const bCells = new Set(b.occupiedCells.map(vectorKey));
  return a.occupiedCells.some(([x, y]) =>
    [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ].some((cell) => bCells.has(vectorKey(cell as Vector))),
  );
}

/**
 * The run of tables this bench belongs to: itself, everything pushed
 * against it, everything pushed against those. Only worktables join —
 * the makeshift bench is plywood balanced on paint buckets at its own
 * height, so it is always a group of one, and so is a lone table.
 */
export function benchGroupAt(
  machines: ReadonlyArray<Machine>,
  bench: Machine,
): BenchGroup {
  // Always the machine as the shop has it now, never the caller's copy:
  // a Machine handed in from an earlier render still carries that
  // render's bays, and the run would report stale contents.
  const key = machineKey(bench.state);
  const joined: Machine[] = [
    machines.find((machine) => machineKey(machine.state) === key) ?? bench,
  ];
  if (bench.type.worktable) {
    const candidates = machines.filter(
      (machine) => machine.type.worktable && machineKey(machine.state) !== key,
    );
    // Breadth-first across the run, so a table three tables away still
    // joins as long as the chain of seams is unbroken
    for (let index = 0; index < joined.length; index++) {
      for (let next = candidates.length - 1; next >= 0; next--) {
        if (footprintsTouch(joined[index], candidates[next])) {
          joined.push(candidates[next]);
          candidates.splice(next, 1);
        }
      }
    }
  }

  const alignment = bench.rotation;
  const rects = joined.map((machine) => topRectInFrame(machine, alignment));
  const originXIn = Math.min(...rects.map((rect) => rect.xIn));
  const originYIn = Math.min(...rects.map((rect) => rect.yIn));
  const widthIn =
    Math.max(...rects.map((rect) => rect.xIn + rect.widthIn)) - originXIn;
  const heightIn =
    Math.max(...rects.map((rect) => rect.yIn + rect.heightIn)) - originYIn;

  const members = joined
    .map((machine, index) => ({
      machine,
      key: machineKey(machine.state),
      rect: {
        ...rects[index],
        xIn: rects[index].xIn - originXIn,
        yIn: rects[index].yIn - originYIn,
      },
    }))
    // Stable draw order within the frame, so pieces and the tool rail
    // don't shuffle as the run is re-derived each render
    .sort((a, b) => a.rect.yIn - b.rect.yIn || a.rect.xIn - b.rect.xIn);

  // The frame's middle, turned back out into shop inches for the camera
  const [centerXIn, centerYIn] = rotateVec(
    [originXIn + widthIn / 2, originYIn + heightIn / 2],
    alignment,
  );

  return {
    members,
    widthIn,
    heightIn,
    alignment,
    centerInShopIn: { xIn: centerXIn, yIn: centerYIn },
  };
}

/** The member holding this machine, or null if it isn't in the group. */
export function memberFor(
  group: BenchGroup,
  machine: Machine,
): BenchGroupMember | null {
  const key = machineKey(machine.state);
  return group.members.find((member) => member.key === key) ?? null;
}

/** The middle of a member's top, in frame inches. */
function rectCenter(rect: BenchTopRect): Vector {
  return [rect.xIn + rect.widthIn / 2, rect.yIn + rect.heightIn / 2];
}

/**
 * How far a member is turned relative to the frame. Placements store an
 * angle in the machine's own unrotated frame; the frame faces the opened
 * bench, so a member turned the same way (always, for a lone bench)
 * needs no turn at all, and only a table pushed on at an angle does. The
 * bench view turns that member's art by the same quarter turns.
 */
export function turnIntoFrame(
  member: BenchGroupMember,
  group: Pick<BenchGroup, "alignment">,
): Direction {
  return ((member.machine.rotation - group.alignment + 4) % 4) as Direction;
}

/** A stored placement, measured into the group's frame. */
export function placementInFrame(
  group: BenchGroup,
  member: BenchGroupMember,
  placement: BenchPlacement,
): BenchPlacement {
  const { widthIn, heightIn } = benchTopSizeIn(member.machine.type);
  const turn = turnIntoFrame(member, group);
  const [offsetXIn, offsetYIn] = rotateVec(
    [placement.xIn - widthIn / 2, placement.yIn - heightIn / 2],
    turn,
  );
  const [centerXIn, centerYIn] = rectCenter(member.rect);
  return {
    ...placement,
    xIn: centerXIn + offsetXIn,
    yIn: centerYIn + offsetYIn,
    angleDeg: placement.angleDeg - 90 * turn,
  };
}

/** The inverse: a frame placement measured back into a member's own top
 * inches, ready to store in that machine's `benchLayout`. */
export function placementOnMember(
  group: BenchGroup,
  member: BenchGroupMember,
  placement: BenchPlacement,
): BenchPlacement {
  const { widthIn, heightIn } = benchTopSizeIn(member.machine.type);
  const turn = turnIntoFrame(member, group);
  const [centerXIn, centerYIn] = rectCenter(member.rect);
  const [localXIn, localYIn] = rotateVec(
    [placement.xIn - centerXIn, placement.yIn - centerYIn],
    inverseOf(turn),
  );
  return {
    ...placement,
    xIn: widthIn / 2 + localXIn,
    yIn: heightIn / 2 + localYIn,
    angleDeg: placement.angleDeg + 90 * turn,
  };
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

/**
 * The nearest spot in the group where a piece is really on a bench — its
 * middle over some member's top — and which member that is.
 *
 * This is `seatOnBenchTop` widened from one rectangle to several, and it
 * only widens that cleanly because the rule is about a single point.
 * Asking whether a whole piece fits inside an L-shaped union of tops
 * would be a genuinely awkward clamp; asking whether its middle is over
 * any of them is the same one-liner run down a list. Overhang stays
 * fine — over the seam, over the far edge, over the notch in an L.
 */
export function seatInGroup(
  group: BenchGroup,
  placement: BenchPlacement,
): { placement: BenchPlacement; member: BenchGroupMember } {
  const over = group.members.find(
    (member) =>
      placement.xIn >= member.rect.xIn &&
      placement.xIn <= member.rect.xIn + member.rect.widthIn &&
      placement.yIn >= member.rect.yIn &&
      placement.yIn <= member.rect.yIn + member.rect.heightIn,
  );
  if (over) {
    return { placement, member: over };
  }

  let nearest = group.members[0];
  let nearestXIn = 0;
  let nearestYIn = 0;
  let nearestDistance = Infinity;
  for (const member of group.members) {
    const xIn = clamp(
      placement.xIn,
      member.rect.xIn,
      member.rect.xIn + member.rect.widthIn,
    );
    const yIn = clamp(
      placement.yIn,
      member.rect.yIn,
      member.rect.yIn + member.rect.heightIn,
    );
    const distance = (xIn - placement.xIn) ** 2 + (yIn - placement.yIn) ** 2;
    if (distance < nearestDistance) {
      nearest = member;
      nearestXIn = xIn;
      nearestYIn = yIn;
      nearestDistance = distance;
    }
  }
  return {
    placement: { ...placement, xIn: nearestXIn, yIn: nearestYIn },
    member: nearest,
  };
}

/** A piece lying somewhere on the group, with the member holding it. */
export interface GroupPiece {
  readonly material: MaterialInstance;
  readonly member: BenchGroupMember;
  /** Which bay of its owner it sits in — staged stock or finished work,
   * which the view draws in that order and E takes differently. */
  readonly bay: "input" | "output";
  /** Its placement in the group's frame — what the bench view draws. */
  readonly placement: BenchPlacement;
}

/**
 * Everything lying on the group's tops, in member order. A piece belongs
 * to exactly one member — whichever table it was last set down on — so
 * this is a concatenation, not a merge.
 */
export function groupPieces(group: BenchGroup): ReadonlyArray<GroupPiece> {
  return group.members.flatMap((member) =>
    [
      ...member.machine.inputMaterials.map((material) => ({
        material,
        bay: "input" as const,
      })),
      ...member.machine.outputMaterials.map((material) => ({
        material,
        bay: "output" as const,
      })),
    ].map(({ material, bay }) => ({
      material,
      member,
      bay,
      placement: placementInFrame(
        group,
        member,
        benchPlacementFor(member.machine, material),
      ),
    })),
  );
}
