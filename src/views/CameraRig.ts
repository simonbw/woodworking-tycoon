import { Persistence } from "../config/constants";
import { BaseEntity } from "../core/entity/BaseEntity";
import { Entity } from "../core/entity/Entity";
import { on } from "../core/entity/handler";
import {
  cellToPixel,
  PIXELS_PER_CELL,
} from "../components/shop-view/shop-scale";
import { sidewalkY } from "../game/stand";
import { TRIP_TRANSITIONS_DISABLED } from "../shell/scenes/TripTheater";
import { currentVenue } from "../shell/scenes/venue";
import { Player } from "../sim/entities/Player";
import { ShopInfo } from "../sim/singletons/ShopInfo";

/**
 * The shop's framing and camera follow, ported from ShopView +
 * CameraLayer onto the engine's Camera2d.
 *
 * The old shell fit the shop (plus a three-cell apron of lot) into the
 * viewport at a quantized scale, centered it, and held the view still
 * indoors; stepping out the garage door hands the camera to the player,
 * eased and clamped so the view never scrolls above the interior framing
 * or past the sidewalk the customers stroll. This entity computes the
 * same fit against the renderer's size every frame and expresses it as
 * Camera2d position + zoom — same numbers, different plumbing.
 */

/** Ground kept visible around the shop when fitting, in world pixels. */
export const LOT_APRON = PIXELS_PER_CELL * 3;

/** How quickly the camera glides to its target, per second. */
const FOLLOW_RATE = 5;

export class CameraRig extends BaseEntity implements Entity {
  persistenceLevel: number = Persistence.Permanent;
  pausable = false;

  private scroll = 0;
  private firstFrame = true;
  /**
   * Snap to the framing instead of gliding to it. The E2E build does,
   * as the old shell's camera did: a spec that measures where something
   * sits on screen would otherwise race a camera still easing in, and a
   * capped renderer glides in visible steps.
   */
  snap = TRIP_TRANSITIONS_DISABLED;

  @on("render")
  onRender(dt: number) {
    const game = this.game;
    const renderer = game.renderer;
    if (!renderer) return;
    const shopInfo = game.entities.tryGetSingleton(ShopInfo)?.info;
    const player = game.entities.tryGetSingleton(Player);
    if (!shopInfo || !player) return;
    // At the walkable store another scene owns the camera (the store
    // pans both axes at this rig's zoom — see StoreSceneRoot).
    if (currentVenue(game) !== "shop") return;

    const viewWidth = renderer.getWidth();
    const viewHeight = renderer.getHeight();
    const worldWidth = cellToPixel(shopInfo.size[0]);
    const worldHeight = cellToPixel(shopInfo.size[1]);

    // The fit: shop plus apron in view, quantized so layout jitter
    // doesn't wobble the zoom, clamped to the same [0.5, 2] band.
    const fit = Math.min(
      viewWidth / (worldWidth + LOT_APRON * 2),
      viewHeight / (worldHeight + LOT_APRON * 2),
    );
    const scale = Math.min(2, Math.max(0.5, Math.floor(fit * 20) / 20));
    const offsetX = Math.round((viewWidth - worldWidth * scale) / 2);
    const offsetY = Math.round((viewHeight - worldHeight * scale) / 2);

    // How far the camera can follow the player down the lot: at full
    // scroll the viewport's bottom reaches past the sidewalk line with
    // a little ground under the customers' feet.
    const seenBottomCells = sidewalkY(shopInfo) + 1.5;
    const scrollMax = Math.max(
      0,
      cellToPixel(seenBottomCells) - (viewHeight - offsetY) / scale,
    );

    // Indoors the framing holds still; outdoors the camera centers the
    // player, clamped to [0, scrollMax].
    const playerYPx = player.position[1] * PIXELS_PER_CELL;
    const centered = playerYPx - (viewHeight / 2 - offsetY) / scale;
    const outdoors = player.position[1] > shopInfo.size[1];
    const target = outdoors ? Math.min(Math.max(centered, 0), scrollMax) : 0;

    const clampedDt = Math.min(dt, 0.1);
    const snap = this.snap || this.firstFrame;
    this.firstFrame = false;
    const eased = snap
      ? target
      : this.scroll +
        (target - this.scroll) * (1 - Math.exp(-FOLLOW_RATE * clampedDt));
    this.scroll = Math.abs(target - eased) < 0.1 ? target : eased;

    // Express the framing as a camera: zoom is the fit, and the camera's
    // center is wherever the framing puts the middle of the screen.
    const camera = game.camera;
    camera.z = scale;
    camera.x = (viewWidth / 2 - offsetX) / scale;
    camera.y = (viewHeight / 2 - offsetY) / scale + this.scroll;
    camera.vx = 0;
    camera.vy = 0;
  }
}
