import {
  Container,
  FillGradient,
  Graphics,
  RenderTexture,
  Sprite,
} from "pixi.js";
import {
  easedColor,
  easeFraction,
  packed,
  stepColor,
} from "../components/shop-view/daylight-tween";
import { cellToPixel } from "../components/shop-view/shop-scale";
import { Persistence } from "../config/constants";
import { BaseEntity } from "../core/entity/BaseEntity";
import { Entity } from "../core/entity/Entity";
import { GameSprite } from "../core/entity/GameSprite";
import { on } from "../core/entity/handler";
import { Daylight, daylightAt, LAMP_LIGHT } from "../game/daylight";
import { TICKS_PER_DAY } from "../game/time";
import { Clock } from "../sim/singletons/Clock";
import { ShopInfo } from "../sim/singletons/ShopInfo";
import { doorSpan, WALL_THICKNESS } from "./EnvironmentView";

/**
 * The hour of the day, as a light mask over the world — the old
 * DaylightLayer as a view entity on the "daylight" layer, reading the
 * Clock singleton for where the sun is.
 *
 * **One buffer, one composite.** Every light in the shop is painted into
 * a single offscreen texture — ambient sky, ambient indoors, the
 * building's shadow taken out of it, the ceiling fixtures and the door
 * spill added into it — and that finished mask is multiplied over the
 * scene exactly once, as the topmost world layer. Light added *into the
 * mask* is bounded by the multiply that follows (a lit driveway comes
 * out concrete-colored and brighter, never white), and a shadow
 * subtracted from it is a shadow in the day's own color. The full
 * rationale lives with `daylightAt` in `src/game/daylight.ts`.
 *
 * The mask covers what the camera currently sees (the old shell sized
 * it to everything the camera could ever see; here the camera's world
 * viewport follows the same framing, so tracking it per frame lands on
 * the same pixels). It only re-renders when something in it actually
 * moved — the light easing, or the camera panning the viewport — and
 * the values it's built from ease per frame rather than per game tick
 * (`daylight-tween.ts`).
 */

/**
 * The pool of light the door throws onto the driveway: an ellipse
 * straddling the threshold, reaching further down the drive than across
 * it. A gradient shape rather than a blurred wedge, deliberately — a
 * BlurFilter silently drops its target's blend mode, which turned the
 * old spill's far end darker than the bare lawn beside it.
 */
const SPILL_REACH = WALL_THICKNESS * 13;
const SPILL_SPREAD = WALL_THICKNESS * 5;

/**
 * How far past the threshold the pool's bright core sits. Centering the
 * ellipse *on* the doorway puts its core exactly on the line where the
 * interior fill clips it away; dropping the core onto the concrete is
 * what makes it look like light coming out of a door.
 */
const SPILL_CORE_DROP = WALL_THICKNESS * 4;

/** How far the lamp pool reaches across the slab, as a share of it. */
const LAMP_POOL_INNER_RADIUS = 0.08;
const LAMP_POOL_OUTER_RADIUS = 0.8;

/**
 * The mask stops being re-rendered once every value it's built from has
 * settled this close to its target — otherwise a light that has visibly
 * finished moving still costs a full-screen redraw every frame forever.
 */
const SETTLED = 0.4;

/**
 * The length of the building's shadow at noon, in world pixels — the unit
 * `daylight.ts` measures the rest of the day against.
 */
const SHADOW_UNIT = 21;

export class DaylightView extends BaseEntity implements Entity {
  persistenceLevel: number = Persistence.Permanent;
  pausable = false;

  private mask: Sprite & GameSprite;
  private texture: RenderTexture | null = null;

  // The stamps the mask is painted from. Order is load-bearing. The
  // doorway corridor repaints plain ambient over the shadow (a multiply
  // stamp can't erase, only darken), so it must sit after the shadow
  // and before the spill, which adds lamp light on top of it in the
  // evening overlap. The spill goes in *before* the interior fill so
  // the opaque slab clips its inner half away: the doorway pool belongs
  // on the driveway, and adding it on top of an already-lit shop would
  // clamp to a flat white patch just inside the door. Everything lives
  // under a wrapper because a blend mode on the root of a
  // renderer.render() call is ignored.
  private ambient = new Graphics();
  private shadow = new Graphics();
  private doorway = new Graphics();
  private spill = new Graphics();
  private indoors = new Graphics();
  private pool = new Graphics();
  private wrapper = new Container();

  private poolFill: FillGradient;
  private spillFill: FillGradient;

  /** The eased light, chasing the clock's target — null until the first
   * render snaps it onto the current hour. */
  private eased: {
    outdoor: ReturnType<typeof easedColor>;
    interior: ReturnType<typeof easedColor>;
    shadowTint: ReturnType<typeof easedColor>;
    lamps: number;
    shadowDx: number;
    shadowDy: number;
  } | null = null;

  /** Where the texture's top-left sits in world pixels. */
  private originX = 0;
  private originY = 0;

