import { ConsumableId } from "./Consumable";
import { MachineId } from "./Machine";
import { MaterialInstance } from "./Materials";
import { UpgradeId } from "./Upgrade";

/**
 * The shopping cart: what a store trip has picked off the shelves and
 * not paid for yet.
 *
 * Nothing here transacts. A line is a note of what the register will be
 * asked to ring up, and every kind of line maps to exactly one of the
 * buy actions the store already had — which is the point of the split:
 * the buy actions stay the one place that knows what a purchase *does*
 * (into the bed, into a crate, into the shop's supply), and the cart
 * only decides *when*. See game-actions/cart-actions.ts for the fold.
 *
 * The cart hangs off the trip itself (see ShoppingTrip in Person.ts), so
 * driving away is what empties it — there is no cart to clean up once
 * you're home, and a reload mid-trip finds it where you left it.
 *
 * Each line carries the price it was shelved at, so the running total
 * and the receipt never re-derive a price from a registry that a
 * reputation tier may have moved under them.
 */
export type CartLine =
  /** Boards, sheets, and tools — everything that rides home as an object. */
  | {
      readonly kind: "material";
      readonly material: MaterialInstance;
      readonly price: number;
    }
  | {
      readonly kind: "machine";
      readonly machineTypeId: MachineId;
      readonly price: number;
    }
  | {
      readonly kind: "consumablePack";
      readonly consumableId: ConsumableId;
      readonly price: number;
    }
  | {
      readonly kind: "upgrade";
      readonly upgradeId: UpgradeId;
      readonly price: number;
    }
  | { readonly kind: "clamp"; readonly price: number }
  | { readonly kind: "broom"; readonly price: number }
  | { readonly kind: "shopVac"; readonly price: number };

/** Kinds the shop can only ever own one of — two in a cart is a mistake. */
const ONE_TO_A_SHOP: ReadonlyArray<CartLine["kind"]> = ["broom", "shopVac"];

export function isOneToAShop(line: CartLine): boolean {
  return ONE_TO_A_SHOP.includes(line.kind);
}

export function cartTotal(cart: ReadonlyArray<CartLine>): number {
  return cart.reduce((sum, line) => sum + line.price, 0);
}

/**
 * What makes two lines the same product. Material ids are dropped — two
 * boards off the same tile are two distinct objects with distinct ids,
 * and a cart that listed them separately would be unreadable.
 */
export function cartLineKey(line: CartLine): string {
  return JSON.stringify(line, (key, value) =>
    key === "id" ? undefined : value,
  );
}

/** One product's worth of cart, however many of it were picked up. */
export type CartGroup = {
  readonly key: string;
  /** The first line of the group: what to draw, and what another one copies. */
  readonly line: CartLine;
  readonly count: number;
  /** Where this group's lines sit in the cart; the last is what "−" drops. */
  readonly indices: ReadonlyArray<number>;
  /** What the group costs all together. */
  readonly price: number;
};

/**
 * The cart as the shopper reads it: one row per product with a count,
 * in the order things were first picked up.
 */
export function groupCartLines(
  cart: ReadonlyArray<CartLine>,
): ReadonlyArray<CartGroup> {
  const groups = new Map<string, CartGroup>();
  cart.forEach((line, index) => {
    const key = cartLineKey(line);
    const existing = groups.get(key);
    groups.set(
      key,
      existing
        ? {
            ...existing,
            count: existing.count + 1,
            indices: [...existing.indices, index],
            price: existing.price + line.price,
          }
        : { key, line, count: 1, indices: [index], price: line.price },
    );
  });
  return [...groups.values()];
}

/** How many of this product are already in the cart. */
export function cartCountOf(
  cart: ReadonlyArray<CartLine>,
  line: CartLine,
): number {
  const key = cartLineKey(line);
  return cart.filter((candidate) => cartLineKey(candidate) === key).length;
}
