import { array } from "../../utils/arrayUtils";
import { InputMaterialWithQuantity } from "../Machine";
import { ConsumableAmount, ConsumableId } from "../Consumable";
import type { ToolId } from "../Tool";
import {
  AssembledPart,
  Board,
  BoardDimension,
  BoardEnd,
  BoardEnds,
  FinishedProduct,
  FinishedProductType,
  JIG_GRADE_KINDS,
  MaterialInstance,
  Panel,
  panelWidth,
  RACK_GRADE_KINDS,
  REAL_WOOD_SPECIES,
  SHOP_FURNITURE_KINDS,
  SignedMiterAngle,
  Species,
} from "../Materials";
import {
  hasOneMiteredEnd,
  isBoard,
  isMiteredFrameRail,
} from "../board-helpers";
import { makeMaterial, materialMeetsInput } from "../material-helpers";
import { isPanel } from "../panel-helpers";
import {
  PALLET_BOARD_LENGTH_IN,
  PALLET_BOARD_THICKNESS_Q,
  PALLET_BOARD_WIDTH_IN,
} from "./pallet-geometry";

/**
 * Product blueprints: the single authored artifact behind an assembled
 * product. Pallet dismantling proved the pattern — a product visibly
 * made of its parts, one nail per crossing, one sprite composing real
 * board sprites at every zoom — and assembly is that machinery run
 * forward: a blueprint says where every part lies and where every
 * fastener goes, the player lays real staged parts onto ghost slots and
 * drives one fastener per crossing. Every assembly in the game is a
 * blueprint build (`interaction.blueprint` is required), products and
 * shop equipment alike — an equipment blueprint's commit grants the
 * machine/upgrade/jig instead of leaving a product.
 *
 * One blueprint is four things that previously could drift apart:
 * the recipe's input list (blueprintInputs), its fastener cost
 * (blueprintFastenerCost), the finished product's rendering
 * (AssembledProductSprite draws the slots' actual parts, grain and all),
 * and the bench view's assembly script (ghost outlines at the slots,
 * nails driven at the fasteners).
 *
 * The settled rules, for anyone authoring a new blueprint:
 *
 *  - Fasteners are derived (deriveFasteners), never hand-set: one per
 *    overlap of two parts on adjacent layers, each joining exactly two
 *    parts. (A hand-override escape hatch can come when a real
 *    product's pattern isn't "every crossing".)
 *  - Products carry their bill of materials: FinishedProduct.parts
 *    records the very boards that went in — the grain the player laid
 *    on the bench is the grain in the finished piece everywhere it
 *    draws. Older saves render the blueprint's nominal stock
 *    (defaultPartsFor). Blueprint-assembled products never get flat
 *    art.
 *  - Seating is derived, not stored: a part is "seated" when its
 *    persistent bench placement lies on its slot, so a refresh
 *    mid-assembly finds every part as placed. Only driven-but-
 *    uncommitted fasteners are ephemeral — assembly only spends, so it
 *    commits whole; the last fastener resolves start + finish back to
 *    back. A part a driven fastener holds won't drag, turn, or leave
 *    the bench until the build commits.
 *  - The ghost frame is the product's default seat: the assembled
 *    sprite appears exactly where the parts were lying — nothing moves
 *    at the moment the boards become one piece.
 *  - A fastener-less blueprint (the material shelf) commits when its
 *    last part is laid on.
 */

/** One part's place in the finished product. */
export interface BlueprintSlot {
  /** Stable id, `role-index` — recorded on the product's parts. */
  readonly id: string;
  /** What the part is in prose: "rail", "shelf". */
  readonly role: string;
  /** What stock fills the slot — the same matcher recipes already use.
   * Usually a board; a jig's base or a worktable's top is a sheet good
   * (typed as board stock for the consumers that read board fields —
   * matching goes through materialMeetsInput either way). */
  readonly requirement: InputMaterialWithQuantity<Board>;
  /** The part's nominal dims, for ghosts, overlap math, and stand-in
   * parts on products from older saves (Board units). */
  readonly part: {
    readonly widthIn: number;
    readonly lengthIn: number;
    readonly thicknessQ: number;
    /** The end treatments the part shows lying in this slot, signed the
     * way the finished piece needs them — a frame rail's long edge must
     * face the frame's outside for the corners to close. A consumed
     * board whose ends are the flip of these is turned over on the way
     * in (flipping a board negates both ends at once and costs nothing),
     * and stand-in parts for older saves synthesize exactly these. */
    readonly ends?: BoardEnds;
  };
  /** Part center in product inches from the product's top-left corner. */
  readonly xIn: number;
  readonly yIn: number;
  /** Degrees turned from vertical (length running down). Multiples of
   * 90 only — fastener derivation depends on axis-aligned footprints. */
  readonly angleDeg: number;
  /** Stacking order: fasteners join a part to one on the next layer. */
  readonly layer: number;
  /** The part stands on its long edge — a rail or joist — so its
   * footprint is its thickness, not its width, and the bench only seats
   * a piece that has been tipped up to match (F in the bench view). */
  readonly onEdge?: boolean;
  /** The part stands on its end — a table leg against the face-down
   * top — so its footprint is its bare cross-section (width across,
   * thickness deep), and only a piece stood on end (F twice) seats. */
  readonly onEnd?: boolean;
}

/** One fastener, at the overlap of exactly two parts — like a pallet
 * nail, it joins those two and nothing else. */
export interface BlueprintFastener {
  readonly xIn: number;
  readonly yIn: number;
  /** The slots this fastener joins: [lower layer, upper layer]. */
  readonly joins: readonly [string, string];
}

/**
 * Blueprints for shop equipment — builds whose commit grants a machine,
 * an upgrade, or a jig (OperationOutput.machineOutputs and friends)
 * instead of leaving a product on the bench. They assemble on the scene
 * exactly like product blueprints; they just never become a material.
 */
export type EquipmentBlueprintId =
  | "worktable1x1"
  | "worktable1x2"
  | "worktable1x3"
  | "worktable2x2"
  | "storageRack"
  | "toolDrawers"
  | "materialShelf"
  | "crosscutSled"
  | "straightLineSled"
  | "resawFence";

export type BlueprintId = FinishedProductType | EquipmentBlueprintId;

export interface ProductBlueprint {
  /** Registry key; for product blueprints it equals the product type. */
  readonly id: BlueprintId;
  /** The material the build becomes — absent for shop equipment, whose
   * commit grants machines or upgrades instead. */
  readonly productType?: FinishedProductType;
  /** Product footprint, in inches (drawn lying flat, like on the bench). */
  readonly widthIn: number;
  readonly heightIn: number;
  readonly slots: ReadonlyArray<BlueprintSlot>;
  /** Derived: one per adjacent-layer overlap, in slot-pair order. */
  readonly fasteners: ReadonlyArray<BlueprintFastener>;
  readonly fastenerConsumable: ConsumableId;
}

/** The footprint a slot's part presents, in inches: width across when it
 * lies flat, thickness across when it stands on edge. */
export function slotFaceWidthIn(slot: BlueprintSlot): number {
  return slot.onEdge ? slot.part.thicknessQ / 4 : slot.part.widthIn;
}

/** A slot part's local footprint before the slot's turn: across the
 * part, then along its length — which for a part stood on end is just
 * its cross-section (there is no length on the bench). */
export function slotFootprintIn(slot: BlueprintSlot): {
  wIn: number;
  hIn: number;
} {
  return slot.onEnd
    ? { wIn: slot.part.widthIn, hIn: slot.part.thicknessQ / 4 }
    : { wIn: slotFaceWidthIn(slot), hIn: slot.part.lengthIn };
}

/** A slot's axis-aligned footprint in product inches. */
export function slotExtent(slot: BlueprintSlot): {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
} {
  const { wIn, hIn } = slotFootprintIn(slot);
  const across = slot.angleDeg % 180 !== 0;
  const w = across ? hIn : wIn;
  const h = across ? wIn : hIn;
  return {
    x0: slot.xIn - w / 2,
    y0: slot.yIn - h / 2,
    x1: slot.xIn + w / 2,
    y1: slot.yIn + h / 2,
  };
}