  constructor() {
    super();
    this.mask = new Sprite() as Sprite & GameSprite;
    this.mask.layerName = "daylight";
    this.mask.blendMode = "multiply";
    this.mask.eventMode = "none";
    this.mask.visible = false;
    this.sprite = this.mask;

    this.wrapper.addChild(
      this.ambient,
      this.shadow,
      this.doorway,
      this.spill,
      this.indoors,
      this.pool,
    );
    this.shadow.blendMode = "multiply";
    this.pool.blendMode = "add";
    this.spill.blendMode = "add";

    this.poolFill = new FillGradient({
      type: "radial",
      center: { x: 0.5, y: 0.5 },
      innerRadius: LAMP_POOL_INNER_RADIUS,
      outerCenter: { x: 0.5, y: 0.5 },
      outerRadius: LAMP_POOL_OUTER_RADIUS,
      colorStops: [
        { offset: 0, color: LAMP_LIGHT },
        // Black adds nothing, so the pool simply runs out at the walls.
        { offset: 1, color: 0x000000 },
      ],
      textureSpace: "local",
    });

    this.spillFill = new FillGradient({
      type: "radial",
      center: { x: 0.5, y: 0.5 },
      innerRadius: 0,
      outerCenter: { x: 0.5, y: 0.5 },
      outerRadius: 0.5,
      colorStops: [
        { offset: 0, color: LAMP_LIGHT },
        // Holds most of its strength across the near half of the throw
        // before giving out, so the drive is lit rather than merely
        // tinged at one spot.
        { offset: 0.4, color: "rgba(150, 124, 88, 0.9)" },
        { offset: 0.7, color: "rgba(96, 79, 56, 0.45)" },
        // Fades out in *alpha* as well as toward black, so the stop
        // can't paint the ground dark even if something downstream
        // drops the additive blend.
        { offset: 1, color: "rgba(0, 0, 0, 0)" },
      ],
      textureSpace: "local",
    });
  }

  @on("destroy")
  onDestroy() {
    this.texture?.destroy(true);
    this.texture = null;
    this.wrapper.destroy({ children: true });
  }

  /** The light the clock currently calls for. */
  private targetLight(): Daylight | undefined {
    const clock = this.game.entities.tryGetSingleton(Clock);
    if (!clock) return undefined;
    return daylightAt(clock.dayTicksSpent() / TICKS_PER_DAY, clock.isNight());
  }

  /** Paint the mask from the current eased values and composite it. */
  private paint(width: number, height: number): void {
    const renderer = this.game.renderer?.app.renderer;
    if (!renderer || !this.texture || !this.eased) return;
    const shopInfo = this.game.entities.tryGetSingleton(ShopInfo)?.info;
    if (!shopInfo) return;

    const door = doorSpan(shopInfo);
    const now = this.eased;
    const texWidth = this.texture.width;
    const texHeight = this.texture.height;
    const slabX = -this.originX;
    const slabY = -this.originY;

    // 1. The sky, over everything.
    this.ambient.clear();
    this.ambient.rect(0, 0, texWidth, texHeight);
    this.ambient.fill(packed(now.outdoor));

    // 2. The building's shadow: the sun taken off the ground, with the
    //    sky left behind. A flat multiply by a color that is floored at
    //    the sky's own light — blocking the sun cannot take a surface
    //    below what the sky alone gives it.
    this.shadow.clear();
    this.doorway.clear();
    const shadowTint = packed(now.shadowTint);
    const ox = now.shadowDx * SHADOW_UNIT;
    const oy = now.shadowDy * SHADOW_UNIT;
    if (shadowTint !== 0xffffff) {
      const x0 = slabX - WALL_THICKNESS;
      const y0 = slabY - WALL_THICKNESS;
      const w = width + WALL_THICKNESS * 2;
      const h = height + WALL_THICKNESS * 2;
      // The swept hull of the footprint and its offset copy, not the
      // offset copy alone: a cast shadow stays attached to the walls it
      // falls from. The plain offset rect floated free of the building,
      // leaving a sunlit sliver between the wall's base and its own
      // shadow on the up-sun side and a detached dark corner drifting
      // across the driveway.
      // prettier-ignore
      const points =
        ox >= 0
          ? [x0,y0, x0+w,y0, x0+w+ox,y0+oy, x0+w+ox,y0+h+oy, x0+ox,y0+h+oy, x0,y0+h]
          : [x0+ox,y0+oy, x0+w+ox,y0+oy, x0+w,y0, x0+w,y0+h, x0+w+ox,y0+h+oy, x0+ox,y0+h+oy];
      this.shadow.poly(points);
      this.shadow.fill(shadowTint);

      // 2b. Sun through the open garage door. The doorway is a gap in
      //     the bottom wall, so no wall-shadow belongs across it — yet
      //     the hull above shades the whole wall band, opening included.
      //     Repaint the plain outdoor ambient over the corridor the sun
      //     reaches through the gap: the opening's own strip, then a
      //     band sheared along the sun's direction down the driveway.
      const doorL = slabX + door.left;
      const doorR = slabX + door.right;
      const doorTopY = slabY + height;
      const doorBotY = doorTopY + WALL_THICKNESS;
      const yEnd = doorBotY + oy;
      const lead = ox >= 0 ? doorR : doorL;
      const trail = ox >= 0 ? doorL : doorR;
      // prettier-ignore
      this.doorway.poly([
        trail, doorTopY,
        lead, doorTopY,
        lead, doorBotY,
        lead + ox, yEnd,
        trail + (ox * (WALL_THICKNESS + oy)) / oy, yEnd,
      ]);
      this.doorway.fill(packed(now.outdoor));
    }

    // 3. Indoors: its own ambient, replacing the sky over the slab. The
    //    seam is the garage wall.
    this.indoors.clear();
    this.indoors.rect(slabX, slabY, width, height);
    this.indoors.fill(packed(now.interior));

    // 4. The ceiling fixtures, added into the mask over the slab.
    this.pool.clear();
    this.pool.alpha = now.lamps;
    this.pool.renderable = now.lamps > 0.004;
    if (this.pool.renderable) {
      this.pool.rect(slabX, slabY, width, height);
      this.pool.fill(this.poolFill);
    }

    // 5. The same lamps, escaping through the door onto the driveway.
    this.spill.clear();
    this.spill.alpha = now.lamps;
    this.spill.renderable = this.pool.renderable;
    if (this.spill.renderable) {
      // Straddling the threshold, so the pool starts inside the doorway
      // and reaches out onto the drive rather than beginning at a line.
      const doorMid = slabX + (door.left + door.right) / 2;
      this.spill.ellipse(
        doorMid,
        slabY + height + SPILL_CORE_DROP,
        (door.right - door.left) / 2 + SPILL_SPREAD,
        SPILL_REACH,
      );
      this.spill.fill(this.spillFill);
    }

    renderer.render({
      container: this.wrapper,
      target: this.texture,
      clear: true,
    });
  }

