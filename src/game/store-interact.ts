import { cartCountOf, cartLineKey, cartTotal } from "./cart";
import { currentCart } from "./game-actions/cart-actions";
import { GameState } from "./GameState";
import {
  ShelfBay,
  StoreFixture,
  StoreLayout,
  withinStoreReach,
} from "./store-layout";
import { Vector } from "./Vectors";

/**
 * What the keys can do where the shopper stands — interact.ts's sibling
 * for the store floor. One resolver shared by the keyboard handler and
 * the shelf chips, so the hint next to the player always names exactly
 * what a press will do (the same contract the shop floor keeps).
 *
 * The verbs are the issue's: at a bay, F puts one in the cart and E puts
 * one back; at a rack the card opens; the register rings the cart up;
 * the truck's cab is the way home. Zones are resolved nearest-first, so
 * standing between two bays acts on the closer one.
 */

export interface StoreInteract {
  /** The nearest fixture in reach, if any. */
  readonly fixture: StoreFixture | null;
  /** How many of the standing bay's product are in the cart (0 off-bay). */
  readonly inCart: number;
  /** Whether a flatbed has been taken from the corral — shelves only
   * load a cart you're pushing. */
  readonly hasCart: boolean;
  readonly atCorral: boolean;
  readonly atRegister: boolean;
  readonly atCab: boolean;
  /** The cart's damage, for the register chip. */
  readonly total: number;
  readonly cartCount: number;
  /** Whether the register would take the cart: non-empty and covered. */
  readonly canCheckOut: boolean;
}

/** Distance from a cell's center to a rectangle's edge, in cells. */
function distanceToRect(
  position: Vector,
  rect: { min: Vector; max: Vector },
): number {
  const cx = position[0] + 0.5;
  const cy = position[1] + 0.5;
  const dx = Math.max(rect.min[0] - cx, 0, cx - rect.max[0]);
  const dy = Math.max(rect.min[1] - cy, 0, cy - rect.max[1]);
  return Math.hypot(dx, dy);
}

/**
 * Resolve the store floor under the shopper. Null when the player isn't
 * on a walkable store trip at all.
 */
export function resolveStoreInteract(
  gameState: GameState,
  layout: StoreLayout,
): StoreInteract | null {
  const away = gameState.player.away;
  if (away?.kind !== "shopping" || away.store !== layout.store) {
    return null;
  }
  const position = away.position;
  const cart = currentCart(gameState) ?? [];

  let fixture: StoreFixture | null = null;
  let best = Infinity;
  for (const candidate of layout.fixtures) {
    if (!withinStoreReach(position, candidate.rect)) continue;
    const distance = distanceToRect(position, candidate.rect);
    if (distance < best) {
      best = distance;
      fixture = candidate;
    }
  }

  const inCart =
    fixture?.kind === "bay" ? cartCountOf(cart, fixture.product.line) : 0;
  const total = cartTotal(cart);

  return {
    fixture,
    inCart,
    hasCart: away.hasCart,
    atCorral: withinStoreReach(position, layout.corral),
    atRegister: withinStoreReach(position, layout.register),
    atCab: withinStoreReach(position, layout.truckCab),
    total,
    cartCount: cart.length,
    canCheckOut: cart.length > 0 && total <= gameState.money,
  };
}

/**
 * The index removeFromCartAction should drop when E puts one of this
 * bay's product back: the last matching line, so the cart's other lines
 * keep their places. Null when none of it is in the cart.
 */
export function cartIndexToReturn(
  gameState: GameState,
  bay: ShelfBay,
): number | null {
  const cart = currentCart(gameState) ?? [];
  const key = cartLineKey(bay.product.line);
  for (let index = cart.length - 1; index >= 0; index--) {
    if (cartLineKey(cart[index]) === key) {
      return index;
    }
  }
  return null;
}
