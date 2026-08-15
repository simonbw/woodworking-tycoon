import React, { useContext, useMemo } from "react";
import { StoreOverlayLayer } from "../../../components/store-view/StoreOverlayLayer";
import { cartCountOf } from "../../../game/cart";
import { currentCart } from "../../../game/game-actions/cart-actions";
import { tutorialTargets } from "../../../components/tutorial/tutorialTargets";
import { StoreSceneRoot } from "../../scenes/StoreSceneRoot";
import { useGame, useShopState } from "../../useShell";
import { OverlayFrameContext } from "../overlay/OverlayLayer";

/**
 * The old StoreOverlayLayer (imported verbatim — it's props-driven)
 * mounted in the engine's world-pinned overlay: the shelf tags, the
 * chip at whatever the shopper stands at, the storefront sign. Its `At`
 * math positions everything relative to the world origin at the
 * camera's scale, so one wrapper pinned to the OverlayFrame's origin is
 * the whole bridge. Rendered per frame by the OverlayRoot, which is
 * what keeps the tags riding the camera.
 */
export const StoreOverlayBridge: React.FC = () => {
  const game = useGame();
  const gameState = useShopState();
  const frame = useContext(OverlayFrameContext);
  const scene = game.entities.tryGetSingleton(StoreSceneRoot);
  const layout = scene?.layout() ?? null;
  const away = gameState.player.away;

  const cart = useMemo(
    () => (away?.kind === "shopping" ? (currentCart(gameState) ?? []) : []),
    [gameState, away],
  );
  const bayCartCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (!layout) return counts;
    for (const fixture of layout.fixtures) {
      counts.set(fixture.id, cartCountOf(cart, fixture.product.line));
    }
    return counts;
  }, [layout, cart]);

  if (!scene || !layout || away?.kind !== "shopping") return null;

  const interact = scene.checkoutOpen ? null : scene.interact();
  const tutorialIds = new Set(tutorialTargets(gameState).domIds);

  return (
    <div
      className="absolute"
      style={{ left: frame.origin[0], top: frame.origin[1] }}
    >
      <StoreOverlayLayer
        layout={layout}
        scale={frame.scale}
        interact={interact}
        bayCartCounts={bayCartCounts}
        tutorialIds={tutorialIds}
        armedLeave={scene.armedLeave}
        onAddFromBay={(bay) => scene.addFromBay(bay)}
        onTakeCart={() => {
          scene.pressE();
        }}
        onOpenCheckout={() => scene.openCheckout()}
      />
    </div>
  );
};