  @on("render")
  onRender(dt: number) {
    const game = this.game;
    const renderer = game.renderer;
    const shopInfo = game.entities.tryGetSingleton(ShopInfo)?.info;
    const want = this.targetLight();
    if (!renderer || !shopInfo || !want) {
      // No mask yet: an empty texture would multiply the world to black.
      this.mask.visible = false;
      return;
    }

    // First render snaps onto the current hour rather than easing up
    // from black.
    let fresh = this.eased === null;
    if (this.eased === null) {
      this.eased = {
        outdoor: easedColor(want.outdoorTint),
        interior: easedColor(want.interiorTint),
        shadowTint: easedColor(want.shadow.tint),
        lamps: want.lamps,
        shadowDx: want.shadow.dx,
        shadowDy: want.shadow.dy,
      };
    }
    const now = this.eased;

    // Chase the clock's light at the tween's own steady pace.
    const t = easeFraction(dt * 1000);
    const beforeOutdoor = packed(now.outdoor);
    const beforeInterior = packed(now.interior);
    const beforeShadowTint = packed(now.shadowTint);
    const nextOutdoor = stepColor(now.outdoor, want.outdoorTint, t);
    const nextInterior = stepColor(now.interior, want.interiorTint, t);
    const nextShadowTint = stepColor(now.shadowTint, want.shadow.tint, t);
    const beforeLamps = now.lamps;
    const beforeShadowX = now.shadowDx;
    now.lamps += (want.lamps - now.lamps) * t;
    now.shadowDx += (want.shadow.dx - now.shadowDx) * t;
    now.shadowDy += (want.shadow.dy - now.shadowDy) * t;
    const lightMoved =
      nextOutdoor !== beforeOutdoor ||
      nextInterior !== beforeInterior ||
      nextShadowTint !== beforeShadowTint ||
      Math.abs(now.lamps - beforeLamps) > 0.001 ||
      Math.abs(now.shadowDx - beforeShadowX) * SHADOW_UNIT > SETTLED;

    // The mask covers what the camera sees right now. Size follows the
    // viewport (a resize or zoom change recreates the texture); the
    // origin follows the pan, and geometry is drawn in texture space,
    // so a moved origin needs a repaint too.
    const viewport = game.camera.getWorldViewport();
    const texWidth = Math.max(1, Math.ceil(viewport.width));
    const texHeight = Math.max(1, Math.ceil(viewport.height));
    if (
      !this.texture ||
      this.texture.width !== texWidth ||
      this.texture.height !== texHeight
    ) {
      this.texture?.destroy(true);
      this.texture = RenderTexture.create({
        width: texWidth,
        height: texHeight,
      });
      this.mask.texture = this.texture;
      fresh = true;
    }
    const originMoved =
      Math.abs(viewport.left - this.originX) > 0.01 ||
      Math.abs(viewport.top - this.originY) > 0.01;
    this.originX = viewport.left;
    this.originY = viewport.top;
    this.mask.position.set(this.originX, this.originY);

    // Repainting a settled mask every frame is a full-screen redraw for
    // nothing, and the light is settled the vast majority of the time.
    if (fresh || originMoved || lightMoved) {
      this.paint(cellToPixel(shopInfo.size[0]), cellToPixel(shopInfo.size[1]));
    }
    this.mask.visible = true;
  }
}
