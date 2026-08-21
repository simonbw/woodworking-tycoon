import { Container, Graphics, RenderTexture, Sprite } from "pixi.js";
import {
  easedColor,
  easeFraction,
  packed,
  stepColor,
} from "../../../views/daylight-tween";
import { WALL_THICKNESS } from "../../../views/EnvironmentView";
import { cellToPixel } from "../../../views/shop-scale";
import { Persistence } from "../../../config/constants";
import { BaseEntity } from "../../../core/entity/BaseEntity";
import { Entity } from "../../../core/entity/Entity";
import { GameSprite } from "../../../core/entity/GameSprite";
import { on } from "../../../core/entity/handler";
import { Daylight, daylightAt } from "../../../game/daylight";
import { StoreLayout } from "../../../game/store-layout";
import { TICKS_PER_DAY } from "../../../game/time";
import { Clock } from "../../../sim/singletons/Clock";

/**
 * The hour of the day over the store's lot — the old StoreDaylightLayer
 * as an entity view: the same day/night model the garage runs
 * (daylight.ts), as the same kind of multiply mask. The store's mask is
 * the simple end of that design: the sky's ambient over the lot, the
 * building's shadow swept from its walls, and the sales floor painted
 * back to full brightness — a big-box interior is lit the same at noon
 * and closing time, so only the outside tells the hour. No lamps and no
 * door spill: the fixtures indoors never turn off, and the glass
 * storefront keeps the seam at the wall soft enough without one.
 */

/** The building shadow's noon length in world pixels. */
const SHADOW_UNIT = 21;

/** Stop repainting once the eased values settle (see DaylightView). */
const SETTLED = 0.4;

export class StoreDaylightView extends BaseEntity implements Entity {
  persistenceLevel: number = Persistence.Level;
  pausable = false;

  private mask: Sprite & GameSprite;
  private texture: RenderTexture | null = null;

  private ambient = new Graphics();
  private shadow = new Graphics();
  private indoors = new Graphics();
  private wrapper = new Container();

  private eased: {
    outdoor: ReturnType<typeof easedColor>;
    shadowTint: ReturnType<typeof easedColor>;
    shadowDx: number;
    shadowDy: number;
  } | null = null;

  private originX = 0;
  private originY = 0;

  /** Whether the current texture holds a real paint — a blank multiply
   * mask would black the world out, so the sprite stays hidden until
   * paint() reports success. */
  private painted = false;

  constructor(private layout: StoreLayout) {
    super();
    this.mask = new Sprite() as Sprite & GameSprite;
    this.mask.layerName = "daylight";
    this.mask.blendMode = "multiply";
    this.mask.eventMode = "none";
    this.mask.visible = false;
    this.sprite = this.mask;

    // Order is load-bearing: the shadow multiplies over the ambient, and
    // the interior fill repaints the slab to full brightness over both —
    // the sales floor is lit from inside, so no sky and no shadow reach
    // it.
    this.wrapper.addChild(this.ambient, this.shadow, this.indoors);
    this.shadow.blendMode = "multiply";
  }

  @on("destroy")
  onDestroy() {
    this.texture?.destroy(true);
    this.texture = null;
    this.wrapper.destroy({ children: true });
  }

  private targetLight(): Daylight | undefined {
    const clock = this.game.entities.tryGetSingleton(Clock);
    if (!clock) return undefined;
    return daylightAt(clock.dayTicksSpent() / TICKS_PER_DAY, clock.isNight());
  }

  private paint(): boolean {
    const renderer = this.game.renderer?.app.renderer;
    if (!renderer || !this.texture || !this.eased) return false;
    const now = this.eased;
    const texWidth = this.texture.width;
    const texHeight = this.texture.height;
    const slabX = -this.originX;
    const slabY = -this.originY;
    const width = cellToPixel(this.layout.interior[0]);
    const height = cellToPixel(this.layout.interior[1]);

    // 1. The sky, over everything the camera can see.
    this.ambient.clear();
    this.ambient.rect(0, 0, texWidth, texHeight);
    this.ambient.fill(packed(now.outdoor));

    // 2. The building's shadow: the swept hull of the footprint and its
    //    offset copy, so the shadow stays attached to the walls it
    //    falls from.
    this.shadow.clear();
    const shadowTint = packed(now.shadowTint);
    const ox = now.shadowDx * SHADOW_UNIT;
    const oy = now.shadowDy * SHADOW_UNIT;
    if (shadowTint !== 0xffffff) {
      const x0 = slabX - WALL_THICKNESS;
      const y0 = slabY - WALL_THICKNESS;
      const w = width + WALL_THICKNESS * 2;
      const h = height + WALL_THICKNESS * 2;
      // prettier-ignore
      const points =
        ox >= 0
          ? [x0,y0, x0+w,y0, x0+w+ox,y0+oy, x0+w+ox,y0+h+oy, x0+ox,y0+h+oy, x0,y0+h]
          : [x0+ox,y0+oy, x0+w+ox,y0+oy, x0+w,y0, x0+w,y0+h, x0+w+ox,y0+h+oy, x0+ox,y0+h+oy];
      this.shadow.poly(points);
      this.shadow.fill(shadowTint);
    }

    // 3. The sales floor, lit from inside at every hour.
    this.indoors.clear();
    this.indoors.rect(slabX, slabY, width, height);
    this.indoors.fill(0xffffff);

    renderer.render({
      container: this.wrapper,
      target: this.texture,
      clear: true,
    });
    return true;
  }

  @on("render")
  onRender(dt: number) {
    const game = this.game;
    const renderer = game.renderer;
    const want = this.targetLight();
    if (!renderer || !want) {
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
        shadowTint: easedColor(want.shadow.tint),
        shadowDx: want.shadow.dx,
        shadowDy: want.shadow.dy,
      };
    }
    const now = this.eased;

    // Chase the clock's light at the tween's own steady pace.
    const t = easeFraction(dt * 1000);
    const beforeOutdoor = packed(now.outdoor);
    const beforeShadowTint = packed(now.shadowTint);
    const nextOutdoor = stepColor(now.outdoor, want.outdoorTint, t);
    const nextShadowTint = stepColor(now.shadowTint, want.shadow.tint, t);
    const beforeShadowX = now.shadowDx;
    now.shadowDx += (want.shadow.dx - now.shadowDx) * t;
    now.shadowDy += (want.shadow.dy - now.shadowDy) * t;
    const lightMoved =
      nextOutdoor !== beforeOutdoor ||
      nextShadowTint !== beforeShadowTint ||
      Math.abs(now.shadowDx - beforeShadowX) * SHADOW_UNIT > SETTLED;

    // The mask covers what the camera sees right now; the origin follows
    // the pan, and geometry is drawn in texture space, so a moved origin
    // needs a repaint too.
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
      this.painted = false;
      fresh = true;
    }
    const originMoved =
      Math.abs(viewport.left - this.originX) > 0.01 ||
      Math.abs(viewport.top - this.originY) > 0.01;
    this.originX = viewport.left;
    this.originY = viewport.top;
    this.mask.position.set(this.originX, this.originY);

    if (fresh || originMoved || lightMoved || !this.painted) {
      this.painted = this.paint();
    }
    this.mask.visible = this.painted;
  }
}
