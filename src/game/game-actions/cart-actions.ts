import { CartLine, isOneToAShop } from "../cart";
import { GameAction, GameState } from "../GameState";
import { makeMaterial } from "../material-helpers";
import { MaterialInstance } from "../Materials";

/**
 * Reading and filling the shopping cart of a trip in progress. What a
 * purchase *does* belongs to `sim/commands/store-commands.ts`; nothing
 * here duplicates a price, a destination, or a milestone check.
 *
 * A cart may exceed the wallet — the register is what refuses, not the
 * shelf, the same way it works in a real store (the store's total goes
 * red and Check Out greys out). See cart.ts for the line shapes.
 */

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
