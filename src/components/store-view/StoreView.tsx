import type { Container } from "pixi.js";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cartCountOf } from "../../game/cart";
import {
  addToCartAction,
  checkoutAction,
  currentCart,
  removeFromCartAction,
} from "../../game/game-actions/cart-actions";
import { returnFromStoreAction } from "../../game/game-actions/door-actions";
import { cartTotal } from "../../game/cart";
import { LUMBER_CHANNELS } from "../../game/lumberStock";
import { ShoppingTrip } from "../../game/Person";
import {
  cartIndexToReturn,
  resolveStoreInteract,
} from "../../game/store-interact";
import {
  ShelfBay,
  StoreLayout,
  cabStandCell,
  fixtureStandCell,
  registerStandCell,
  storeLayout,
} from "../../game/store-layout";
import { getMaterialFullName } from "../../game/material-helpers";
import { usePaused } from "../PauseContext";
import { useModalOpen } from "../shortcuts/ShortcutProvider";
import { useHeadHome } from "../trip/TripTransitionLayer";
import { StoreCartReadout } from "../shopping/StoreCart";
import { CameraLayer } from "../shop-view/CameraLayer";
import { FootstepSoundLayer } from "../shop-view/FootstepSoundLayer";
import { PersonSprite } from "../shop-view/PersonSprite";
import { cellToPixel } from "../shop-view/shop-scale";
import { HeldMovementListener } from "../world-view/heldMovementInput";
import {
  SceneView,
  WorldOverlayBox,
  WorldScene,
} from "../world-view/WorldScene";
import { useApplyGameAction, useGameState } from "../useGameState";
import { Vector } from "../../game/Vectors";
import { StoreEnvironmentLayer } from "./StoreEnvironmentLayer";
import { StoreFixturesLayer } from "./StoreFixturesLayer";
import { StoreKeyboardShortcuts } from "./StoreKeyboardShortcuts";
import { StoreMerchandiseLayer } from "./StoreMerchandiseLayer";
import { StoreOverlayLayer } from "./StoreOverlayLayer";
import { StorePushCartSprite } from "./StorePushCartSprite";
import { StoreShopperLayer } from "./StoreShopperLayer";
import { StoreWalkLayer } from "./StoreWalkLayer";

/**
 * The store as a walkable place: the sales floor drawn on the same
 * canvas machinery the shop floor uses (WorldScene), swapped in for
 * ShopView while a shopping trip is on screen (see HomePage). Everything
 * about *this* venue is here — its planogram-driven world, its camera
 * down to the parking lot, its register — while the walking body, the
 * fit, and the renderer are the shared pieces.
 *
 * How long the trip takes is how long you spend in the aisles: the shop
 * back home keeps ticking at the idle creep (time-flow.ts), and heading
 * home from the cab is what ends it.
 */

/** Ground kept visible around the building when fitting. */
const STORE_APRON = cellToPixel(1.5);

/** How long an armed "leave the cart behind?" waits before disarming. */
const CONFIRM_TIMEOUT_MS = 5000;

export const StoreView: React.FC = () => {
  const gameState = useGameState();
  const away = gameState.player.away;
  if (away?.kind !== "shopping") {
    return null;
  }
  return <StoreScene trip={away} />;
};

