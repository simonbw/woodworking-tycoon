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
  BASE_WALK_SPEED,
  cellCenter,
  directionFromInput,
  stepPlayerMotion,
} from "../../game/player-motion";
import {
  storeCollisionWorld,
  StoreLayout,
  storeLayout,
} from "../../game/store-layout";
import { Direction, Vector, vectorKey } from "../../game/Vectors";
import { setShoppingPosition } from "../../sim/commands/trip-commands";
import { Player } from "../../sim/entities/Player";
import { projectGameState } from "../../sim/projection";
import { ShellStore } from "../ShellStore";

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

/** The scene's own sprite colors, placeholder dress until the store
 * layers port: concrete slab, drywall, gondola gray, orange accents. */
const SLAB = 0x9a9a98;
const LOT = 0x2b2b2b;
const WALL = 0x4a4642;
const FIXTURE = 0x7d7a76;
const ACCENT = 0xd96f1f;

const WALL_PX = 8;

export class StoreSceneRoot extends BaseEntity implements Entity {
  id = "storeSceneRoot";
  persistenceLevel: number = Persistence.Level;
  pausable = false;

  private floor: Graphics & GameSprite;
  private body: Graphics & GameSprite;

  /** The continuous store body, in cell coordinates. */
  private position: Vector | null = null;
  private direction: Direction = 3;
  private lastReported = "";

  private layoutCache: StoreLayout | null = null;

  constructor() {
    super();
    this.floor = new Graphics() as Graphics & GameSprite;
    this.floor.layerName = "environment";
    this.body = new Graphics() as Graphics & GameSprite;
    this.body.layerName = "actors";
    this.sprites = [this.floor, this.body];
  }

  private layout(): StoreLayout | null {
    if (this.layoutCache) return this.layoutCache;
    const player = this.game.entities.tryGetSingleton(Player);
    if (player?.away?.kind !== "shopping") return null;
    this.layoutCache = storeLayout(
      player.away.store,
      projectGameState(this.game),
    );
    return this.layoutCache;
  }

  @on("add")
  onAdd() {
    const layout = this.layout();
    if (layout) this.drawVenue(layout);
  }

  private drawVenue(layout: StoreLayout) {
    const g = this.floor;
    g.clear();
    const [w, h] = layout.interior;
    const [worldW, worldH] = layout.worldSize;

    // The lot the whole world sits on, then the sales floor's slab.
    g.rect(0, 0, cellToPixel(worldW), cellToPixel(worldH)).fill(LOT);
    g.rect(0, 0, cellToPixel(w), cellToPixel(h)).fill(SLAB);

    // Perimeter walls; the front wall (y = interior height) is split by
    // the entrance and exit spans.
    g.rect(-WALL_PX, -WALL_PX, cellToPixel(w) + 2 * WALL_PX, WALL_PX).fill(
      WALL,
    );
    g.rect(-WALL_PX, 0, WALL_PX, cellToPixel(h)).fill(WALL);
    g.rect(cellToPixel(w), 0, WALL_PX, cellToPixel(h)).fill(WALL);
    const frontY = cellToPixel(h);
    const spans = [layout.doors.entrance, layout.doors.exit]
      .map((door) => ({
        left: cellToPixel(door.left),
        right: cellToPixel(door.right),
      }))
      .sort((a, b) => a.left - b.left);
    let x = -WALL_PX;
    for (const span of spans) {
      g.rect(x, frontY, span.left - x, WALL_PX).fill(WALL);
      x = span.right;
    }
    g.rect(x, frontY, cellToPixel(w) + WALL_PX - x, WALL_PX).fill(WALL);

    // Gondola spines and fixtures as blocks; register and corral in the
    // store's orange so the landmarks read before the real dress lands.
    for (const spine of layout.spines) {
      g.rect(
        cellToPixel(spine.min[0]),
        cellToPixel(spine.min[1]),
        cellToPixel(spine.max[0] - spine.min[0]),
        cellToPixel(spine.max[1] - spine.min[1]),
      ).fill(WALL);
    }
    for (const fixture of layout.fixtures) {
      const rect = fixture.rect;
      g.rect(
        cellToPixel(rect.min[0]),
        cellToPixel(rect.min[1]),
        cellToPixel(rect.max[0] - rect.min[0]),
        cellToPixel(rect.max[1] - rect.min[1]),
      ).fill(FIXTURE);
    }
    for (const landmark of [layout.register, layout.corral]) {
      g.rect(
        cellToPixel(landmark.min[0]),
        cellToPixel(landmark.min[1]),
        cellToPixel(landmark.max[0] - landmark.min[0]),
        cellToPixel(landmark.max[1] - landmark.min[1]),
      ).fill(ACCENT);
    }
  }

  @on("tick")
  onTick(dt: number) {
    const player = this.game.entities.tryGetSingleton(Player);
    const layout = this.layout();
    if (!player || player.away?.kind !== "shopping" || !layout) return;
    const trip = player.away;

    // Mount snap: the body stands wherever the trip does — the spawn
    // beside the cab on arrival, mid-aisle on a reload.
    if (this.position === null) {
      this.position = cellCenter(trip.position);
      this.direction = trip.direction;
    }

    // A DOM dialog owns the keyboard here exactly like at home.
    const modalOpen =
      this.game.entities.tryGetSingleton(ShellStore)?.modalOpen ?? false;
    const input = modalOpen
      ? ([0, 0] as Vector)
      : this.game.io.getMovementVector();
    if (input[0] !== 0 || input[1] !== 0) {
      this.direction = directionFromInput(input, this.direction);
      this.position = stepPlayerMotion(
        this.position,
        input,
        BASE_WALK_SPEED,
        dt,
        storeCollisionWorld(layout),
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

    // The body, drawn where it stands.
    const g = this.body;
    g.clear();
    g.circle(
      cellToPixel(this.position[0]),
      cellToPixel(this.position[1]),
      PIXELS_PER_CELL * 0.34,
    ).fill(0x3d85c6);

    // The camera pans both axes at the shop's own zoom, following the
    // body (the old store CameraLayer's behavior).
    const camera = this.game.camera;
    camera.x = cellToPixel(this.position[0]);
    camera.y = cellToPixel(this.position[1]);
  }
}
