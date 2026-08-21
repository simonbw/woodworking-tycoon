import { Graphics } from "pixi.js";

/**
 * The shadow a piece throws on the surface under it: one fill, one
 * edge, and one rule — every inch the piece stands off that surface
 * adds SHADOW_PX_PER_STAND_INCH of rim, evenly all around. A 2x4 lying
 * flat stands 2" and wears a 3px rim; tipped onto its edge it stands
 * 4" and the rim doubles; picked up, the carry adds its lift height on
 * top. That one linear rule is how depth reads from above, now that a
 * lying piece draws only its top face.
 *
 * The stand height is capped so a very tall piece (a board on end)
 * darkens a generous rim rather than half the bench; the carried lift
 * adds past the cap, so lifting always visibly spreads the pool.
 * Every material's stand height lives in materialShadow.ts; pieces
 * built from parts cast one shadow for the whole piece there.
 */

/** How much rim one inch of stand height buys. */
export const SHADOW_PX_PER_STAND_INCH = 1.5;

/** Stand height past which the resting rim stops growing. */
const SHADOW_STAND_CAP_IN = 6;

/** The one darkness — size, not shade, is the depth signal. */
export const CONTACT_SHADOW_ALPHA = 0.16;

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
     * spreading the rim past the resting cap. */
    liftInches?: number;
  } = {},
): void {
  const { radius = 0, liftInches = 0 } = options;
  const spread =
    (Math.min(standInches, SHADOW_STAND_CAP_IN) + liftInches) *
    SHADOW_PX_PER_STAND_INCH;
  const r = radius > 0 ? radius + spread : 0;
  g.roundRect(
    x - spread,
    y - spread,
    width + spread * 2,
    height + spread * 2,
    r,
  );
  g.fill({ color: 0x000000, alpha: CONTACT_SHADOW_ALPHA });
}
