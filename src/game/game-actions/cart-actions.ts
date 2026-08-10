import { CartLine, cartTotal, isOneToAShop } from "../cart";
import { GameAction, GameState } from "../GameState";
import { makeMaterial } from "../material-helpers";
import { MaterialInstance } from "../Materials";
import { buyBroomAction } from "./dust-actions";
import { returnFromStoreAction } from "./door-actions";
import { buyShopVacAction } from "./shop-vac-actions";
import {
  buyClampAction,
  buyConsumablePackAction,
  buyMachineAction,
  buyMaterialAction,
} from "./store-actions";
import { buyUpgradeAction } from "./upgrade-actions";

/**
 * The cart's verbs: picking things off the shelf, putting them back, and
 * the one moment money changes hands.
 *
 * This module sits above every buy action and is imported by none of
 * them, which is the whole arrangement: `store-actions` (and its
 * siblings for the broom, the vac, and upgrades) still own what a
 * purchase *does*, and checkout is a fold of the cart through exactly
 * those actions. Nothing here duplicates a price, a destination, or a
 * milestone check.
 *
 * A cart may exceed the wallet — the register is what refuses, not the
 * shelf, the same way it works in a real store (the store's total goes
 * red and Check Out greys out). See cart.ts for the line shapes.
 */

/** The buy action a line rings up as. */
function buyActionForLine(line: CartLine): GameAction {
  switch (line.kind) {
    case "material":
      return buyMaterialAction(line.material, line.price);
    case "machine":
      return buyMachineAction(line.machineTypeId, line.price);
    case "consumablePack":
      return buyConsumablePackAction(line.consumableId);
    case "upgrade":
      return buyUpgradeAction(line.upgradeId);
    case "clamp":
      return buyClampAction();
    case "broom":
      return buyBroomAction();
    case "shopVac":
      return buyShopVacAction();
  }
}

/** The cart of the trip in progress, or null when the player isn't shopping. */
export function currentCart(
  gameState: GameState,
): ReadonlyArray<CartLine> | null {
  return gameState.player.away?.kind === "shopping"
    ? gameState.player.away.cart
    : null;
}

function withCart(
  gameState: GameState,
  cart: ReadonlyArray<CartLine>,
): GameState {
  if (gameState.player.away?.kind !== "shopping") {
    return gameState;
  }
  return {
    ...gameState,
    player: {
      ...gameState.player,
      away: { ...gameState.player.away, cart },
    },
  };
}

/**
 * Take another one off the shelf. Material lines are re-stamped with a
 * fresh id on the way in, so picking up a second identical board really
 * is a second board — the caller can hand the same line back for the
 * cart's "+" without minting one itself.
 */
export function addToCartAction(line: CartLine): GameAction {
  return (gameState) => {
    const cart = currentCart(gameState);
    if (!cart) {
      console.warn("Tried to add to a cart while not at a store");
      return gameState;
    }
    // Nobody needs two brooms, and the shelf tag disappears once one is
    // owned — so a second in the cart could only ever be a misclick
    if (isOneToAShop(line) && cart.some((other) => other.kind === line.kind)) {
      return gameState;
    }
    return withCart(gameState, [...cart, freshLine(line)]);
  };
}

/** A line's own copy: a distinct object needs a distinct id. */
function freshLine(line: CartLine): CartLine {
  if (line.kind !== "material") {
    return line;
  }
  const { id: _id, ...withoutId } = line.material as MaterialInstance & {
    id: string;
  };
  return {
    ...line,
    material: makeMaterial(withoutId as Omit<MaterialInstance, "id">),
  };
}

/** Put one back on the shelf, by its place in the cart. */
export function removeFromCartAction(index: number): GameAction {
  return (gameState) => {
    const cart = currentCart(gameState);
    if (!cart || index < 0 || index >= cart.length) {
      return gameState;
    }
    return withCart(gameState, [
      ...cart.slice(0, index),
      ...cart.slice(index + 1),
    ]);
  };
}

/** Abandon the cart at the end of an aisle. */
export function clearCartAction(): GameAction {
  return (gameState) => {
    const cart = currentCart(gameState);
    return cart ? withCart(gameState, []) : gameState;
  };
}

/** Whether the register would take the cart as it stands. */
export function canCheckOut(gameState: GameState): boolean {
  const cart = currentCart(gameState);
  return cart !== null && cart.length > 0 && cartTotal(cart) <= gameState.money;
}

/**
 * Ring the cart up: every line through its own buy action, in the order
 * it was picked up, then an empty cart. All or nothing — a cart that
 * outruns the wallet is refused whole rather than part-filled, so the
 * total on the header is always what checkout will cost.
 */
export function checkoutAction(): GameAction {
  return (gameState) => {
    const cart = currentCart(gameState);
    if (!cart) {
      console.warn("Tried to check out while not at a store");
      return gameState;
    }
    if (cartTotal(cart) > gameState.money) {
      console.warn("Tried to check out with a cart the wallet can't cover");
      return gameState;
    }
    const rungUp = cart.reduce(
      (state, line) => buyActionForLine(line)(state),
      gameState,
    );
    return withCart(rungUp, []);
  };
}

/**
 * The one button at the register: pay for the cart and drive home. There
 * is no checking out and carrying on shopping — the load goes in the bed
 * and the bed goes home, which is also what stops a trip from becoming a
 * till the player rings up over and over.
 */
export function checkOutAndReturnAction(
  rng: () => number = Math.random,
): GameAction {
  return (gameState) => returnFromStoreAction(rng)(checkoutAction()(gameState));
}
