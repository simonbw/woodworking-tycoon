/**
 * Shop supplies: glue, fasteners, finishes — things recipes use up. Unlike
 * materials, consumables aren't physical objects you carry around the shop;
 * they live in one shop-wide stock (GameState.consumables) and operations
 * draw from it directly. Bought by the pack in the store's supplies aisle;
 * some come back as salvage (nails from dismantled pallets).
 */
export interface ConsumableType {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Display unit for amounts, e.g. "nails" or "oz". */
  readonly unit: string;
  /** The store SKU: how much one purchase adds, and what it costs. */
  readonly packName: string;
  readonly packSize: number;
  readonly packPrice: number;
}

export const CONSUMABLE_TYPES = {
  nails: {
    id: "nails",
    name: "Nails",
    description: "Common nails. Rustic joinery runs on them.",
    unit: "nails",
    packName: "Box of Nails",
    packSize: 50,
    packPrice: 6,
  },
  mineralOil: {
    id: "mineralOil",
    name: "Mineral Oil",
    description: "Food-safe board oil. The only finish a cutting board wants.",
    unit: "oz",
    packName: "Mineral Oil Bottle",
    packSize: 16,
    packPrice: 10,
  },
} satisfies { [id: string]: ConsumableType };

export type ConsumableId = keyof typeof CONSUMABLE_TYPES;

/** A quantity of one consumable — a recipe cost, or a salvage yield. */
export interface ConsumableAmount {
  readonly id: ConsumableId;
  readonly amount: number;
}

/** The shop-wide stock of every consumable. */
export type ConsumableStock = Readonly<Record<ConsumableId, number>>;

export const NO_CONSUMABLES: ConsumableStock = {
  nails: 0,
  mineralOil: 0,
};

export function hasConsumables(
  stock: ConsumableStock,
  costs: ReadonlyArray<ConsumableAmount>,
): boolean {
  return costs.every((cost) => (stock[cost.id] ?? 0) >= cost.amount);
}

export function subtractConsumables(
  stock: ConsumableStock,
  costs: ReadonlyArray<ConsumableAmount>,
): ConsumableStock {
  return costs.reduce(
    (next, cost) => ({
      ...next,
      [cost.id]: (next[cost.id] ?? 0) - cost.amount,
    }),
    stock,
  );
}

export function addConsumables(
  stock: ConsumableStock,
  additions: ReadonlyArray<ConsumableAmount>,
): ConsumableStock {
  return additions.reduce(
    (next, addition) => ({
      ...next,
      [addition.id]: (next[addition.id] ?? 0) + addition.amount,
    }),
    stock,
  );
}