/** Two overlapping rects on adjacent layers get fasteners at the
 * overlap — enough bite to matter, so grazing corners don't. */
const MIN_OVERLAP_IN = 1;

/**
 * How far apart fasteners sit along a long joint. A crossing (a slat
 * over a rail) is smaller than this in both directions and gets exactly
 * one fastener at its center, the way a pallet does; a long parallel
 * seam — a cleat under a shelf, an apron along a table top — takes a
 * row of them, because one screw in a four-foot joint holds nothing.
 * A big two-dimensional lap (a doubled sheet top) takes a grid.
 */
const FASTENER_SPACING_IN = 16;

/** Fastener positions along one axis of an overlap: evenly spaced,
 * centered, one per FASTENER_SPACING_IN (rounded), never fewer than 1. */
function fastenerRun(from: number, to: number): ReadonlyArray<number> {
  const span = to - from;
  const count = Math.max(1, Math.round(span / FASTENER_SPACING_IN));
  return array(count).map((_, i) => from + (span * (i + 0.5)) / count);
}

/** A slot part's rect corners in product inches, honoring its turn. */
function slotCorners(slot: BlueprintSlot): ReadonlyArray<Point> {
  const { wIn, hIn } = slotFootprintIn(slot);
  const rad = (slot.angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return [
    [-wIn / 2, -hIn / 2],
    [wIn / 2, -hIn / 2],
    [wIn / 2, hIn / 2],
    [-wIn / 2, hIn / 2],
  ].map(([dx, dy]) => ({
    x: slot.xIn + dx * cos - dy * sin,
    y: slot.yIn + dx * sin + dy * cos,
  }));
}

interface Point {
  readonly x: number;
  readonly y: number;
}

/** Sutherland–Hodgman: the subject polygon clipped to a convex clip. */
function clipPolygon(
  subject: ReadonlyArray<Point>,
  clip: ReadonlyArray<Point>,
): ReadonlyArray<Point> {
  let output = [...subject];
  for (let i = 0; i < clip.length && output.length > 0; i++) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    const input = output;
    output = [];
    const side = (p: Point) =>
      (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    for (let j = 0; j < input.length; j++) {
      const current = input[j];
      const previous = input[(j + input.length - 1) % input.length];
      const currentIn = side(current) >= 0;
      const previousIn = side(previous) >= 0;
      if (currentIn !== previousIn) {
        const t = side(previous) / (side(previous) - side(current));
        output.push({
          x: previous.x + (current.x - previous.x) * t,
          y: previous.y + (current.y - previous.y) * t,
        });
      }
      if (currentIn) output.push(current);
    }
  }
  return output;
}

function polygonArea(poly: ReadonlyArray<Point>): number {
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

function polygonCentroid(poly: ReadonlyArray<Point>): Point {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const cross = a.x * b.y - b.x * a.y;
    area += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  return { x: cx / (3 * area), y: cy / (3 * area) };
}

/** The short side of a slot's footprint — the bite-limiting dimension. */
function slotShortSideIn(slot: BlueprintSlot): number {
  const { wIn, hIn } = slotFootprintIn(slot);
  return Math.min(wIn, hIn);
}

function deriveFasteners(
  slots: ReadonlyArray<BlueprintSlot>,
): ReadonlyArray<BlueprintFastener> {
  const fasteners: BlueprintFastener[] = [];
  for (const lower of slots) {
    for (const upper of slots) {
      if (upper.layer !== lower.layer + 1) continue;
      // A pair with a turned member (the hex frame's rails) laps in a
      // skewed polygon, not an axis-aligned box: clip the two rects
      // against each other and put one fastener at the lap's centroid.
      // The bite bar carries over from the square rule — the product of
      // the per-axis requirements, relaxed a step further because an
      // angled lap spreads the same bite over a slanted seam.
      if (lower.angleDeg % 90 !== 0 || upper.angleDeg % 90 !== 0) {
        const lap = clipPolygon(slotCorners(lower), slotCorners(upper));
        if (lap.length < 3) continue;
        const needArea =
          Math.min(MIN_OVERLAP_IN, 0.75 * slotShortSideIn(lower)) *
          Math.min(MIN_OVERLAP_IN, 0.75 * slotShortSideIn(upper)) *
          0.75;
        if (polygonArea(lap) < needArea) continue;
        const at = polygonCentroid(lap);
        fasteners.push({ xIn: at.x, yIn: at.y, joins: [lower.id, upper.id] });
        continue;
      }
      const a = slotExtent(lower);
      const b = slotExtent(upper);
      const x0 = Math.max(a.x0, b.x0);
      const y0 = Math.max(a.y0, b.y0);
      const x1 = Math.min(a.x1, b.x1);
      const y1 = Math.min(a.y1, b.y1);
      // The bite required per axis relaxes for thin parts: a pallet slat
      // crossing a rail stood on edge covers the rail's whole 3/4"
      // thickness, and full contact is all the bite there is to have.
      const needX = Math.min(
        MIN_OVERLAP_IN,
        0.75 * Math.min(a.x1 - a.x0, b.x1 - b.x0),
      );
      const needY = Math.min(
        MIN_OVERLAP_IN,
        0.75 * Math.min(a.y1 - a.y0, b.y1 - b.y0),
      );
      if (x1 - x0 < needX || y1 - y0 < needY) continue;
      for (const xIn of fastenerRun(x0, x1)) {
        for (const yIn of fastenerRun(y0, y1)) {
          fasteners.push({ xIn, yIn, joins: [lower.id, upper.id] });
        }
      }
    }
  }
  return fasteners;
}

function makeBlueprint(spec: {
  id?: BlueprintId;
  productType?: FinishedProductType;
  widthIn: number;
  heightIn: number;
  fastenerConsumable: ConsumableId;
  slots: ReadonlyArray<Omit<BlueprintSlot, "id">>;
}): ProductBlueprint {
  const id = spec.id ?? spec.productType;
  if (!id) {
    throw new Error("A blueprint needs an id or a product type");
  }
  const counts = new Map<string, number>();
  const slots = spec.slots.map((slot) => {
    const index = counts.get(slot.role) ?? 0;
    counts.set(slot.role, index + 1);
    return { ...slot, id: `${slot.role}-${index}` };
  });
  return {
    id,
    ...(spec.productType ? { productType: spec.productType } : {}),
    widthIn: spec.widthIn,
    heightIn: spec.heightIn,
    fastenerConsumable: spec.fastenerConsumable,
    slots,
    fasteners: deriveFasteners(slots),
  };
}

/** A whole pallet board, straight off the pry bar — the stock the shop's
 * free work is built from, uncut. */
const PALLET_BOARD_STOCK: InputMaterialWithQuantity<Board> = {
  type: ["board"],
  species: ["pallet"],
  width: [PALLET_BOARD_WIDTH_IN],
  length: [PALLET_BOARD_LENGTH_IN],
  thickness: [PALLET_BOARD_THICKNESS_Q],
  quantity: 1,
};

const PALLET_BOARD_PART = {
  widthIn: PALLET_BOARD_WIDTH_IN,
  lengthIn: PALLET_BOARD_LENGTH_IN,
  thicknessQ: PALLET_BOARD_THICKNESS_Q,
} as const;

/** Where the two shelves sit, in inches down from the top of the unit. */
const RUSTIC_SHELF_HEIGHTS_IN = [12, 30];

/**
 * The rustic shelf: six whole pallet boards and nothing else — no cuts,
 * so it's the build a shop with a hammer and a scavenged pallet can do
 * on its first morning. Drawn as a front elevation, the unit lying on
 * its back on the bench.
 *
 * Two sides stand on edge at either end, running the full height. Each
 * shelf is a pair: a support board lying flat against the bench (the
 * unit's back, where it takes the load) with the shelf board itself
 * stood on edge along its front. Every nail is driven from outside a
 * side, through it and into the end of a shelf board or a support —
 * eight in all, two per side per shelf.
 */
export const RUSTIC_SHELF_BLUEPRINT: ProductBlueprint = makeBlueprint({
  productType: "rusticShelf",
  widthIn: 36,
  heightIn: 36,
  fastenerConsumable: "nails",
  slots: [
    // Backs first: the flat boards go down on the bench, then the sides
    // stand on edge across their ends, then the shelves drop in.
    ...RUSTIC_SHELF_HEIGHTS_IN.map((shelfYIn) => ({
      role: "support",
      requirement: PALLET_BOARD_STOCK,
      part: PALLET_BOARD_PART,
      xIn: 18,
      yIn: shelfYIn + 2.5,
      angleDeg: 90,
      layer: 0,
    })),
    ...[0.5, 35.5].map((xIn) => ({
      role: "side",
      requirement: PALLET_BOARD_STOCK,
      part: PALLET_BOARD_PART,
      xIn,
      yIn: 18,
      angleDeg: 0,
      layer: 1,
      onEdge: true,
    })),
    ...RUSTIC_SHELF_HEIGHTS_IN.map((shelfYIn) => ({
      role: "shelf",
      requirement: PALLET_BOARD_STOCK,
      part: PALLET_BOARD_PART,
      xIn: 18,
      yIn: shelfYIn,
      angleDeg: 90,
      layer: 2,
      onEdge: true,
    })),
  ],
});

/**
 * A box, in this model's vocabulary: four walls stand on edge spanning
 * the full frame, inset from the edges so neighboring walls lap past
 * each other near every corner — log-cabin corners, one derived
 * fastener where the two thin footprints cross. Opposite walls share a
 * layer (N/S below E/W) so only crossing pairs are fastener candidates,
 * and the bottom slats lie flat on layer 0, crossing the lower pair of
 * walls to earn a fastener each end.
 */
function boxSlots(spec: {
  sideIn: number;
  wallInsetIn: number;
  slatXsIn: ReadonlyArray<number>;
  requirement: InputMaterialWithQuantity<Board>;
  part: BlueprintSlot["part"];
}): ReadonlyArray<Omit<BlueprintSlot, "id">> {
  const { sideIn, wallInsetIn, slatXsIn, requirement, part } = spec;
  const mid = sideIn / 2;
  const far = sideIn - wallInsetIn;
  return [
    ...slatXsIn.map((xIn) => ({
      role: "slat",
      requirement,
      part,
      xIn,
      yIn: mid,
      angleDeg: 0,
      layer: 0,
    })),
    ...[
      { xIn: mid, yIn: wallInsetIn, angleDeg: 90, layer: 1 },
      { xIn: mid, yIn: far, angleDeg: 90, layer: 1 },
      { xIn: wallInsetIn, yIn: mid, angleDeg: 0, layer: 2 },
      { xIn: far, yIn: mid, angleDeg: 0, layer: 2 },
    ].map((at) => ({
      role: "wall",
      requirement,
      part,
      ...at,
      onEdge: true,
    })),
  ];
}

/**
 * The crate: a 3-foot pallet-wood box — a properly slatted bottom (six
 * slats edge to edge, 2" drainage gaps) and four whole pallet boards
 * stood on edge as walls, nailed at the four lapped corners and where
 * each slat crosses the lower walls. Sixteen nails, all derived.
 */
export const CRATE_BLUEPRINT: ProductBlueprint = makeBlueprint({
  productType: "crate",
  widthIn: 36,
  heightIn: 36,
  fastenerConsumable: "nails",
  slots: boxSlots({
    sideIn: 36,
    wallInsetIn: 2,
    slatXsIn: [3, 9, 15, 21, 27, 33],
    requirement: {
      type: ["board"],
      width: [4],
      length: [36],
      thickness: [4],
      quantity: 1,
    } as InputMaterialWithQuantity<Board>,
    part: { widthIn: 4, lengthIn: 36, thicknessQ: 4 } as const,
  }),
});

/**
 * The planter box: the crate's little sibling in 2-foot crosscuts — one
 * bottom slat (a planter drains through a gappy bottom), four walls on
 * edge, and screws instead of nails: it lives outdoors holding wet
 * soil, where nails would work loose. Six screws, all derived.
 */
export const PLANTER_BOX_BLUEPRINT: ProductBlueprint = makeBlueprint({
  productType: "planterBox",
  widthIn: 24,
  heightIn: 24,
  fastenerConsumable: "screws",
  slots: boxSlots({
    sideIn: 24,
    wallInsetIn: 2,
    slatXsIn: [12],
    requirement: {
      type: ["board"],
      species: ["pallet"],
      width: [4],
      length: [24],
      thickness: [4],
      quantity: 1,
    } as InputMaterialWithQuantity<Board>,
    part: { widthIn: 4, lengthIn: 24, thicknessQ: 4 } as const,
  }),
});

/**
 * The step stool: the rustic shelf's shape holding a person instead of
 * paint cans — two stout sides stand on edge (thick hardwood, 6/4 or
 * heavier), two treads lie flat across them, the top tread up
 * top and the step at half height. Screwed, not nailed: a joint that
 * takes a boot every day works loose around a nail.
 */
export const STEP_STOOL_BLUEPRINT: ProductBlueprint = makeBlueprint({
  productType: "stepStool",
  widthIn: 24,
  heightIn: 24,
  fastenerConsumable: "screws",
  slots: [
    ...[2, 22].map((xIn) => ({
      role: "side",
      requirement: {
        type: ["board"],
        width: [6],
        length: [24],
        thickness: [6, 8],
        quantity: 1,
      } as InputMaterialWithQuantity<Board>,
      part: { widthIn: 6, lengthIn: 24, thicknessQ: 6 } as const,
      xIn,
      yIn: 12,
      angleDeg: 0,
      layer: 0,
      onEdge: true,
    })),
    ...[4, 14].map((yIn) => ({
      role: "tread",
      requirement: {
        type: ["board"],
        width: [4],
        length: [24],
        thickness: [2],
        quantity: 1,
      } as InputMaterialWithQuantity<Board>,
      part: { widthIn: 4, lengthIn: 24, thicknessQ: 2 } as const,
      xIn: 12,
      yIn,
      angleDeg: 90,
      layer: 1,
    })),
  ],
});

/**
 * The bookshelf: twice the single shelf's stock, drawn lying on its
 * back — two 4-foot sides stand on edge as the uprights, two shelves
 * lie flat across them at thirds. All four boards are the same sanded
 * hardwood, so it's the first blueprint whose finished piece shows a
 * real-wood grain — the very oak the player sanded is the oak on the
 * floor.
 */
export const BOOKSHELF_BLUEPRINT: ProductBlueprint = makeBlueprint({
  productType: "bookshelf",
  widthIn: 48,
  heightIn: 48,
  fastenerConsumable: "screws",
  slots: [
    ...[2, 46].map((xIn) => ({
      role: "side",
      requirement: {
        type: ["board"],
        species: REAL_WOOD_SPECIES,
        length: [48],
        width: [6],
        thickness: [4],
        surface: ["sanded"],
        quantity: 1,
      } as InputMaterialWithQuantity<Board>,
      part: { widthIn: 6, lengthIn: 48, thicknessQ: 4 } as const,
      xIn,
      yIn: 24,
      angleDeg: 0,
      layer: 0,
      onEdge: true,
    })),
    ...[12, 36].map((yIn) => ({
      role: "shelf",
      requirement: {
        type: ["board"],
        species: REAL_WOOD_SPECIES,
        length: [48],
        width: [6],
        thickness: [4],
        surface: ["sanded"],
        quantity: 1,
      } as InputMaterialWithQuantity<Board>,
      part: { widthIn: 6, lengthIn: 48, thicknessQ: 4 } as const,
      xIn: 24,
      yIn,
      angleDeg: 90,
      layer: 1,
    })),
  ],
});

/**
 * The birdhouse: a lean-to for wrens, drawn as its front elevation — the
 * build lies on its back, so the plan you assemble on is the face you'd
 * see on the fence post. Two tall front boards stand side by side with a
 * 1" slit between them (the entrance — no drill bit needed), each with
 * its top end mitered at the 45° stop so the roof seats flush. Every
 * part is a crosscut of the same pallet board — the roof lies flat over
 * the slope, overhanging both sides; the floor stands on edge, running
 * long as a landing perch; two short side walls stop below the roofline, and the gaps they
 * leave are the ventilation. No back wall — it hangs against a post,
 * which is the fourth wall. Six nails, all derived: each front board
 * takes one into a side, one through the floor, and one down from the
 * roof.
 */
export const BIRDHOUSE_BLUEPRINT: ProductBlueprint = makeBlueprint({
  productType: "birdhouse",
  widthIn: 15,
  heightIn: 16,
  fastenerConsumable: "nails",
  slots: [
    // Front boards first: the most constrained slots claim their mitered
    // stock before the plain floor slot can steal it (matchPartsToSlots
    // walks in declaration order).
    ...[5, 10].map((xIn) => ({
      role: "front",
      requirement: {
        type: ["board"],
        width: [4],
        length: [12],
        thickness: [4],
        matches: (material: MaterialInstance) =>
          isBoard(material) && hasOneMiteredEnd(material, 45),
        matchesNote: "one end mitered 45°",
        quantity: 1,
      } as InputMaterialWithQuantity<Board>,
      part: { widthIn: 4, lengthIn: 12, thicknessQ: 4 } as const,
      xIn,
      yIn: 10,
      angleDeg: 0,
      layer: 1,
    })),
    {
      role: "roof",
      requirement: {
        type: ["board"],
        width: [4],
        length: [12],
        thickness: [4],
        quantity: 1,
      } as InputMaterialWithQuantity<Board>,
      part: { widthIn: 4, lengthIn: 12, thicknessQ: 4 } as const,
      xIn: 7.5,
      yIn: 3.5,
      angleDeg: 90,
      layer: 2,
    },
    // Pulled a quarter-inch in from the front boards' outer edges, so the
    // thicker 4/4 stock laps them fully instead of grazing.
    ...[3.5, 11.5].map((xIn) => ({
      role: "side",
      requirement: {
        type: ["board"],
        width: [4],
        length: [6],
        thickness: [4],
        quantity: 1,
      } as InputMaterialWithQuantity<Board>,
      part: { widthIn: 4, lengthIn: 6, thicknessQ: 4 } as const,
      xIn,
      yIn: 13,
      angleDeg: 0,
      layer: 0,
      onEdge: true,
    })),
    {
      role: "floor",
      requirement: {
        type: ["board"],
        width: [4],
        length: [12],
        thickness: [4],
        quantity: 1,
      } as InputMaterialWithQuantity<Board>,
      part: { widthIn: 4, lengthIn: 12, thicknessQ: 4 } as const,
      xIn: 7.5,
      yIn: 15.5,
      angleDeg: 90,
      layer: 0,
      onEdge: true,
    },
  ],
});

/** The frame rail's nominal ends: mirrored 45s, long edge to the left.
 * Every frame slot is turned so its local left edge faces the frame's
 * outside, so one nominal orientation serves all four. */
const FRAME_RAIL_ENDS: BoardEnds = {
  left: { kind: "mitered", angle: -45 },
  right: { kind: "mitered", angle: 45 },
};

/** All four rails are the same stock, so the sheet folds them to one row
 * of four — the same requirement the legacy recipe declared. */
const FRAME_RAIL_REQUIREMENT: InputMaterialWithQuantity<Board> = {
  type: ["board"],
  species: REAL_WOOD_SPECIES,
  length: [24],
  width: [1],
  thickness: [1],
  surface: ["sanded"],
  quantity: 1,
  // Four true frame rails: 45° both ends, mirrored so the corners
  // close. Parallel-mitered stock (a parallelogram) won't frame —
  // that's the whole point of the saw swinging both ways.
  matches: (material: MaterialInstance) =>
    isBoard(material) && isMiteredFrameRail(material, 45),
  matchesNote: "45° both ends, mirrored",
};

/**
 * The rustic frame's rails: pallet stock ripped to 2" and mitered, the
 * same mirrored 45s the fine frame wants. Two long, two short — a
 * rectangle rather than the picture frame's square, so the cut list is
 * two lengths off the saw instead of four of one.
 */
const RUSTIC_FRAME_LONG_RAIL: InputMaterialWithQuantity<Board> = {
  type: ["board"],
  species: ["pallet"],
  length: [24],
  width: [2],
  thickness: [4],
  surface: ["sanded"],
  quantity: 1,
  matches: (material: MaterialInstance) =>
    isBoard(material) && isMiteredFrameRail(material, 45),
  matchesNote: "45° both ends, mirrored",
};

const RUSTIC_FRAME_SHORT_RAIL: InputMaterialWithQuantity<Board> = {
  ...RUSTIC_FRAME_LONG_RAIL,
  length: [12],
};

/**
 * The rustic frame: the shop's first mitered work, and the build that
 * makes the starter shop hang together — the miter saw swings the 45s,
 * the table saw rips the pallet board to 2", and the sanding block takes
 * it the last grade. Four rails around an open middle at 12" × 24",
 * long pair down the sides on layer 0 and short pair lapping over them,
 * so each 2" × 2" corner earns one nail.
 *
 * Pallet stock and mirrored miters, which is the whole joke: reclaimed
 * wood cut to a tolerance it has never been held to before.
 */
export const RUSTIC_FRAME_BLUEPRINT: ProductBlueprint = makeBlueprint({
  productType: "rusticFrame",
  widthIn: 12,
  heightIn: 24,
  fastenerConsumable: "nails",
  slots: [
    // The long rails run down the sides on layer 0…
    ...[
      { xIn: 1, angleDeg: 0 },
      { xIn: 11, angleDeg: 180 },
    ].map(({ xIn, angleDeg }) => ({
      role: "rail",
      requirement: RUSTIC_FRAME_LONG_RAIL,
      part: {
        widthIn: 2,
        lengthIn: 24,
        thicknessQ: 4,
        ends: FRAME_RAIL_ENDS,
      } as const,
      xIn,
      yIn: 12,
      angleDeg,
      layer: 0,
    })),
    // …and the short rails lap across them at top and bottom.
    ...[
      { yIn: 1, angleDeg: 90 },
      { yIn: 23, angleDeg: 270 },
    ].map(({ yIn, angleDeg }) => ({
      role: "rail",
      requirement: RUSTIC_FRAME_SHORT_RAIL,
      part: {
        widthIn: 2,
        lengthIn: 12,
        thicknessQ: 4,
        ends: FRAME_RAIL_ENDS,
      } as const,
      xIn: 6,
      yIn,
      angleDeg,
      layer: 1,
    })),
  ],
});

/**
 * The picture frame: four mitered rails around an open middle, drawn at
 * the 24" square their 2' rails actually make. The horizontal pair lies
 * on the lower layer, the vertical pair laps over it, and each 1"×1"
 * corner overlap derives one brad — four nails, right on the seams. Every
 * slot is turned so its rail's long (outer) edge faces out, which is what
 * lets the mitered ends close the corners visually; a rail cut with the
 * opposite flip is simply turned over on the way in.
 */
export const PICTURE_FRAME_BLUEPRINT: ProductBlueprint = makeBlueprint({
  productType: "pictureFrame",
  widthIn: 24,
  heightIn: 24,
  fastenerConsumable: "nails",
  slots: [
    // Top and bottom rails lie across on layer 0…
    ...[
      { yIn: 0.5, angleDeg: 90 },
      { yIn: 23.5, angleDeg: 270 },
    ].map(({ yIn, angleDeg }) => ({
      role: "rail",
      requirement: FRAME_RAIL_REQUIREMENT,
      part: {
        widthIn: 1,
        lengthIn: 24,
        thicknessQ: 1,
        ends: FRAME_RAIL_ENDS,
      } as const,
      xIn: 12,
      yIn,
      angleDeg,
      layer: 0,
    })),
    // …and the side rails lap over them on layer 1, overlapping exactly
    // at the four 1×1 corners.
    ...[
      { xIn: 0.5, angleDeg: 0 },
      { xIn: 23.5, angleDeg: 180 },
    ].map(({ xIn, angleDeg }) => ({
      role: "rail",
      requirement: FRAME_RAIL_REQUIREMENT,
      part: {
        widthIn: 1,
        lengthIn: 24,
        thicknessQ: 1,
        ends: FRAME_RAIL_ENDS,
      } as const,
      xIn,
      yIn: 12,
      angleDeg,
      layer: 1,
    })),
  ],
});

// ---------------------------------------------------------------------
// Shop equipment blueprints. Every one is drawn the way a woodworker
// actually builds it: upside down. The top (or base sheet) lies
// face-down on the bench, and the understructure is laid onto its
// underside — so layer 0 is the show face against the bench, and the
// last layer is what faces up while you work.

/** Leg-grade stock: 2×4s and heavier. Pallet wood is 4/4 and doesn't
 * qualify — a bench stands on bought lumber, the way a real one does. */
const LEG_STOCK: InputMaterialWithQuantity<Board> = {
  type: ["board"],
  thickness: [6, 8],
  length: [36, 48],
  quantity: 1,
};

const LEG_PART = { widthIn: 4, lengthIn: 48, thicknessQ: 6 } as const;

/**
 * A cut piece of sheet good, stated the way sheets are stored: long side
 * as the length (see makeSheet in sheet-helpers). A requirement can name
 * one orientation because a sheet has no grain to care which way round
 * it lies.
 */
function sheetRequirement(
  kinds: ReadonlyArray<string>,
  aIn: number,
  bIn: number,
): InputMaterialWithQuantity<Board> {
  return {
    type: ["plywood"],
    kind: [...kinds],
    length: [Math.max(aIn, bIn)],
    width: [Math.min(aIn, bIn)],
    quantity: 1,
  } as unknown as InputMaterialWithQuantity<Board>;
}

/** Sheet parts are drawn at the size of the piece that fills them. */
function sheetPart(widthIn: number, lengthIn: number) {
  return { widthIn, lengthIn, thicknessQ: 3 } as const;
}

/**
 * The frame every table-shaped build shares, drawn upside down: the
 * sheet(s) face-down on the bottom layers, two long rails stood on edge
 * across the underside, and the remaining leg boards as stretchers on
 * edge crossing the rails. One fastener per sheet–rail seam and one at
 * every rail–stretcher crossing, all derived.
 */
function tableSlots(spec: {
  kinds: ReadonlyArray<string>;
  /** The finished top, in inches — the machine's own footprint. */
  topWidthIn: number;
  topDepthIn: number;
  sheets: number;
  legBoards: number;
}): ReadonlyArray<Omit<BlueprintSlot, "id">> {
  const { topWidthIn, topDepthIn, sheets, legBoards } = spec;
  const stretchers = legBoards - 2;
  // The top is decked in equal strips across its width, so a table wider
  // than the store's biggest panel is built from panels side by side
  // rather than from a piece nobody sells.
  const deckWidthIn = topWidthIn / sheets;
  // The legs are still ordinary 3-4 ft boards; a rail is drawn no longer
  // than the table it crosses, the way one cut to fit would be.
  const railLengthIn = Math.min(LEG_PART.lengthIn, topWidthIn);
  const stretcherLengthIn = Math.min(LEG_PART.lengthIn, topDepthIn);
  return [
    ...array(sheets).map((_, i) => ({
      role: "top",
      requirement: sheetRequirement(spec.kinds, deckWidthIn, topDepthIn),
      part: sheetPart(deckWidthIn, topDepthIn),
      xIn: (i + 0.5) * deckWidthIn,
      yIn: topDepthIn / 2,
      angleDeg: 0,
      layer: i,
    })),
    ...[topDepthIn / 6, (topDepthIn * 5) / 6].map((yIn) => ({
      role: "rail",
      requirement: LEG_STOCK,
      part: { ...LEG_PART, lengthIn: railLengthIn },
      xIn: topWidthIn / 2,
      yIn,
      angleDeg: 90,
      layer: sheets,
      onEdge: true,
    })),
    ...array(stretchers).map((_, i) => ({
      role: "stretcher",
      requirement: LEG_STOCK,
      part: { ...LEG_PART, lengthIn: stretcherLengthIn },
      xIn: ((i + 1) * topWidthIn) / (stretchers + 1),
      yIn: topDepthIn / 2,
      angleDeg: 0,
      layer: sheets + 1,
      onEdge: true,
    })),
  ];
}

/**
 * Table dimensions are restated here rather than read off the machine
 * type: worktables.ts reaches this module through benchOperations, so
 * importing it back would close a cycle. `blueprint.test.ts` holds the
 * two in step.
 */
function worktableBlueprint(
  id: EquipmentBlueprintId,
  topWidthIn: number,
  topDepthIn: number,
  sheets: number,
  legBoards: number,
): ProductBlueprint {
  return makeBlueprint({
    id,
    widthIn: topWidthIn,
    heightIn: topDepthIn,
    fastenerConsumable: "nails",
    slots: tableSlots({
      kinds: SHOP_FURNITURE_KINDS,
      topWidthIn,
      topDepthIn,
      sheets,
      legBoards,
    }),
  });
}

export const WORKTABLE_BLUEPRINTS = {
  worktable1x1: worktableBlueprint("worktable1x1", 24, 24, 1, 3),
  worktable1x2: worktableBlueprint("worktable1x2", 48, 24, 1, 4),
  worktable1x3: worktableBlueprint("worktable1x3", 72, 24, 1, 5),
  worktable2x2: worktableBlueprint("worktable2x2", 48, 48, 2, 6),
} as const;

/** The storage rack: the worktable's shape in the cheap sheets — a deck
 * face-down, stout rails and bearers nailed across its underside. */
export const STORAGE_RACK_BLUEPRINT: ProductBlueprint = makeBlueprint({
  id: "storageRack",
  widthIn: 24,
  heightIn: 24,
  fastenerConsumable: "nails",
  slots: tableSlots({
    kinds: RACK_GRADE_KINDS,
    topWidthIn: 24,
    topDepthIn: 24,
    sheets: 1,
    legBoards: 4,
  }),
});

/**
 * The tool drawers: a sheet carcass face-down with two thin drawer
 * fronts laid across it — the whole upgrade in two seams.
 */
export const TOOL_DRAWERS_BLUEPRINT: ProductBlueprint = makeBlueprint({
  id: "toolDrawers",
  widthIn: 24,
  heightIn: 24,
  fastenerConsumable: "nails",
  slots: [
    {
      role: "carcass",
      requirement: sheetRequirement(SHOP_FURNITURE_KINDS, 24, 24),
      part: sheetPart(24, 24),
      xIn: 12,
      yIn: 12,
      angleDeg: 0,
      layer: 0,
    },
    ...[8, 16].map((yIn) => ({
      role: "front",
      requirement: {
        type: ["board"],
        thickness: [1, 2],
        length: [24, 36],
        quantity: 1,
      } as InputMaterialWithQuantity<Board>,
      part: { widthIn: 4, lengthIn: 24, thicknessQ: 2 } as const,
      xIn: 12,
      yIn,
      angleDeg: 90,
      layer: 1,
    })),
  ],
});

/**
 * The material shelf: two planks laid side by side — they span the
 * worktable's own stretchers when installed, so there is nothing to
 * fasten here at all. Laying the second plank on is the whole build.
 */
export const MATERIAL_SHELF_BLUEPRINT: ProductBlueprint = makeBlueprint({
  id: "materialShelf",
  widthIn: 48,
  heightIn: 24,
  fastenerConsumable: "nails",
  slots: [8, 16].map((yIn) => ({
    role: "plank",
    requirement: {
      type: ["board"],
      thickness: [1, 2],
      length: [36, 48],
      quantity: 1,
    } as InputMaterialWithQuantity<Board>,
    part: { widthIn: 4, lengthIn: 48, thicknessQ: 2 } as const,
    xIn: 24,
    yIn,
    angleDeg: 90,
    layer: 0,
  })),
});

/** The jigs' shared stock: scrap boards, and a jig-grade base cut to the
 * jig's own size — none of them is a whole sheet's worth of anything. */
const JIG_BOARD_REQUIREMENT: InputMaterialWithQuantity<Board> = {
  type: ["board"],
  width: [PALLET_BOARD_WIDTH_IN],
  length: [PALLET_BOARD_LENGTH_IN],
  thickness: [PALLET_BOARD_THICKNESS_Q],
  quantity: 1,
};
const JIG_BOARD_PART = PALLET_BOARD_PART;

/**
 * The crosscut sled, face-down: the miter-slot runner against the bench,
 * the base over it, and the fence screwed across the top of the base.
 */
export const CROSSCUT_SLED_BLUEPRINT: ProductBlueprint = makeBlueprint({
  id: "crosscutSled",
  widthIn: 36,
  heightIn: 36,
  fastenerConsumable: "screws",
  slots: [
    {
      role: "base",
      requirement: sheetRequirement(JIG_GRADE_KINDS, 24, 20),
      part: sheetPart(24, 20),
      xIn: 18,
      yIn: 18,
      angleDeg: 0,
      layer: 1,
    },
    {
      role: "runner",
      requirement: JIG_BOARD_REQUIREMENT,
      part: JIG_BOARD_PART,
      xIn: 18,
      yIn: 18,
      angleDeg: 0,
      layer: 0,
    },
    {
      role: "fence",
      requirement: JIG_BOARD_REQUIREMENT,
      part: JIG_BOARD_PART,
      xIn: 18,
      yIn: 10,
      angleDeg: 90,
      layer: 2,
    },
  ],
});

/**
 * The straight-line sled: a long base with a reference rail and the
 * clamp carrier screwed along it — nothing rides underneath.
 */
export const STRAIGHT_LINE_SLED_BLUEPRINT: ProductBlueprint = makeBlueprint({
  id: "straightLineSled",
  widthIn: 48,
  heightIn: 24,
  fastenerConsumable: "screws",
  slots: [
    {
      role: "base",
      requirement: sheetRequirement(JIG_GRADE_KINDS, 48, 16),
      part: sheetPart(48, 16),
      xIn: 24,
      yIn: 12,
      angleDeg: 0,
      layer: 0,
    },
    ...[7, 17].map((yIn) => ({
      role: "rail",
      requirement: JIG_BOARD_REQUIREMENT,
      part: JIG_BOARD_PART,
      xIn: 24,
      yIn,
      angleDeg: 90,
      layer: 1,
    })),
  ],
});

/**
 * The tall resaw fence, on its back: the face sheet down, two triangular
 * braces stood on edge where they keep it square to the table.
 */
export const RESAW_FENCE_BLUEPRINT: ProductBlueprint = makeBlueprint({
  id: "resawFence",
  widthIn: 24,
  heightIn: 12,
  fastenerConsumable: "screws",
  slots: [
    {
      role: "face",
      // Tall enough to clear the blade and no taller: the fence only
      // ever holds stock up to the saw's resaw capacity on edge.
      requirement: sheetRequirement(JIG_GRADE_KINDS, 24, 6),
      part: sheetPart(6, 24),
      xIn: 12,
      yIn: 6,
      angleDeg: 90,
      layer: 0,
    },
    ...[6, 18].map((xIn) => ({
      role: "brace",
      requirement: {
        type: ["board"],
        width: [4],
        length: [12],
        thickness: [2],
        quantity: 1,
      } as InputMaterialWithQuantity<Board>,
      part: { widthIn: 4, lengthIn: 12, thicknessQ: 2 } as const,
      xIn,
      yIn: 6,
      angleDeg: 0,
      layer: 1,
      onEdge: true,
    })),
  ],
});

/** A short frame rail for the tray's ends: the same 1×1 mirrored-miter
 * stock as every frame, crosscut at the 12" detent. */
const SHORT_FRAME_RAIL_REQUIREMENT: InputMaterialWithQuantity<Board> = {
  ...FRAME_RAIL_REQUIREMENT,
  length: [12],
};

/**
 * The serving tray: a glued-up panel bottom with the picture frame's
 * rail wrap around its rim — the first blueprint with a panel part. The
 * bottom is exactly six 2" strips (12" wide), so the four mitered rails
 * genuinely close around it: two long rails lap the panel's long edges
 * and screw down their seams, and the two short rails lap over the long
 * ones at the corners, brad at each 1×1 lap. Eight nails, all derived —
 * the legacy recipe's hand-set bill, now earned.
 */
export const SERVING_TRAY_BLUEPRINT: ProductBlueprint = makeBlueprint({
  productType: "servingTray",
  widthIn: 12,
  heightIn: 24,
  fastenerConsumable: "nails",
  slots: [
    {
      role: "bottom",
      requirement: {
        type: ["panel"],
        length: [24],
        thickness: [3, 4],
        surface: ["sanded"],
        quantity: 1,
        // Six real-wood strips: the one width the mitered wrap closes on
        matches: (material: MaterialInstance) =>
          isPanel(material) &&
          panelWidth(material) === 12 &&
          material.strips.every((strip) => strip.species !== "pallet"),
        matchesNote: '12" wide, real wood',
      } as unknown as InputMaterialWithQuantity<Board>,
      part: { widthIn: 12, lengthIn: 24, thicknessQ: 4 } as const,
      xIn: 6,
      yIn: 12,
      angleDeg: 0,
      layer: 0,
    },
    ...[
      { xIn: 0.5, angleDeg: 0 },
      { xIn: 11.5, angleDeg: 180 },
    ].map(({ xIn, angleDeg }) => ({
      role: "rail",
      requirement: FRAME_RAIL_REQUIREMENT,
      part: {
        widthIn: 1,
        lengthIn: 24,
        thicknessQ: 1,
        ends: FRAME_RAIL_ENDS,
      } as const,
      xIn,
      yIn: 12,
      angleDeg,
      layer: 1,
    })),
    ...[
      { yIn: 0.5, angleDeg: 90 },
      { yIn: 23.5, angleDeg: 270 },
    ].map(({ yIn, angleDeg }) => ({
      role: "end",
      requirement: SHORT_FRAME_RAIL_REQUIREMENT,
      part: {
        widthIn: 1,
        lengthIn: 12,
        thicknessQ: 1,
        ends: FRAME_RAIL_ENDS,
      } as const,
      xIn: 6,
      yIn,
      angleDeg,
      layer: 2,
    })),
  ],
});

/**
 * The fine hardwood shelf, face-down: the plank lies on the bench show
 * face down, and the cleat — the same stock stood on its long edge —
 * runs along the back edge of its underside, screwed down its length
 * (the seam rule: one screw in a four-foot joint holds nothing). On the
 * wall the cleat is what carries it.
 */
const SHELF_STOCK: InputMaterialWithQuantity<Board> = {
  type: ["board"],
  species: REAL_WOOD_SPECIES,
  length: [48],
  width: [6],
  thickness: [4],
  surface: ["sanded"],
  quantity: 1,
};

export const SHELF_BLUEPRINT: ProductBlueprint = makeBlueprint({
  productType: "shelf",
  widthIn: 48,
  heightIn: 8,
  fastenerConsumable: "screws",
  slots: [
    {
      role: "plank",
      requirement: SHELF_STOCK,
      part: { widthIn: 6, lengthIn: 48, thicknessQ: 4 } as const,
      xIn: 24,
      yIn: 4,
      angleDeg: 90,
      layer: 0,
    },
    {
      role: "cleat",
      requirement: SHELF_STOCK,
      part: { widthIn: 6, lengthIn: 48, thicknessQ: 4 } as const,
      xIn: 24,
      yIn: 1.5,
      angleDeg: 90,
      layer: 1,
      onEdge: true,
    },
  ],
});

/**
 * The side table, upside down — the way every table is actually built:
 * the glued top lies face-down on the bench, and the four legs stand on
 * their ends at its corners, screwed down through the underside. The
 * legs are the first parts to use the on-end footprint: each ghost is a
 * bare 2"×1½" cross-section, and only a leg stood on end (F twice)
 * seats it. The top is the tray bottom's bigger sibling: six 2" strips,
 * exactly 12" wide.
 */
const TABLE_LEG_REQUIREMENT: InputMaterialWithQuantity<Board> = {
  type: ["board"],
  length: [24],
  width: [2],
  thickness: [6, 8],
  surface: ["smooth", "sanded"],
  quantity: 1,
};

export const SIDE_TABLE_BLUEPRINT: ProductBlueprint = makeBlueprint({
  productType: "sideTable",
  widthIn: 12,
  heightIn: 24,
  fastenerConsumable: "screws",
  slots: [
    {
      role: "top",
      requirement: {
        type: ["panel"],
        length: [24],
        thickness: [4],
        surface: ["sanded"],
        quantity: 1,
        // Six real-wood strips — wider than any single board gets
        matches: (material: MaterialInstance) =>
          isPanel(material) &&
          panelWidth(material) === 12 &&
          material.strips.every((strip) => strip.species !== "pallet"),
        matchesNote: '12" wide, real wood',
      } as unknown as InputMaterialWithQuantity<Board>,
      part: { widthIn: 12, lengthIn: 24, thicknessQ: 4 } as const,
      xIn: 6,
      yIn: 12,
      angleDeg: 0,
      layer: 0,
    },
    ...[
      { xIn: 2, yIn: 2.5 },
      { xIn: 10, yIn: 2.5 },
      { xIn: 2, yIn: 21.5 },
      { xIn: 10, yIn: 21.5 },
    ].map((at) => ({
      role: "leg",
      requirement: TABLE_LEG_REQUIREMENT,
      part: { widthIn: 2, lengthIn: 24, thicknessQ: 6 } as const,
      ...at,
      angleDeg: 0,
      layer: 1,
      onEnd: true,
    })),
  ],
});

/** The hex rail's nominal ends: mirrored 30s, like the frame rail's 45s. */
const HEX_RAIL_ENDS: BoardEnds = {
  left: { kind: "mitered", angle: -30 },
  right: { kind: "mitered", angle: 30 },
};

const HEX_RAIL_REQUIREMENT: InputMaterialWithQuantity<Board> = {
  type: ["board"],
  species: REAL_WOOD_SPECIES,
  length: [12],
  width: [1],
  thickness: [1],
  surface: ["sanded"],
  quantity: 1,
  // Six true hex rails: 30° both ends, mirrored so the hexagon closes
  matches: (material: MaterialInstance) =>
    isBoard(material) && isMiteredFrameRail(material, 30),
  matchesNote: "30° both ends, mirrored",
};

/**
 * The hex frame: six foot-long rails around a hexagonal opening — the
 * first blueprint whose slots turn off the square grid. Alternate rails
 * sit on alternate layers, so each of the six corners is an adjacent-
 * layer lap of two turned rails; the lap is a skewed polygon, and its
 * derived brad lands at the lap's centroid, right on the seam. Six
 * brads — the legacy hand-set bill, now earned.
 */
const HEX_SIDE_IN = 12;
const HEX_APOTHEM_IN = (Math.sqrt(3) / 2) * HEX_SIDE_IN;

export const HEX_FRAME_BLUEPRINT: ProductBlueprint = makeBlueprint({
  productType: "hexFrame",
  widthIn: HEX_SIDE_IN * 2,
  heightIn: HEX_APOTHEM_IN * 2,
  fastenerConsumable: "nails",
  slots: array(6).map((_, i) => {
    // Edge i's outward normal, walking clockwise from the top edge
    const normal = ((i * 60 - 90) * Math.PI) / 180;
    return {
      role: "rail",
      requirement: HEX_RAIL_REQUIREMENT,
      part: {
        widthIn: 1,
        lengthIn: HEX_SIDE_IN,
        thicknessQ: 1,
        ends: HEX_RAIL_ENDS,
      } as const,
      // Rail centers sit half a rail-width inside each edge
      xIn: HEX_SIDE_IN + Math.cos(normal) * (HEX_APOTHEM_IN - 0.5),
      yIn: HEX_APOTHEM_IN + Math.sin(normal) * (HEX_APOTHEM_IN - 0.5),
      // The rail runs along its edge: perpendicular to the normal
      angleDeg: i * 60 + 90,
      layer: i % 2,
    };
  }),
});

/**
 * The jewelry box, finally jewelry-sized: 12"×6" and two inches tall,
 * all thin 2/4 stock the planer earns. The fanciest small build in the
 * shop — seven parts in three cuts of the same milled hardwood: two
 * bottom slats laid side by side, four walls stood on edge in lapped
 * log-cabin corners, and a divider splitting the well in half. Eight
 * brads, all derived: one down through each slat into a long wall, one
 * at each corner lap, one at each end of the divider.
 */
const BOX_STOCK = (
  lengthIn: number,
  widthIn: 2 | 3,
): InputMaterialWithQuantity<Board> => ({
  type: ["board"],
  species: REAL_WOOD_SPECIES,
  length: [lengthIn],
  width: [widthIn],
  // Thin stock: you'll be planing for this
  thickness: [2],
  surface: ["sanded"],
  quantity: 1,
});

export const JEWELRY_BOX_BLUEPRINT: ProductBlueprint = makeBlueprint({
  productType: "jewelryBox",
  widthIn: 12,
  heightIn: 6,
  fastenerConsumable: "nails",
  slots: [
    // The bottom: two slats side by side, each riding a long wall's seam
    ...[1.5, 4.5].map((yIn) => ({
      role: "slat",
      requirement: BOX_STOCK(12, 3),
      part: { widthIn: 3, lengthIn: 12, thicknessQ: 2 } as const,
      xIn: 6,
      yIn,
      angleDeg: 90,
      layer: 0,
    })),
    // Long walls on edge along the slats' outer edges
    ...[0.5, 5.5].map((yIn) => ({
      role: "wall",
      requirement: BOX_STOCK(12, 2),
      part: { widthIn: 2, lengthIn: 12, thicknessQ: 2 } as const,
      xIn: 6,
      yIn,
      angleDeg: 90,
      layer: 1,
      onEdge: true,
    })),
    // End walls lap the long walls at the four corners…
    ...[0.5, 11.5].map((xIn) => ({
      role: "end",
      requirement: BOX_STOCK(6, 2),
      part: { widthIn: 2, lengthIn: 6, thicknessQ: 2 } as const,
      xIn,
      yIn: 3,
      angleDeg: 0,
      layer: 2,
      onEdge: true,
    })),
    // …and the divider parts a ring well off the main one, bradded into
    // both long walls (off-center, so its brads never stack on the
    // slat seams' center brads)
    {
      role: "divider",
      requirement: BOX_STOCK(6, 2),
      part: { widthIn: 2, lengthIn: 6, thicknessQ: 2 } as const,
      xIn: 4,
      yIn: 3,
      angleDeg: 0,
      layer: 2,
      onEdge: true,
    },
  ],
});

const BLUEPRINTS: Partial<Record<BlueprintId, ProductBlueprint>> = {
  rusticShelf: RUSTIC_SHELF_BLUEPRINT,
  crate: CRATE_BLUEPRINT,
  planterBox: PLANTER_BOX_BLUEPRINT,
  stepStool: STEP_STOOL_BLUEPRINT,
  bookshelf: BOOKSHELF_BLUEPRINT,
  birdhouse: BIRDHOUSE_BLUEPRINT,
  rusticFrame: RUSTIC_FRAME_BLUEPRINT,
  pictureFrame: PICTURE_FRAME_BLUEPRINT,
  hexFrame: HEX_FRAME_BLUEPRINT,
  jewelryBox: JEWELRY_BOX_BLUEPRINT,
  shelf: SHELF_BLUEPRINT,
  servingTray: SERVING_TRAY_BLUEPRINT,
  sideTable: SIDE_TABLE_BLUEPRINT,
  worktable1x1: WORKTABLE_BLUEPRINTS.worktable1x1,
  worktable1x2: WORKTABLE_BLUEPRINTS.worktable1x2,
  worktable1x3: WORKTABLE_BLUEPRINTS.worktable1x3,
  worktable2x2: WORKTABLE_BLUEPRINTS.worktable2x2,
  storageRack: STORAGE_RACK_BLUEPRINT,
  toolDrawers: TOOL_DRAWERS_BLUEPRINT,
  materialShelf: MATERIAL_SHELF_BLUEPRINT,
  crosscutSled: CROSSCUT_SLED_BLUEPRINT,
  straightLineSled: STRAIGHT_LINE_SLED_BLUEPRINT,
  resawFence: RESAW_FENCE_BLUEPRINT,
};

/** The blueprint behind an assembled product type, or null. */
export function productBlueprintFor(
  type: string | undefined,
): ProductBlueprint | null {
  return (type && BLUEPRINTS[type as BlueprintId]) || null;
}

/**
 * The recipe's input list, derived from the slots so the plan and the
 * bench can never disagree: consecutive slots with identical
 * requirements fold into one row with a quantity.
 */
export function blueprintInputs(
  blueprint: ProductBlueprint,
): ReadonlyArray<InputMaterialWithQuantity<Board>> {
  const rows: Array<{ key: string; input: InputMaterialWithQuantity<Board> }> =
    [];
  for (const slot of blueprint.slots) {
    const key = JSON.stringify(slot.requirement);
    const last = rows[rows.length - 1];
    if (last && last.key === key) {
      last.input = { ...last.input, quantity: last.input.quantity + 1 };
    } else {
      rows.push({ key, input: { ...slot.requirement, quantity: 1 } });
    }
  }
  return rows.map((row) => row.input);
}

/** The tool that drives a blueprint's fasteners in the bench view:
 * nails take the hammer, screws the drill. The op already comes from
 * that very tool, so the driver is always on the rail when the plan is. */
export function fastenerToolId(consumable: ConsumableId): ToolId {
  return consumable === "screws" ? "drill" : "hammer";
}

/** The fastener bill, derived from the derived fasteners. */
export function blueprintFastenerCost(
  blueprint: ProductBlueprint,
): ReadonlyArray<ConsumableAmount> {
  return blueprint.fasteners.length > 0
    ? [{ id: blueprint.fastenerConsumable, amount: blueprint.fasteners.length }]
    : [];
}

/**
 * Which staged material fills which slot, in slot order — the same
 * greedy matching the operation's claim uses, so the bill of materials
 * lines up with what was actually taken.
 */
export function matchPartsToSlots(
  blueprint: ProductBlueprint,
  materials: ReadonlyArray<MaterialInstance>,
): ReadonlyArray<{ slot: BlueprintSlot; material: Board | Panel }> {
  const pool = [...materials];
  return blueprint.slots.map((slot) => {
    const index = pool.findIndex((material) =>
      materialMeetsInput(material, slot.requirement),
    );
    if (index === -1) {
      throw new Error(
        `No staged piece fits the ${slot.role} slot of ${blueprint.id}`,
      );
    }
    const material = pool[index] as Board | Panel;
    pool.splice(index, 1);
    return { slot, material };
  });
}

/** The species most of the parts share — the product's face color. */
function dominantSpecies(parts: ReadonlyArray<{ species: Species }>): Species {
  const counts = new Map<Species, number>();
  for (const part of parts) {
    counts.set(part.species, (counts.get(part.species) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

const negateEnd = (end: BoardEnd): BoardEnd =>
  end.kind === "mitered"
    ? // The signed-angle union is symmetric, so a negation stays in it
      { kind: "mitered", angle: -end.angle as SignedMiterAngle }
    : end;

const endsEqual = (a: BoardEnd, b: BoardEnd): boolean =>
  a.kind === b.kind &&
  (a.kind !== "mitered" || b.kind !== "mitered" || a.angle === b.angle);

/**
 * The consumed board's ends, turned over if that lands them on the
 * slot's nominal orientation. Flipping a board negates both ends at once
 * and costs nothing, so a frame rail cut with either swing of the saw
 * head seats with its long edge out — the same board, laid the way the
 * corners close. Ends that match neither way are kept as recorded.
 */
function orientEndsToSlot(
  slot: BlueprintSlot,
  material: Board,
): BoardEnds | undefined {
  const ends = material.ends;
  const nominal = slot.part.ends;
  if (!ends || !nominal) {
    return ends;
  }
  if (
    endsEqual(ends.left, nominal.left) &&
    endsEqual(ends.right, nominal.right)
  ) {
    return ends;
  }
  const flipped: BoardEnds = {
    left: negateEnd(ends.left),
    right: negateEnd(ends.right),
  };
  return endsEqual(flipped.left, nominal.left) &&
    endsEqual(flipped.right, nominal.right)
    ? flipped
    : ends;
}

/**
 * The finished product, carrying its bill of materials: the very boards
 * that went in, seeded by their ids so each part keeps the grain it had
 * lying on the bench — assembly fastens the boards, it doesn't swap
 * them for different ones.
 */
export function assembleFromBlueprint(
  blueprint: ProductBlueprint,
  materials: ReadonlyArray<MaterialInstance>,
): FinishedProduct {
  const productType = blueprint.productType;
  if (!productType) {
    throw new Error(
      `The ${blueprint.id} blueprint builds equipment, not a product`,
    );
  }
  const matched = matchPartsToSlots(blueprint, materials);
  const parts: AssembledPart[] = matched.map(({ slot, material }) => {
    // A glued-up part keeps its strips — the tray's bottom shows the
    // very stripes the player glued
    if (isPanel(material)) {
      return {
        slot: slot.id,
        species: dominantSpecies(material.strips),
        width: panelWidth(material),
        length: material.length,
        thickness: material.thickness,
        surface: material.surface,
        strips: material.strips,
        seed: material.id,
      };
    }
    const ends = orientEndsToSlot(slot, material);
    return {
      slot: slot.id,
      species: material.species,
      width: material.width,
      length: material.length,
      thickness: material.thickness,
      // A sanded board stays sanded in the finished piece — the bookshelf
      // is built from surfaced stock, not pallet wood
      surface: material.surface,
      // …and a mitered board stays mitered: a frame rail's corners are
      // its ends, visible in the finished piece
      ...(ends ? { ends } : {}),
      seed: material.id,
    };
  });
  // A build with a panel part reads its species off that face — the
  // tray's bottom, the table's top — not off a headcount its four legs
  // would win
  const facePart = parts.find((part) => part.strips);
  return makeMaterial<FinishedProduct>({
    type: productType,
    species: facePart ? facePart.species : dominantSpecies(parts),
    parts,
  });
}

/**
 * Stand-in parts for a product saved before products carried their
 * bill of materials: the blueprint's nominal stock in the product's own
 * species, seeded off the product id so the grain is stable.
 */
export function defaultPartsFor(
  blueprint: ProductBlueprint,
  product: FinishedProduct,
): ReadonlyArray<AssembledPart> {
  return blueprint.slots.map((slot) => ({
    slot: slot.id,
    species: product.species,
    width: slot.part.widthIn as BoardDimension,
    length: slot.part.lengthIn,
    thickness: slot.part.thicknessQ as BoardDimension,
    ...(slot.requirement.surface?.[0]
      ? { surface: slot.requirement.surface[0] }
      : {}),
    // The slot's nominal ends, so a frame from before parts carried end
    // treatments still draws closed corners
    ...(slot.part.ends ? { ends: slot.part.ends } : {}),
    seed: `${product.id}:${slot.id}`,
  }));
}
