import { Graphics } from "pixi.js";

/**
 * The shadow a piece throws on the surface under it — ambient
 * occlusion, one rule: height above the surface decides everything.
 * Every inch a piece stands off the table buys SHADOW_PX_PER_STAND_INCH
 * of rim, evenly all around; the same height lightens the shadow (a
 * riser blocks a shrinking share of the light dome) and IS the softness
 * — the falloff band spans the whole spread, so a piece near contact
 * casts a tight dark line and a tall one a wide pale pool. A 2x4 flat,
 * on edge, and on end wear three distinct shadows; picking a piece up
 * adds the carry's inches on top.
 *
 * The stand height is capped so a very tall piece (a board on end)
 * darkens a generous rim rather than half the bench; the carried lift
 * adds past the cap, so lifting always visibly spreads the pool. The
 * penumbra is SOFT_RINGS stacked fills — no blur filter, so a floor of
 * piles pays for geometry, not render passes. Every material's stand
 * height lives in materialShadow.ts; pieces built from parts cast one
 * shadow for the whole piece there.
 */

/** How much rim one inch of stand height buys. */
export const SHADOW_PX_PER_STAND_INCH = 1.5;

/** Stand height past which the resting rim stops growing. */
const SHADOW_STAND_CAP_IN = 6;

/** Darkness at contact; height fades it (see alpha below). */
const CONTACT_ALPHA = 0.26;

/** Inches of height that cost the shadow half its contact darkness. */
const ALPHA_FADE_HEIGHT_IN = 6;

/** Fills in the penumbra stack. */
const SOFT_RINGS = 5;

export function drawContactShadow(
  g: Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  standInches: number,
  options: {
    radius?: number;
    /** Inches the piece is held off the surface (the carried lift),
     * spreading and fading the pool past the resting cap. */
    liftInches?: number;
  } = {},
): void {
  const { radius = 0, liftInches = 0 } = options;
  const heightIn = Math.min(standInches, SHADOW_STAND_CAP_IN) + liftInches;
  const spread = heightIn * SHADOW_PX_PER_STAND_INCH;
  const core = CONTACT_ALPHA / (1 + heightIn / ALPHA_FADE_HEIGHT_IN);
  // The stacked rings share one per-layer alpha, so coverage eases from
  // the full core under the piece to nothing at the rim — a penumbra
  // whose width is exactly the spread. Corners round with their offset,
  // the way a real blur rounds a rectangle.
  const layerAlpha = 1 - Math.pow(1 - core, 1 / SOFT_RINGS);
  for (let ring = SOFT_RINGS; ring >= 1; ring--) {
    const s = (spread * ring) / SOFT_RINGS;
    g.roundRect(x - s, y - s, width + s * 2, height + s * 2, radius + s);
    g.fill({ color: 0x000000, alpha: layerAlpha });
  }
}
