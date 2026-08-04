import { InputMaterialWithQuantity } from "../Machine";
import { ConsumableAmount, ConsumableId } from "../Consumable";
import type { ToolId } from "../Tool";
import {
  AssembledPart,
  Board,
  BoardDimension,
  FinishedProduct,
  FinishedProductType,
  MaterialInstance,
  REAL_WOOD_SPECIES,
  Species,
} from "../Materials";
import { makeMaterial, materialMeetsInput } from "../material-helpers";

/**
 * Product blueprints: the single authored artifact behind an assembled
 * product (see docs/assembly.md). A blueprint is a set of part slots —
 * where each board lies in the finished piece — and the fastener points
 * that hold them together, derived (never hand-set) as one nail per
 * overlap of two parts on adjacent layers, exactly the way a pallet
 * carries one nail per deck-board × stringer crossing.
 *
 * One blueprint is four things that previously could drift apart:
 * the recipe's input list (blueprintInputs), its fastener cost
 * (blueprintFastenerCost), the finished product's rendering
 * (AssembledProductSprite draws the slots' actual parts, grain and all),
 * and the bench view's assembly script (ghost outlines at the slots,
 * nails driven at the fasteners).
 */

/** One part's place in the finished product. */
export interface BlueprintSlot {
  /** Stable id, `role-index` — recorded on the product's parts. */
  readonly id: string;
  /** What the part is in prose: "rail", "shelf". */
  readonly role: string;
  /** What stock fills the slot — the same matcher recipes already use. */
  readonly requirement: InputMaterialWithQuantity<Board>;
  /** The part's nominal dims, for ghosts, overlap math, and stand-in
   * parts on products from older saves (Board units). */
  readonly part: {
    readonly widthIn: BoardDimension;
    readonly lengthIn: number;
    readonly thicknessQ: BoardDimension;
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
}

/** One fastener, at the overlap of exactly two parts — like a pallet
 * nail, it joins those two and nothing else. */
export interface BlueprintFastener {
  readonly xIn: number;
  readonly yIn: number;
  /** The slots this fastener joins: [lower layer, upper layer]. */
  readonly joins: readonly [string, string];
}

export interface ProductBlueprint {
  readonly productType: FinishedProductType;
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

/** A slot's axis-aligned footprint in product inches. */
export function slotExtent(slot: BlueprintSlot): {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
} {
  const lengthIn = slot.part.lengthIn;
  const faceWidth = slotFaceWidthIn(slot);
  const across = slot.angleDeg % 180 !== 0;
  const w = across ? lengthIn : faceWidth;
  const h = across ? faceWidth : lengthIn;
  return {
    x0: slot.xIn - w / 2,
    y0: slot.yIn - h / 2,
    x1: slot.xIn + w / 2,
    y1: slot.yIn + h / 2,
  };
}

/** Two overlapping rects on adjacent layers get one fastener at the
 * overlap's center — enough bite to matter, so grazing corners don't. */
const MIN_OVERLAP_IN = 1;

function deriveFasteners(
  slots: ReadonlyArray<BlueprintSlot>,
): ReadonlyArray<BlueprintFastener> {
  const fasteners: BlueprintFastener[] = [];
  for (const lower of slots) {
    for (const upper of slots) {
      if (upper.layer !== lower.layer + 1) continue;
      const a = slotExtent(lower);
      const b = slotExtent(upper);
      const x0 = Math.max(a.x0, b.x0);
      const y0 = Math.max(a.y0, b.y0);
      const x1 = Math.min(a.x1, b.x1);
      const y1 = Math.min(a.y1, b.y1);
      // The bite required per axis relaxes for thin parts: a deck board
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
      fasteners.push({
        xIn: (x0 + x1) / 2,
        yIn: (y0 + y1) / 2,
        joins: [lower.id, upper.id],
      });
    }
  }
  return fasteners;
}

function makeBlueprint(spec: {
  productType: FinishedProductType;
  widthIn: number;
  heightIn: number;
  fastenerConsumable: ConsumableId;
  slots: ReadonlyArray<Omit<BlueprintSlot, "id">>;
}): ProductBlueprint {
  const counts = new Map<string, number>();
  const slots = spec.slots.map((slot) => {
    if (slot.angleDeg % 90 !== 0) {
      throw new Error(`Blueprint slot angles must be square: ${slot.role}`);
    }
    const index = counts.get(slot.role) ?? 0;
    counts.set(slot.role, index + 1);
    return { ...slot, id: `${slot.role}-${index}` };
  });
  return {
    productType: spec.productType,
    widthIn: spec.widthIn,
    heightIn: spec.heightIn,
    fastenerConsumable: spec.fastenerConsumable,
    slots,
    fasteners: deriveFasteners(slots),
  };
}

/**
 * The rustic shelf, grounded: a pallet-wood slatted shelf, drawn from
 * above the way it's built. Two stringers stand on edge as rails — the
 * joists the whole thing hangs on — and three deck boards lie flat
 * across their top edges as slats, nailed at every crossing: six nails,
 * straight out of the pallet they came from.
 */
export const RUSTIC_SHELF_BLUEPRINT: ProductBlueprint = makeBlueprint({
  productType: "rusticShelf",
  widthIn: 48,
  heightIn: 36,
  fastenerConsumable: "nails",
  slots: [
    ...[6, 30].map((yIn) => ({
      role: "rail",
      requirement: {
        type: ["board"],
        species: ["pallet"],
        width: [6],
        length: [48],
        quantity: 1,
      } as InputMaterialWithQuantity<Board>,
      part: { widthIn: 6, lengthIn: 48, thicknessQ: 3 } as const,
      xIn: 24,
      yIn,
      angleDeg: 90,
      layer: 0,
      onEdge: true,
    })),
    ...[8, 24, 40].map((xIn) => ({
      role: "shelf",
      requirement: {
        type: ["board"],
        species: ["pallet"],
        width: [4],
        length: [36],
        quantity: 1,
      } as InputMaterialWithQuantity<Board>,
      part: { widthIn: 4, lengthIn: 36, thicknessQ: 1 } as const,
      xIn,
      yIn: 18,
      angleDeg: 0,
      layer: 1,
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
 * slats edge to edge, 2" drainage gaps) and four whole deck boards
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
      thickness: [1],
      quantity: 1,
    } as InputMaterialWithQuantity<Board>,
    part: { widthIn: 4, lengthIn: 36, thicknessQ: 1 } as const,
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
      thickness: [1],
      quantity: 1,
    } as InputMaterialWithQuantity<Board>,
    part: { widthIn: 4, lengthIn: 24, thicknessQ: 1 } as const,
  }),
});

/**
 * The step stool: the rustic shelf's shape holding a person instead of
 * paint cans — two stout sides stand on edge (crosscut stringers or
 * thick hardwood), two treads lie flat across them, the top tread up
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
        thickness: [3, 4],
        quantity: 1,
      } as InputMaterialWithQuantity<Board>,
      part: { widthIn: 6, lengthIn: 24, thicknessQ: 3 } as const,
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
        thickness: [1, 2],
        quantity: 1,
      } as InputMaterialWithQuantity<Board>,
      part: { widthIn: 4, lengthIn: 24, thicknessQ: 1 } as const,
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

const BLUEPRINTS: Partial<Record<FinishedProductType, ProductBlueprint>> = {
  rusticShelf: RUSTIC_SHELF_BLUEPRINT,
  crate: CRATE_BLUEPRINT,
  planterBox: PLANTER_BOX_BLUEPRINT,
  stepStool: STEP_STOOL_BLUEPRINT,
  bookshelf: BOOKSHELF_BLUEPRINT,
};

/** The blueprint behind an assembled product type, or null. */
export function productBlueprintFor(
  type: string | undefined,
): ProductBlueprint | null {
  return (type && BLUEPRINTS[type as FinishedProductType]) || null;
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
): ReadonlyArray<{ slot: BlueprintSlot; material: Board }> {
  const pool = [...materials];
  return blueprint.slots.map((slot) => {
    const index = pool.findIndex((material) =>
      materialMeetsInput(material, slot.requirement),
    );
    if (index === -1) {
      throw new Error(
        `No staged piece fits the ${slot.role} slot of ${blueprint.productType}`,
      );
    }
    const material = pool[index] as Board;
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
  const matched = matchPartsToSlots(blueprint, materials);
  const parts: AssembledPart[] = matched.map(({ slot, material }) => ({
    slot: slot.id,
    species: material.species,
    width: material.width,
    length: material.length,
    thickness: material.thickness,
    // A sanded board stays sanded in the finished piece — the bookshelf
    // is built from surfaced stock, not pallet wood
    surface: material.surface,
    seed: material.id,
  }));
  return makeMaterial<FinishedProduct>({
    type: blueprint.productType,
    species: dominantSpecies(parts),
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
    width: slot.part.widthIn,
    length: slot.part.lengthIn,
    thickness: slot.part.thicknessQ,
    ...(slot.requirement.surface?.[0]
      ? { surface: slot.requirement.surface[0] }
      : {}),
    seed: `${product.id}:${slot.id}`,
  }));
}