const StoreScene: React.FC<{ trip: ShoppingTrip }> = ({ trip }) => {
  const gameState = useGameState();
  const applyAction = useApplyGameAction();
  const { paused } = usePaused();
  const modalOpen = useModalOpen();
  const beginReturn = useHeadHome();

  // The floor plan only moves when what's stocked moves.
  const layout = useMemo(
    () => storeLayout(trip.store, gameState),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the layout
    // reads exactly these slices of state
    [trip.store, gameState.reputation, gameState.broomOwned, gameState.shopVac],
  );

  const interact = resolveStoreInteract(gameState, layout);
  const cart = currentCart(gameState) ?? [];
  const total = cartTotal(cart);
  const overdrawn = total > gameState.money;

  // ---- The armed "leave the cart behind?" ----
  const [armedLeave, setArmedLeave] = useState(false);
  useEffect(() => {
    if (!armedLeave) return;
    if (cart.length === 0) {
      setArmedLeave(false);
      return;
    }
    const timer = setTimeout(() => setArmedLeave(false), CONFIRM_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [armedLeave, cart.length]);
  // Stepping away from the cab disarms it too.
  useEffect(() => {
    if (armedLeave && !interact?.atCab) {
      setArmedLeave(false);
    }
  }, [armedLeave, interact?.atCab]);

  const onAddFromBay = useCallback(
    (bay: ShelfBay) => applyAction(addToCartAction(bay.product.line)),
    [applyAction],
  );
  const onReturnToBay = useCallback(
    (bay: ShelfBay) => {
      applyAction((state) => {
        const index = cartIndexToReturn(state, bay);
        return index === null ? state : removeFromCartAction(index)(state);
      });
    },
    [applyAction],
  );
  const onCheckout = useCallback(() => {
    applyAction(checkoutAction());
  }, [applyAction]);
  const onLeave = useCallback(() => {
    if (cart.length > 0 && !armedLeave) {
      setArmedLeave(true);
      return;
    }
    setArmedLeave(false);
    beginReturn(() => applyAction(returnFromStoreAction()));
  }, [cart.length, armedLeave, beginReturn, applyAction]);

  // What each bay's tag calls out as already in the cart.
  const bayCartCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const fixture of layout.fixtures) {
      counts.set(fixture.id, cartCountOf(cart, fixture.product.line));
    }
    return counts;
  }, [layout, cart]);

  // The ambient shoppers' positions, shared with the walk layer so
  // they're solid to the body.
  const shoppersRef = useRef<ReadonlyArray<Vector>>([]);

  // The camera's two hands, exactly as the shop wires them.
  const cameraContainerRef = useRef<Container>(null);
  const overlayScrollRef = useRef<HTMLDivElement>(null);

  // Test-only hooks: the specs walk the same floor the player does, and
  // these are how they find a shelf by the name on its tag.
  useEffect(() => {
    const hooks = window as unknown as Record<string, unknown>;
    hooks.__STORE_LAYOUT__ = layout;
    hooks.__STORE_POINTS__ = {
      register: registerStandCell(layout),
      cab: cabStandCell(layout),
      spawn: layout.spawn.cell,
    };
    hooks.__FIND_SHELF__ = (product: string) => findShelf(layout, product);
    return () => {
      delete hooks.__STORE_LAYOUT__;
      delete hooks.__STORE_POINTS__;
      delete hooks.__FIND_SHELF__;
    };
  }, [layout]);

  const width = cellToPixel(layout.interior[0]);
  const height = cellToPixel(layout.interior[1]);

  const renderWorld = (view: SceneView) => {
    const { scale, offsetX, offsetY } = view;
    // The camera follows the shopper everywhere — the aisles run taller
    // than a screen, so unlike the shop there is no fitted framing to
    // hold indoors. scrollMin reaches the back wall (the centered fit of
    // a too-tall world hangs the origin above the viewport), scrollMax
    // the far edge of the lot.
    const scrollMin = Math.min(0, offsetY / scale);
    const scrollMax = Math.max(
      scrollMin,
      cellToPixel(layout.worldSize[1]) - (view.height - offsetY) / scale,
    );
    const worldViewport = {
      left: -offsetX / scale,
      top: scrollMin - offsetY / scale,
      right: (view.width - offsetX) / scale,
      bottom: (view.height - offsetY) / scale + scrollMax,
    };

    return (
      <>
        <CameraLayer
          worldRef={cameraContainerRef}
          overlayRef={overlayScrollRef}
          scrollStartY={-1}
          scrollMax={scrollMax}
          scrollMin={scrollMin}
          offsetY={offsetY}
          viewHeight={view.height}
          scale={scale}
        />
        <pixiContainer x={offsetX} y={offsetY} scale={scale}>
          <pixiContainer ref={cameraContainerRef}>
            <StoreEnvironmentLayer layout={layout} viewport={worldViewport} />
            <StoreFixturesLayer
              layout={layout}
              targetId={interact?.fixture?.id ?? null}
              registerTargeted={interact?.atRegister ?? false}
            />
            <StoreMerchandiseLayer layout={layout} />
            <StoreShopperLayer
              layout={layout}
              paused={paused}
              shoppersRef={shoppersRef}
            />
            <StoreWalkLayer
              layout={layout}
              paused={paused}
              shoppersRef={shoppersRef}
            />
            <FootstepSoundLayer />
            <StorePushCartSprite />
            <PersonSprite person={gameState.player} />
          </pixiContainer>
        </pixiContainer>
      </>
    );
  };

  return (
    <>
      <StoreKeyboardShortcuts
        interact={interact}
        onAddFromBay={onAddFromBay}
        onReturnToBay={onReturnToBay}
        onCheckout={onCheckout}
        onLeave={onLeave}
      />
      <HeldMovementListener enabled={!modalOpen} />
      <WorldScene
        worldWidth={width}
        worldHeight={height}
        apron={STORE_APRON}
        overlay={(view) => (
          <>
            <WorldOverlayBox
              view={view}
              className="absolute z-30 pointer-events-none"
            >
              <div ref={overlayScrollRef} className="absolute inset-0">
                <StoreOverlayLayer
                  layout={layout}
                  scale={view.scale}
                  interact={interact}
                  bayCartCounts={bayCartCounts}
                  armedLeave={armedLeave}
                  onAddFromBay={onAddFromBay}
                  onCheckout={onCheckout}
                />
              </div>
            </WorldOverlayBox>
            {/* The running total, floating with the rest of the HUD
                chrome in the corner the aisles never reach — the hover
                panel is where quantities change. */}
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
          </>
        )}
      >
        {renderWorld}
      </WorldScene>
    </>
  );
};

