import { InputMaterialWithQuantity } from "../Machine";
import { ConsumableAmount, ConsumableId } from "../Consumable";
import {
  AssembledPart,
  Board,
  BoardDimension,
  FinishedProduct,
  FinishedProductType,
  MaterialInstance,
  Species,
} from "../Materials";
import { makeMaterial, materialMeetsInput } from "../material-helpers";
import { INCHES_PER_FOOT } from "../shop-scale";

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
    readonly lengthFt: BoardDimension;
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
  const lengthIn = slot.part.lengthFt * INCHES_PER_FOOT;
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
        length: [4],
        quantity: 1,
      } as InputMaterialWithQuantity<Board>,
      part: { widthIn: 6, lengthFt: 4, thicknessQ: 3 } as const,
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
        length: [3],
        quantity: 1,
      } as InputMaterialWithQuantity<Board>,
      part: { widthIn: 4, lengthFt: 3, thicknessQ: 1 } as const,
      xIn,
      yIn: 18,
      angleDeg: 0,
      layer: 1,
    })),
  ],
});

const BLUEPRINTS: Partial<Record<FinishedProductType, ProductBlueprint>> = {
  rusticShelf: RUSTIC_SHELF_BLUEPRINT,
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
    length: slot.part.lengthFt,
    thickness: slot.part.thicknessQ,
    seed: `${product.id}:${slot.id}`,
  }));
}
