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
import { ShoppingTrip } from "../../game/Person";
import {
  cartIndexToReturn,
  resolveStoreInteract,
} from "../../game/store-interact";
import {
  LumberRack,
  SheetRack,
  ShelfBay,
  StoreLayout,
  cabStandCell,
  fixtureStandCell,
  registerStandCell,
  storeLayout,
} from "../../game/store-layout";
import { board } from "../../game/board-helpers";
import {
  getMaterialFullName,
  sheetKindLabel,
} from "../../game/material-helpers";
import { unlockedSheetSkus } from "../../game/sheetStock";
import { usePaused } from "../PauseContext";
import { useModalOpen } from "../shortcuts/ShortcutProvider";
import { useHeadHome } from "../trip/TripTransitionLayer";
import { StoreCartReadout } from "../shopping/StoreCart";
import { CameraLayer } from "../shop-view/CameraLayer";
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
import { StoreOverlayLayer } from "./StoreOverlayLayer";
import { StorePushCartSprite } from "./StorePushCartSprite";
import { StoreRackCard } from "./StoreRackCard";
import { StoreShopperLayer } from "./StoreShopperLayer";
import { StoreWalkLayer } from "./StoreWalkLayer";

/**
 * The store as a walkable place: the sales floor drawn on the same
 * canvas machinery the shop floor uses (WorldScene), swapped in for
 * ShopView while a shopping trip is on screen (see HomePage). Everything
 * about *this* venue is here — its planogram-driven world, its camera
 * down to the parking lot, its rack cards, its register — while the
 * walking body, the fit, and the renderer are the shared pieces.
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

  // ---- The rack card (the size picker) ----
  const [openRackId, setOpenRackId] = useState<string | null>(null);
  const openRack = layout.fixtures.find(
    (fixture) => fixture.kind !== "bay" && fixture.id === openRackId,
  ) as LumberRack | SheetRack | undefined;
  // Walk-away closes the card, the same behavior the shop's small
  // sheets keep.
  useEffect(() => {
    if (openRackId && interact?.fixture?.id !== openRackId) {
      setOpenRackId(null);
    }
  }, [openRackId, interact?.fixture?.id]);

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
  const onBrowseRack = useCallback(
    (rack: LumberRack | SheetRack) => setOpenRackId(rack.id),
    [],
  );
  const onCloseRack = useCallback(() => setOpenRackId(null), []);
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
      if (fixture.kind === "bay") {
        counts.set(fixture.id, cartCountOf(cart, fixture.product.line));
      }
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
    hooks.__FIND_SHELF__ = (product: string) =>
      findShelf(layout, gameState.reputation, product);
    return () => {
      delete hooks.__STORE_LAYOUT__;
      delete hooks.__STORE_POINTS__;
      delete hooks.__FIND_SHELF__;
    };
  }, [layout, gameState.reputation]);

  const width = cellToPixel(layout.interior[0]);
  const height = cellToPixel(layout.interior[1]);

  const renderWorld = (view: SceneView) => {
    const { scale, offsetX, offsetY } = view;
    // The camera can follow the shopper out the doors far enough to see
    // the whole lot — the same formula the shop uses for its driveway.
    const scrollMax = Math.max(
      0,
      cellToPixel(layout.worldSize[1]) - (view.height - offsetY) / scale,
    );
    const worldViewport = {
      left: -offsetX / scale,
      top: -offsetY / scale,
      right: (view.width - offsetX) / scale,
      bottom: (view.height - offsetY) / scale + scrollMax,
    };

    return (
      <>
        <CameraLayer
          worldRef={cameraContainerRef}
          overlayRef={overlayScrollRef}
          scrollStartY={layout.interior[1]}
          scrollMax={scrollMax}
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
        openRackId={openRackId}
        onAddFromBay={onAddFromBay}
        onReturnToBay={onReturnToBay}
        onBrowseRack={onBrowseRack}
        onCloseRack={onCloseRack}
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
                  onBrowseRack={onBrowseRack}
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
            {openRack && (
              <StoreRackCard rack={openRack} onClose={onCloseRack} />
            )}
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
 * the old overlay finds the same product on the new floor.
 */
function findShelf(
  layout: StoreLayout,
  reputation: number,
  product: string,
): { kind: "bay" | "rack"; id: string; cell: Vector } | null {
  for (const fixture of layout.fixtures) {
    if (fixture.kind === "bay" && fixture.product.name === product) {
      return { kind: "bay", id: fixture.id, cell: fixtureStandCell(fixture) };
    }
    // A rack answers to its sign, so a spec can walk to a category the
    // way a shopper reads one off the aisle.
    if (
      (fixture.kind === "lumberRack" && fixture.channel.name === product) ||
      (fixture.kind === "sheetRack" && product === "Sheet Goods")
    ) {
      return { kind: "rack", id: fixture.id, cell: fixtureStandCell(fixture) };
    }
  }
  for (const fixture of layout.fixtures) {
    if (fixture.kind === "lumberRack") {
      const channel = fixture.channel;
      for (const species of channel.species) {
        for (const sku of channel.skus) {
          const name = getMaterialFullName(
            board(
              species,
              sku.length,
              sku.width,
              sku.thickness,
              channel.surface,
              {
                faces: channel.jointedFaces,
                edges: channel.jointedEdges,
              },
            ),
          );
          if (name === product) {
            return {
              kind: "rack",
              id: fixture.id,
              cell: fixtureStandCell(fixture),
            };
          }
        }
      }
    }
    // The variant (a panel size) picks a tile *inside* the card; any
    // variant of a carried kind hangs on the one sheet rack.
    if (fixture.kind === "sheetRack") {
      const kinds = unlockedSheetSkus(reputation);
      if (kinds.some((sku) => sheetKindLabel(sku.kind) === product)) {
        return {
          kind: "rack",
          id: fixture.id,
          cell: fixtureStandCell(fixture),
        };
      }
    }
  }
  return null;
}
