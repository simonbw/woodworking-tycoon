import { Container, Graphics, Sprite } from "pixi.js";
import {
  cellToPixel,
  cellToPixelCenter,
  inchesToPixels,
  PIXELS_PER_CELL,
} from "./shop-scale";
import { BaseEntity } from "../core/entity/BaseEntity";
import { Entity } from "../core/entity/Entity";
import { GameSprite, loadGameSprite } from "../core/entity/GameSprite";
import { on } from "../core/entity/handler";
import { truckBedRect, truckParkedRect } from "../game/lot";
import { ShopInfo as ShopInfoData } from "../game/ShopInfo";
import { Player } from "../sim/entities/Player";
import {
  TripTheater,
  TRUCK_ARRIVE_SECONDS,
  TRUCK_DEPART_SECONDS,
  TRUCK_ROLL_IN_SECONDS,
  TRUCK_ROLL_OUT_SECONDS,
} from "../shell/scenes/TripTheater";
import { TruckEntity } from "../sim/entities/TruckEntity";
import { ShopInfo } from "../sim/singletons/ShopInfo";
import { createMaterialSprite } from "./material-sprites/MaterialSprite";

/**
 * The truck parked in the driveway, backed in with the tailgate to the
 * garage — the old TruckSprite as a view entity, paired with the
 * TruckEntity that owns the cargo. Where it sits — and the solid the
 * walking body bounces off — comes from truckParkedRect in lot.ts; this
 * view only maps the art onto that footprint and fans the bed's cargo
 * over it.
 *
 * While the player is away on a trip the truck went with them, so the
 * whole thing hides. The old shell's trip theater (the roll down the
 * driveway, truckStageStore's clock) is phase 6; until then parked/gone
 * follows `player.away` directly. Targeting and tutorial highlights are
 * phase 4/5.
 *
 * The art is a 400×600 top-down view drawn nose-up. Inside that canvas
 * the red body is 184 px wide, the mirrors reach 264, and the truck spans
 * 562 px bumper to bumper — proportionally a little longer than a real
 * Ranger, so no single scale can match both figures. Scaling the canvas
 * to 144" splits the difference: a 66" body and a 202" length, each
 * within a few percent — the same figures lot.ts uses for the footprint.
 * The sprite is turned 180°, so the rear bumper sits under the canvas's
 * (flipped) top margin.
 */
const TRUCK_CANVAS_WIDTH = inchesToPixels(144);
const TRUCK_CANVAS_HEIGHT = TRUCK_CANVAS_WIDTH * (600 / 400);

/** Transparent canvas beyond the rear bumper, as a fraction of the art
 * (600 minus the 27 px nose margin minus the 562 px truck). */
const TRUCK_TAIL_INSET = 11 / 600;

export class TruckView extends BaseEntity implements Entity {
  private body: Sprite & GameSprite;
  private cargo: Container & GameSprite;

  /** What the cargo was last built for, so it only rebuilds on change. */
  private builtFor = "";

  constructor(private truck: TruckEntity) {
    super();
    this.body = loadGameSprite("/images/pickup-truck.png", "environment", {
      anchor: [0.5, 0.5],
    });
    this.body.width = TRUCK_CANVAS_WIDTH;
    this.body.height = TRUCK_CANVAS_HEIGHT;
    this.body.rotation = Math.PI;

    this.cargo = new Container() as Container & GameSprite;
    this.cargo.layerName = "environment";

    this.sprites = [this.body, this.cargo];
  }

  /** The truck's body art — the container the highlight rims dress. */
  get highlightRoot(): Container {
    return this.body;
  }

  private shopInfo(): ShopInfoData | undefined {
    return this.game.entities.tryGetSingleton(ShopInfo)?.info;
  }

  @on("render")
  onRender() {
    const shopInfo = this.shopInfo();
    if (!shopInfo) return;

    // The player drove it — nothing parked while they're away. The
    // theater stretches that instant: the truck is still on the lot
    // while it rolls out, and back on it before the trip has cleared.
    const theater = this.game.entities.tryGetSingleton(TripTheater);
    const player = this.game.entities.tryGetSingleton(Player);
    const stage = theater?.stage() ?? (player?.away ? "away" : "parked");
    const onTheLot = stage !== "away";
    this.body.visible = onTheLot;
    this.cargo.visible = onTheLot;
    if (!onTheLot) return;

    const rect = truckParkedRect(shopInfo);
    const centerX = cellToPixel((rect.min[0] + rect.max[0]) / 2);
    const tailgateY = cellToPixel(rect.min[1]);
    // Flipped canvas: its top edge rides TAIL_INSET above the rear bumper
    const centerY =
      tailgateY -
      TRUCK_CANVAS_HEIGHT * TRUCK_TAIL_INSET +
      TRUCK_CANVAS_HEIGHT / 2;
    // The trip roll: the truck slides down the driveway on departure
    // and backs up it on arrival — and the cargo rides along, not
    // waiting at the parking spot for the bed to arrive under it.
    const roll = theater ? driveOffset(theater) : 0;
    this.body.position.set(centerX, centerY + roll);
    this.cargo.position.set(0, roll);

    const key = [
      `${shopInfo.size[0]}x${shopInfo.size[1]}`,
      this.truck.crates.map((crate) => crate.machineTypeId).join(),
      this.truck.bed.map((material) => material.id).join(),
    ].join("|");
    if (key !== this.builtFor) {
      this.builtFor = key;
      this.rebuildCargo(shopInfo);
    }
  }

