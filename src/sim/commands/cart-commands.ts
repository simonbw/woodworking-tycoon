import { Game } from "../../core/Game";
import { CartLine, cartTotal, isOneToAShop } from "../../game/cart";
import { makeMaterial } from "../../game/material-helpers";
import { MaterialInstance } from "../../game/Materials";
import { Player } from "../entities/Player";
import { Wallet } from "../singletons/Wallet";
import { buyBroom, buyShopVac } from "./cleaning-commands";
import {
  buyClamp,
  buyConsumablePack,
  buyMachine,
  buyMaterial,
  buyUpgrade,
} from "./store-commands";

/**
 * The cart's verbs, ported from the old `cart-actions.ts`: picking things
 * off the shelf, putting them back, and the one moment money changes
 * hands.
 *
 * The arrangement carries over whole: the purchase commands (see
 * store-commands.ts, plus the broom's and the vac's in
 * cleaning-commands.ts) still own what a purchase *does*, and checkout is
 * a fold of the cart through exactly those commands. Nothing here
 * duplicates a price, a destination, or a milestone check.
 *
 * A cart may exceed the wallet — the register is what refuses, not the
 * shelf, the same way it works in a real store (the store's total goes
 * red and Check Out greys out). See cart.ts for the line shapes.
 */

/** Rings a line up through its own purchase command. */
function buyLine(game: Game, line: CartLine): boolean {
  switch (line.kind) {
    case "material":
      return buyMaterial(game, line.material, line.price);
    case "machine":
      return buyMachine(game, line.machineTypeId, line.price);
    case "consumablePack":
      return buyConsumablePack(game, line.consumableId);
    case "upgrade":
      return buyUpgrade(game, line.upgradeId);
    case "clamp":
      return buyClamp(game);
    case "broom":
      return buyBroom(game);
    case "shopVac":
      return buyShopVac(game);
  }
}

function player(game: Game): Player {
  return game.entities.getSingleton(Player);
}

/** The cart of the trip in progress, or null when the player isn't shopping. */
export function currentCart(game: Game): ReadonlyArray<CartLine> | null {
  const away = player(game).away;
  return away?.kind === "shopping" ? away.cart : null;
}

function withCart(game: Game, cart: ReadonlyArray<CartLine>): void {
  const thePlayer = player(game);
  if (thePlayer.away?.kind !== "shopping") {
    return;
  }
  thePlayer.away = { ...thePlayer.away, cart };
}

/** Pull a flatbed from the corral by the entrance. No-op off a shopping
 * trip; taking a second cart is taking the one you already have. */
export function takeCart(game: Game): boolean {
  const thePlayer = player(game);
  const away = thePlayer.away;
  if (away?.kind !== "shopping" || away.hasCart) {
    return false;
  }
  thePlayer.away = { ...away, hasCart: true };
  return true;
}

/**
 * Take another one off the shelf. Material lines are re-stamped with a
 * fresh id on the way in, so picking up a second identical board really
 * is a second board — the caller can hand the same line back for the
 * cart's "+" without minting one itself.
 */
export function addToCart(game: Game, line: CartLine): boolean {
  const cart = currentCart(game);
  if (!cart) {
    console.warn("Tried to add to a cart while not at a store");
    return false;
  }
  // Nobody needs two brooms, and the shelf tag disappears once one is
  // owned — so a second in the cart could only ever be a misclick
  if (isOneToAShop(line) && cart.some((other) => other.kind === line.kind)) {
    return false;
  }
  withCart(game, [...cart, freshLine(line)]);
  return true;
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
export function removeFromCart(game: Game, index: number): boolean {
  const cart = currentCart(game);
  if (!cart || index < 0 || index >= cart.length) {
    return false;
  }
  withCart(game, [...cart.slice(0, index), ...cart.slice(index + 1)]);
  return true;
}

/** Abandon the cart at the end of an aisle. */
export function clearCart(game: Game): boolean {
  const cart = currentCart(game);
  if (!cart) {
    return false;
  }
  withCart(game, []);
  return true;
}

/** Whether the register would take the cart as it stands. */
export function canCheckOut(game: Game): boolean {
  const cart = currentCart(game);
  return (
    cart !== null &&
    cart.length > 0 &&
    cartTotal(cart) <= game.entities.getSingleton(Wallet).money
  );
}

/**
 * Ring the cart up: every line through its own purchase command, in the
 * order it was picked up, then an empty cart. All or nothing — a cart
 * that outruns the wallet is refused whole rather than part-filled, so
 * the total on the header is always what checkout will cost.
 */
export function checkout(game: Game): boolean {
  const cart = currentCart(game);
  if (!cart) {
    console.warn("Tried to check out while not at a store");
    return false;
  }
  if (cartTotal(cart) > game.entities.getSingleton(Wallet).money) {
    console.warn("Tried to check out with a cart the wallet can't cover");
    return false;
  }
  for (const line of cart) {
    buyLine(game, line);
  }
  withCart(game, []);
  return true;
}
