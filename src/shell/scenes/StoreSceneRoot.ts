import { Graphics } from "pixi.js";
import {
  cellToPixel,
  PIXELS_PER_CELL,
} from "../../components/shop-view/shop-scale";
import { Persistence } from "../../config/constants";
import { BaseEntity } from "../../core/entity/BaseEntity";
import { Entity } from "../../core/entity/Entity";
import { GameSprite } from "../../core/entity/GameSprite";
import { on } from "../../core/entity/handler";
import {
  Shopper,
  SHOPPER_RADIUS,
  spawnShoppers,
  stepShoppers,
} from "../../components/store-view/storeShoppers";
import {
  BASE_WALK_SPEED,
  cellCenter,
  CollisionWorld,
  directionFromInput,
  headingForDirection,
  SolidCircle,
  stepPlayerMotion,
} from "../../game/player-motion";
import {
  ShelfBay,
  storeCollisionWorld,
  StoreLayout,
  storeLayout,
} from "../../game/store-layout";
import {
  cartIndexToReturn,
  resolveStoreInteract,
  StoreInteract,
} from "../../game/store-interact";
import { Direction, Vector, vectorKey } from "../../game/Vectors";
import {
  addToCart,
  checkout,
  removeFromCart,
  takeCart,
} from "../../sim/commands/cart-commands";
import { setShoppingPosition } from "../../sim/commands/trip-commands";
import { Player } from "../../sim/entities/Player";
import { projectGameState } from "../../sim/projection";
import { ShellStore } from "../ShellStore";
import { SceneDirector } from "./SceneDirector";
import { StoreActorsView } from "./store-views/StoreActorsView";
import { StoreEnvironmentView } from "./store-views/StoreEnvironmentView";
import { StoreTruckView } from "./store-views/StoreTruckView";
import { StoreFixturesView } from "./store-views/StoreFixturesView";
import { StoreMerchandiseView } from "./store-views/StoreMerchandiseView";

/**
 * The walkable Orange Box's scene root (migration phase 6). Spawned by
 * the SceneDirector while a shopping trip to the store is on screen;
 * Level persistence, so any scene clear takes it (the director rebuilds
 * what the venue needs).
 *
 * The scene-swap milestone draws the venue's bones — slab, walls with
 * their two door gaps, gondola spines and fixture blocks, register and
 * corral — and owns the store floor's walk: the same continuous body
 * math as the shop (`stepPlayerMotion`) over the planogram's collision
 * world, at the clean-floor stride (no sawdust in a store), reporting
 * the cell underfoot onto the trip (`away.position` — `player.position`
 * keeps meaning the cell back home). The full fixture/merchandise/
 * shopper dress arrives with the StoreScene work; the camera runs both
 * axes here, following the body.
 */

export class StoreSceneRoot extends BaseEntity implements Entity {
  id = "storeSceneRoot";
  persistenceLevel: number = Persistence.Level;
  pausable = false;

  /** The continuous store body, in cell coordinates. */
  private position: Vector | null = null;
  private direction: Direction = 3;
  /** The last motion's continuous heading, for the cart's lead point. */
  private heading = Math.PI / 2;
  private lastReported = "";

  /** The ambient shoppers, stepped here so the walk treats them as
   * solid, walking people rather than scenery (the actors view draws
   * them). */
  shoppers: Shopper[] = [];

  /** The continuous body, for the views riding it. */
  bodyPosition(): Vector | null {
    return this.position;
  }

  bodyDirection(): Direction {
    return this.direction;
  }

  bodyHeading(): number {
    return this.heading;
  }

  private layoutCache: StoreLayout | null = null;
  /** What the cached layout was built for — the same slices the old
   * StoreView's memo keyed on (the floor only moves when stock moves). */
  private layoutKey = "";

  // ---- The store floor's transient UI state (the old StoreView's) ----

  /** The register's receipt card. */
  checkoutOpen = false;
  /** The armed "leave the cart behind?" at the cab. */
  armedLeave = false;
  /** Real seconds left before the armed confirm disarms itself. */
  private armedLeaveLeft = 0;