/**
 * Find the shelf a product hangs on, by the name printed on its tag —
 * the same names the Add-to-cart buttons carry, so a spec that shopped
 * the old overlay finds the same product on the new floor. Category
 * names still answer too: a channel's name finds its first pile, "Sheet
 * Goods" the first sheet pile, and a sheet kind its full-size pile.
 */
function findShelf(
  layout: StoreLayout,
  product: string,
): { kind: "bay"; id: string; cell: Vector } | null {
  const found = (fixture: ShelfBay | undefined) =>
    fixture
      ? { kind: "bay" as const, id: fixture.id, cell: fixtureStandCell(fixture) }
      : null;

  for (const fixture of layout.fixtures) {
    if (fixture.product.name === product) {
      return found(fixture);
    }
  }
  for (const fixture of layout.fixtures) {
    const line = fixture.product.line;
    if (
      line.kind === "material" &&
      getMaterialFullName(line.material) === product
    ) {
      return found(fixture);
    }
  }
  // A lumber channel's name finds the front pile of its group.
  const channel = LUMBER_CHANNELS.find((candidate) => candidate.name === product);
  if (channel) {
    return found(
      layout.fixtures.find((fixture) =>
        fixture.id.startsWith(`lumber:${channel.id}:`),
      ),
    );
  }
  if (product === "Sheet Goods") {
    return found(
      layout.fixtures.find((fixture) => fixture.id.startsWith("sheet:")),
    );
  }
  // A sheet kind alone ("Shop Plywood") finds its full-sheet pile.
  return found(
    layout.fixtures.find(
      (fixture) =>
        fixture.id.startsWith("sheet:") &&
        fixture.product.name.startsWith(`${product} — `),
    ),
  );
}
