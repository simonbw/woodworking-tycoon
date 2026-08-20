import { Graphics, Text, Texture, TilingSprite } from "pixi.js";
import { cellToPixel, inchesToPixels } from "../../../views/shop-scale";
import { Persistence } from "../../../config/constants";
import { BaseEntity } from "../../../core/entity/BaseEntity";
import { Entity } from "../../../core/entity/Entity";
import { GameSprite } from "../../../core/entity/GameSprite";
import { on } from "../../../core/entity/handler";
import { StoreLayout } from "../../../game/store-layout";

/**
 * The store's building and lot — the old StoreEnvironmentLayer as an
 * entity view: the sales floor's slab, the walls with the entrance and
 * exit openings and a glass storefront, the sidewalk with its expansion
 * seams, and the parking lot with the truck's stall marked out. Drawn
 * from the same layout the collision world is built from
 * (store-layout.ts), so a wall you see is a wall you hit. Procedural on
 * purpose — see docs/asset-backlog.md.
 *
 * The old layer sized its lot to the camera's viewport; here the lot
 * draws to the world plus a fixed margin, which covers everything the
 * clamped camera can see without re-drawing on scroll.
 */

const WALL_THICKNESS = inchesToPixels(6);
const WALL = 0x332e27;
const WALL_CAP = 0x4d453a;
const GLASS = 0x9fc4cf;
const MULLION = 0x2b2e30;
const SIDEWALK = 0x9b9894;
const SIDEWALK_SEAM = 0x7f7c78;
const STALL_PAINT = 0xd8d4cd;
const FLOOR_TINT = 0xe3e3e3;
const ASPHALT_TINT = 0x8f8f8f;

/** Worn white paint, the way floor stencils actually read on concrete. */
const DECAL_PAINT = 0xffffff;
const DECAL_ALPHA = 0.65;

/** The stencil face the storefront chrome uses, painted onto the slab.
 * loadFonts() has already fetched it by the time any scene spawns, so
 * the decals never bake the serif fallback. */
const DECAL_FONT = "Stardos Stencil";

/** How far past the walls the lot draws, in cells — comfortably past
 * the camera's clamped reach. */
const LOT_MARGIN_CELLS = 24;

export class StoreEnvironmentView extends BaseEntity implements Entity {
  persistenceLevel: number = Persistence.Level;
  pausable = false;

  constructor(private layout: StoreLayout) {
    super();
    const margin = cellToPixel(LOT_MARGIN_CELLS);
    const width = cellToPixel(layout.interior[0]);
    const height = cellToPixel(layout.interior[1]);
    const worldW = cellToPixel(layout.worldSize[0]);
    const worldH = cellToPixel(layout.worldSize[1]);

    // The parking lot: asphalt everywhere the camera can see.
    const asphalt = new TilingSprite({
      texture: Texture.from("/images/asphalt.png"),
    }) as TilingSprite & GameSprite;
    asphalt.tint = ASPHALT_TINT;
    asphalt.tileScale.set(0.6);
    asphalt.position.set(-margin, -margin);
    asphalt.width = worldW + margin * 2;
    asphalt.height = worldH + margin * 2;
    asphalt.layerName = "environment";

    const lot = new Graphics() as Graphics & GameSprite;
    lot.layerName = "environment";
    this.drawLot(lot, -margin, worldW + margin);

    // The sales floor's slab, lighter than the shop's — a sealed retail
    // floor rather than a garage.
    const slab = new TilingSprite({
      texture: Texture.from("/images/concrete-floor-2-big.png"),
    }) as TilingSprite & GameSprite;
    slab.tint = FLOOR_TINT;
    slab.tileScale.set(0.25);
    slab.width = width;
    slab.height = height;
    slab.layerName = "environment";

    const building = new Graphics() as Graphics & GameSprite;
    building.layerName = "environment";
    this.drawBuilding(building);

    this.sprites = [asphalt, lot, slab, building];

    // Stencil paint on the slab: aisle names and wayfinding, under
    // everything that stands on the floor. Bare paint — no plates or
    // borders; the stencil face and the worn white are the look.
    for (const decal of layout.decals) {
      const text = new Text({
        text: decal.text,
        style: {
          fontFamily: DECAL_FONT,
          fontWeight: "700",
          fontSize: cellToPixel(decal.size),
          letterSpacing: 2,
          fill: DECAL_PAINT,
        },
      }) as Text & GameSprite;
      text.position.set(cellToPixel(decal.at[0]), cellToPixel(decal.at[1]));
      text.rotation = decal.rotation;
      text.anchor.set(0.5, 0.5);
      text.alpha = DECAL_ALPHA;
      text.layerName = "environment";
      // Under the building's walls but over the slab: sprite order in
      // this list is draw order within the layer.
      this.sprites.splice(3, 0, text);
    }
  }