  /** Cargo lies lengthwise in the bed, fanned like a floor pile. Long
   * stock overhangs the tailgate — that's what the truck's for. Crates
   * ride behind the cab, stock toward the gate. */
  private rebuildCargo(shopInfo: ShopInfoData) {
    this.cargo.removeChildren().forEach((child) => child.destroy());

    const bed = truckBedRect(shopInfo);
    const bedCenterX = cellToPixel((bed.min[0] + bed.max[0]) / 2);
    const bedCenterY = cellToPixel((bed.min[1] + bed.max[1]) / 2);

    this.truck.crates.forEach((_, i) => {
      const g = new Graphics();
      drawCrate(g);
      // The old MachineCrateSprite centered on a cell; offset so the
      // crate lands staggered up the bed from its far end
      const [x, y] = cellToPixelCenter([
        (bed.min[0] + bed.max[0]) / 2 - 0.5,
        bed.max[1] - 1.6 - i * 1.2,
      ]);
      g.position.set(x, y);
      this.cargo.addChild(g);
    });

    this.truck.bed.forEach((material, i) => {
      // The material's real sprite, exactly as it draws on the floor —
      // a pallet in the bed reads as a pallet, not a placeholder glyph.
      const item = new Container();
      item.addChild(createMaterialSprite(material));
      item.position.set(bedCenterX, bedCenterY + ((i % 3) - 1) * 6);
      item.angle = 90 + ((i * 7) % 21) - 10;
      this.cargo.addChild(item);
    });
  }
}

/**
 * A machine delivery still in its crate: a stenciled pine box, the old
 * MachineCrateSprite's drawing. The floor-crate view (MachineCrateEntity's,
 * in the sprite fan-out) draws the same box; keep them looking alike.
 */
function drawCrate(g: Graphics) {
  // A real crate is bigger than the 1-ft cell it anchors to — it
  // overhangs its cell visually but never blocks walking.
  const half = PIXELS_PER_CELL * 0.9;

  // The lid
  g.rect(-half, -half, half * 2, half * 2);
  g.fill(0xc9a86a);
  g.rect(-half, -half, half * 2, half * 2);
  g.stroke({ width: 3, color: 0x8a6f42 });

  // Plank seams
  for (const offset of [-half / 2, 0, half / 2]) {
    g.moveTo(-half, offset);
    g.lineTo(half, offset);
    g.stroke({ width: 1.5, color: 0x8a6f42 });
  }

  // Cross braces nailed over the lid
  g.moveTo(-half, -half);
  g.lineTo(half, half);
  g.stroke({ width: 3, color: 0xa8895a });
  g.moveTo(half, -half);
  g.lineTo(-half, half);
  g.stroke({ width: 3, color: 0xa8895a });

  // Corner nail heads
  for (const [nx, ny] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    g.circle(nx * (half - 5), ny * (half - 5), 2);
    g.fill(0x5c4a2e);
  }
}

/** How far the truck travels before it's off the lot, in pixels. */
const TRUCK_TRAVEL_PX = 1200;

/** How far down the driveway the truck has rolled, in pixels. */
function driveOffset(theater: TripTheater): number {
  const elapsed = theater.stageElapsed();
  if (theater.stage() === "departing") {
    // The first stretch is the crank; then the wheels roll, easing in.
    const p = clamp01(
      (elapsed - TRUCK_ROLL_OUT_SECONDS) /
        (TRUCK_DEPART_SECONDS - TRUCK_ROLL_OUT_SECONDS),
    );
    return p * p * TRUCK_TRAVEL_PX;
  }
  if (theater.stage() === "arriving") {
    // Backing in: fast off the street, settling gently into the spot.
    const p = clamp01(
      elapsed / Math.min(TRUCK_ROLL_IN_SECONDS, TRUCK_ARRIVE_SECONDS),
    );
    const eased = 1 - Math.pow(1 - p, 3);
    return (1 - eased) * TRUCK_TRAVEL_PX;
  }
  return 0;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
