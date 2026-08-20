import React from "react";
import { StoreCheckoutModal } from "../../../components/store-view/StoreCheckoutModal";
import { cartTotal } from "../../../game/cart";
import { currentCart } from "../../../game/game-actions/cart-actions";
import { StoreSceneRoot } from "../../scenes/StoreSceneRoot";
import { useGame, useShellVersion, useShopState } from "../../useShell";
import { StoreCartReadout } from "./StoreCart";

/**
 * The walkable store's screen-anchored chrome — the pieces the old
 * StoreView mounted beside its canvas: the running cart total floating
 * in the corner the aisles never reach (the hover panel is where
 * quantities change), and the register's receipt card
 * (StoreCheckoutModal, imported verbatim — it's props-driven). Rendered
 * by EngineHud while the store venue is up; the world-pinned tags and
 * chips live in the OverlayRoot instead.
 */
export const StoreScreen: React.FC = () => {
  const game = useGame();
  useShellVersion();
  const gameState = useShopState();
  const scene = game.entities.tryGetSingleton(StoreSceneRoot);
  if (!scene || gameState.player.away?.kind !== "shopping") return null;

  const cart = currentCart(gameState) ?? [];
  const total = cartTotal(cart);
  const overdrawn = total > gameState.money;

  return (
    <>
      {/* The running total, floating with the rest of the HUD chrome in
          the corner the aisles never reach. */}
      <div className="absolute bottom-6 left-6 z-40">
        <div className="pointer-events-auto rounded-sm border border-store-orange-dark bg-white/95 px-3 py-1.5 shadow-md">
          <StoreCartReadout
            cart={cart}
            total={total}
            overdrawn={overdrawn}
            mutedClassName="text-store-orange-dark"
            overdrawnClassName="text-ink-red"
          />
        </div>
      </div>
      {scene.checkoutOpen && (
        <StoreCheckoutModal
          cart={cart}
          total={total}
          overdrawn={overdrawn}
          onBuy={() => scene.buy()}
          onCancel={() => scene.closeCheckout()}
        />
      )}
    </>
  );
};