  private drawBuilding(g: Graphics) {
    const { layout } = this;
    const width = cellToPixel(layout.interior[0]);
    const height = cellToPixel(layout.interior[1]);
    const doors = [
      {
        left: cellToPixel(layout.doors.exit.left),
        right: cellToPixel(layout.doors.exit.right),
      },
      {
        left: cellToPixel(layout.doors.entrance.left),
        right: cellToPixel(layout.doors.entrance.right),
      },
    ];

    // Walls: full bands on the back and sides. The front is mostly
    // storefront glass, so its band draws thinner under the panes.
    g.rect(
      -WALL_THICKNESS,
      -WALL_THICKNESS,
      width + WALL_THICKNESS * 2,
      WALL_THICKNESS,
    );
    g.rect(-WALL_THICKNESS, 0, WALL_THICKNESS, height + WALL_THICKNESS);
    g.rect(width, 0, WALL_THICKNESS, height + WALL_THICKNESS);
    // The front band in segments between the two openings.
    const frontEdges = [
      -WALL_THICKNESS,
      ...doors.flatMap((door) => [door.left, door.right]),
      width + WALL_THICKNESS,
    ];
    for (let i = 0; i < frontEdges.length; i += 2) {
      g.rect(
        frontEdges[i],
        height,
        frontEdges[i + 1] - frontEdges[i],
        WALL_THICKNESS,
      );
    }
    g.fill(WALL);

    // Top-plate highlight along the outer perimeter, like the shop's.
    g.rect(-WALL_THICKNESS, -WALL_THICKNESS, width + WALL_THICKNESS * 2, 3);
    g.rect(-WALL_THICKNESS, -WALL_THICKNESS, 3, height + WALL_THICKNESS * 2);
    g.rect(
      width + WALL_THICKNESS - 3,
      -WALL_THICKNESS,
      3,
      height + WALL_THICKNESS * 2,
    );
    g.fill(WALL_CAP);

    // Storefront glass between the openings: panes with mullions.
    const paneRuns: Array<[number, number]> = [
      [8, doors[0].left - 8],
      [doors[0].right + 8, doors[1].left - 8],
      [doors[1].right + 8, width - 8],
    ];
    for (const [left, right] of paneRuns) {
      if (right - left < 24) continue;
      g.rect(left, height + 2, right - left, WALL_THICKNESS - 4);
      g.fill({ color: GLASS, alpha: 0.9 });
      const panes = Math.max(1, Math.round((right - left) / 80));
      for (let i = 0; i <= panes; i++) {
        g.rect(
          left + ((right - left) / panes) * i - 1.5,
          height,
          3,
          WALL_THICKNESS,
        );
      }
      g.fill(MULLION);
    }

    // The door openings: sliding doors parked open, one pane each side,
    // and a threshold strip across each gap.
    for (const door of doors) {
      g.rect(door.left, height, door.right - door.left, 4);
      g.fill(MULLION);
      g.rect(door.left, height + 4, 14, WALL_THICKNESS - 6);
      g.rect(door.right - 14, height + 4, 14, WALL_THICKNESS - 6);
      g.fill({ color: GLASS, alpha: 0.9 });
    }
  }

  private drawLot(g: Graphics, lotLeft: number, lotRight: number) {
    const { layout } = this;
    const height = cellToPixel(layout.interior[1]);
    const sidewalkBottom = cellToPixel(layout.truck.min[1] - 0.5);

    // The sidewalk apron between the storefront and the stalls, with
    // expansion seams every dozen feet.
    const walkTop = height + WALL_THICKNESS;
    g.rect(lotLeft, walkTop, lotRight - lotLeft, sidewalkBottom - walkTop);
    g.fill(SIDEWALK);
    for (
      let x = Math.floor(lotLeft / cellToPixel(12)) * cellToPixel(12);
      x < lotRight;
      x += cellToPixel(12)
    ) {
      g.rect(x, walkTop, 2, sidewalkBottom - walkTop);
    }
    g.rect(lotLeft, sidewalkBottom - 3, lotRight - lotLeft, 3);
    g.fill(SIDEWALK_SEAM);

    // Stall paint around the truck's spot: end lines and the curbside
    // stripe, worn white over the asphalt.
    const stall = layout.truck;
    const pad = cellToPixel(0.5);
    const left = cellToPixel(stall.min[0]) - pad;
    const right = cellToPixel(stall.max[0]) + pad;
    const top = cellToPixel(stall.min[1]) - pad;
    const bottom = cellToPixel(stall.max[1]) + pad;
    g.rect(left, top, 4, bottom - top);
    g.rect(right - 4, top, 4, bottom - top);
    g.rect(left, bottom - 4, right - left, 4);
    g.fill({ color: STALL_PAINT, alpha: 0.7 });
  }
}
