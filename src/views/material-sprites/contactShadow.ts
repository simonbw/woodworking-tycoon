import { Graphics } from "pixi.js";

/**
 * The soft shadow a piece throws on the surface under it — one shadow,
 * drawn as a dense core with a fainter fringe so the edge reads soft
 * without a blur filter. The spread grows with how far the piece stands
 * off that surface — a flat board's thickness, a standing board's
 * width — which is how depth reads from above now that a lying piece
 * draws only its top face. Capped so a tall piece darkens a rim, not
 * the whole bench. Every material's spread lives in materialShadow.ts;
 * pieces built from parts cast one shadow for the whole piece there.
 */
export function drawContactShadow(
  g: Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  standInches: number,
  options: { alpha?: number; radius?: number } = {},
): void {
  const { alpha = 0.1, radius = 0 } = options;
  const spread = Math.min(standInches, 4);
  for (const s of [spread, spread * 2]) {
    const r = radius > 0 ? radius + s : 0;
    g.roundRect(x - s, y - s, width + s * 2, height + s * 2, r);
    g.fill({ color: 0x000000, alpha });
  }
}
