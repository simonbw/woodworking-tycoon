import { useCallback, useEffect, useState } from "react";
import { CartLine, cartCountOf, cartTotal } from "../../../game/cart";
import { currentCart } from "../../../game/game-actions/cart-actions";
import { checkout } from "../../../sim/commands/cart-commands";
import { SceneDirector } from "../../scenes/SceneDirector";
import { useGame, useShopState } from "../../useShell";

/** How long the armed "Leave cart behind?" button waits before disarming. */
const CONFIRM_TIMEOUT_MS = 5000;

/**
 * Everything both store overlays need to run a trip's till: the cart,
 * what it costs, and the two ways out. Shared so Orange Box and Sawyer &
 * Sons can't drift apart on the part that handles money.
 *
 * The two ways out differ in one place only. Checking out is one press —
 * pay and drive home together — while walking out on a full cart asks
 * first: Escape is bound to Head Home, and an unlucky one would
 * otherwise put a whole afternoon of shopping back on the shelves. An
 * empty cart has nothing to lose, so it leaves on the first press.
 */
export function useStoreTrip() {
  const gameState = useShopState();
  const game = useGame();

  const cart = currentCart(gameState) ?? [];
  const total = cartTotal(cart);
  /** The cart outruns the wallet: shown in red, and the register refuses. */
  const overdrawn = total > gameState.money;

  const [confirmingLeave, setConfirmingLeave] = useState(false);

  const leave = useCallback(() => {
    setConfirmingLeave(false);
    game.entities.getSingleton(SceneDirector).requestDriveHome();
  }, [game]);

  /** Head Home. Arms a confirmation first when a cart would be left behind. */
  const requestLeave = useCallback(() => {
    if (cart.length === 0 || confirmingLeave) {
      leave();
      return;
    }
    setConfirmingLeave(true);
  }, [cart.length, confirmingLeave, leave]);

  const checkOutAndLeave = useCallback(() => {
    setConfirmingLeave(false);
    if (!checkout(game)) return;
    game.entities.getSingleton(SceneDirector).requestDriveHome();
  }, [game]);

  // An armed button that stays armed is a trap: empty the cart (or just
  // go back to shopping) and the next Escape shouldn't skip the ask.
  useEffect(() => {
    if (!confirmingLeave) {
      return;
    }
    if (cart.length === 0) {
      setConfirmingLeave(false);
      return;
    }
    const timer = setTimeout(
      () => setConfirmingLeave(false),
      CONFIRM_TIMEOUT_MS,
    );
    return () => clearTimeout(timer);
  }, [confirmingLeave, cart.length]);

  return {
    cart,
    total,
    overdrawn,
    canCheckOut: cart.length > 0 && !overdrawn,
    confirmingLeave,
    requestLeave,
    checkOutAndLeave,
  };
}

/**
 * How many of this exact product the cart already holds — the "2 in
 * cart" line on a shelf tag. Every tile builds the line it would add and
 * asks with it, so the count and the button can't disagree about what
 * counts as the same product (see cartLineKey).
 */
export function useCartCount(line: CartLine): number {
  const gameState = useShopState();
  return cartCountOf(currentCart(gameState) ?? [], line);
}