  /** How long an armed "leave the cart behind?" waits before disarming. */
  private static readonly CONFIRM_TIMEOUT_S = 5;

  constructor() {
    super();
    this.sprites = [];
  }

  layout(): StoreLayout | null {
    const player = this.game.entities.tryGetSingleton(Player);
    if (player?.away?.kind !== "shopping") return null;
    const gameState = projectGameState(this.game);
    const key = [
      player.away.store,
      gameState.reputation,
      gameState.broomOwned,
      gameState.shopVac != null,
    ].join(",");
    if (!this.layoutCache || key !== this.layoutKey) {
      this.layoutCache = storeLayout(player.away.store, gameState);
      this.layoutKey = key;
      if (this.isAdded) this.dress(this.layoutCache);
    }
    return this.layoutCache;
  }

  /** (Re)build the venue's drawn layers for a layout — on add, and
   * whenever the planogram moves (stock changes relayout the floor). */
  private dress(layout: StoreLayout): void {
    while (this.children?.length) {
      this.children[this.children.length - 1].destroy();
    }
    this.addChild(new StoreEnvironmentView(layout));
    this.addChild(new StoreFixturesView(layout));
    this.addChild(new StoreMerchandiseView(layout));
    this.addChild(new StoreActorsView());
    this.addChild(new StoreTruckView(layout));
  }

  /** The resolver the keys and the chips share (store-interact.ts). */
  interact(): StoreInteract | null {
    const layout = this.layout();
    if (!layout) return null;
    return resolveStoreInteract(projectGameState(this.game), layout);
  }

  // ---- The store floor's keys (dispatched by ShortcutDispatcher) ----

  /** E: take a cart, take one off the shelf, ring up, or head home. */
  pressE(): void {
    const now = this.interact();
    if (!now) return;
    if (now.atRegister) {
      if (now.canCheckOut) this.openCheckout();
      return;
    }
    if (now.atCab) {
      this.leave();
      return;
    }
    if (now.atCorral && !now.hasCart) {
      takeCart(this.game);
      this.bump();
      return;
    }
    if (now.fixture && now.hasCart) {
      this.addFromBay(now.fixture);
    }
  }

  /** F: put one of the standing bay's product back on its shelf. */
  pressF(): void {
    const now = this.interact();
    if (now?.fixture && now.inCart > 0) {
      this.returnToBay(now.fixture);
    }
  }

  /** Escape: fold the receipt card. True when the press was spent. */
  pressEscape(): boolean {
    if (this.checkoutOpen) {
      this.closeCheckout();
      return true;
    }
    if (this.armedLeave) {
      this.armedLeave = false;
      this.bump();
      return true;
    }
    return false;
  }

  addFromBay(bay: ShelfBay): void {
    addToCart(this.game, bay.product.line);
    this.bump();
  }

  returnToBay(bay: ShelfBay): void {
    const index = cartIndexToReturn(projectGameState(this.game), bay);
    if (index !== null) {
      removeFromCart(this.game, index);
      this.bump();
    }
  }

  openCheckout(): void {
    this.checkoutOpen = true;
    this.bump();
  }

  closeCheckout(): void {
    this.checkoutOpen = false;
    this.bump();
  }

  /** The receipt's Buy: ring the cart up, then the drive home starts. */
  buy(): void {
    if (!checkout(this.game)) return;
    this.checkoutOpen = false;
    this.bump();
    this.game.entities.getSingleton(SceneDirector).requestDriveHome();
  }

  /**
   * The cab's E. A loaded cart asks first (the armed confirm, which
   * disarms on a timeout, on stepping away, or when the cart empties);
   * pressing again — or standing there cartless — heads home.
   */
  leave(): void {
    const now = this.interact();
    if ((now?.cartCount ?? 0) > 0 && !this.armedLeave) {
      this.armedLeave = true;
      this.armedLeaveLeft = StoreSceneRoot.CONFIRM_TIMEOUT_S;
      this.bump();
      return;
    }
    this.armedLeave = false;
    this.bump();
    this.game.entities.getSingleton(SceneDirector).requestDriveHome();
  }

  private bump(): void {
    this.game.entities.tryGetSingleton(ShellStore)?.bump();
  }

  @on("add")
  onAdd() {
    const layout = this.layout();
    if (layout) this.dress(layout);
  }

  @on("tick")
  onTick(dt: number) {
    const player = this.game.entities.tryGetSingleton(Player);
    const layout = this.layout();
    if (!player || player.away?.kind !== "shopping" || !layout) return;
    const trip = player.away;

    // The armed "leave the cart behind?" disarms on its timeout, on
    // stepping away from the cab, or when the cart empties.
    if (this.armedLeave) {
      this.armedLeaveLeft -= dt;
      const now = this.interact();
      if (
        this.armedLeaveLeft <= 0 ||
        !now?.atCab ||
        (now?.cartCount ?? 0) === 0
      ) {
        this.armedLeave = false;
        this.bump();
      }
    }

    // Mount snap: the body stands wherever the trip does — the spawn
    // beside the cab on arrival, mid-aisle on a reload.
    if (this.position === null) {
      this.position = cellCenter(trip.position);
      this.direction = trip.direction;
    }

    // The ambient shoppers stroll their patrols, yielding to the body.
    if (this.shoppers.length === 0) {
      this.shoppers = spawnShoppers(layout);
    }
    const baseWorld = storeCollisionWorld(layout);
    stepShoppers(this.shoppers, this.position, dt, baseWorld);

    // A DOM dialog owns the keyboard here exactly like at home.
    const modalOpen =
      this.game.entities.tryGetSingleton(ShellStore)?.modalOpen ?? false;
    const input = modalOpen
      ? ([0, 0] as Vector)
      : this.game.io.getMovementVector();
    if (input[0] !== 0 || input[1] !== 0) {
      this.direction = directionFromInput(input, this.direction);
      this.heading = Math.atan2(input[1], input[0]);
      // The shoppers are solid, walking people, not scenery the body
      // clips through.
      const shopperSolids: SolidCircle[] = this.shoppers.map((shopper) => ({
        kind: "circle",
        center: shopper.position,
        radius: SHOPPER_RADIUS,
      }));
      const world: CollisionWorld = {
        ...baseWorld,
        solids: [...baseWorld.solids, ...shopperSolids],
      };
      this.position = stepPlayerMotion(
        this.position,
        input,
        BASE_WALK_SPEED,
        dt,
        world,
      );
    }

    // Report the cell underfoot onto the trip when it changes.
    const cell: Vector = [
      Math.floor(this.position[0]),
      Math.floor(this.position[1]),
    ];
    const key = `${vectorKey(cell)},${this.direction}`;
    if (key !== this.lastReported) {
      this.lastReported = key;
      setShoppingPosition(this.game, cell, this.direction);
    }
  }

  @on("render")
  onRender() {
    if (!this.position) return;
    const renderer = this.game.renderer;
    if (!renderer) return;

    // The camera pans both axes at the shop's own zoom, following the
    // body, clamped a stride past the walls and the lot's far edge (the
    // old CameraLayer's scroll ranges); a viewport big enough to see
    // everything collapses a range and that axis never moves.
    const layout = this.layoutCache;
    const camera = this.game.camera;
    if (layout) {
      const halfW = renderer.getWidth() / 2 / camera.z;
      const halfH = renderer.getHeight() / 2 / camera.z;
      const slack = cellToPixel(1.5);
      const clamp = (value: number, lo: number, hi: number) =>
        hi <= lo ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, value));
      camera.x = clamp(
        cellToPixel(this.position[0]),
        -slack + halfW,
        cellToPixel(layout.worldSize[0]) + slack - halfW,
      );
      camera.y = clamp(
        cellToPixel(this.position[1]),
        -slack + halfH,
        cellToPixel(layout.worldSize[1]) + slack - halfH,
      );
    } else {
      camera.x = cellToPixel(this.position[0]);
      camera.y = cellToPixel(this.position[1]);
    }
  }
}
