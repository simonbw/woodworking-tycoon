import { Container } from "pixi.js";
import { MaterialInstance } from "../../game/Materials";

/**
 * The seam between the machine arts and the material sprites.
 *
 * The machine renderers stage stock everywhere the old sprites did —
 * boards against a fence, sheets across the horses, a bench's arranged
 * pieces — but the material drawings themselves belong to the
 * material-sprite port (the old `src/components/material-sprites/`),
 * which lands as its own slice of the phase-3 fan-out. Until it
 * registers a builder here, staged stock simply doesn't draw; every
 * placement, angle, and animation around it is already in place.
 */
export interface MaterialSpriteOptions {
  /** Draw a board standing on edge (the old OnEdgeBoardSprite). */
  onEdge?: boolean;
  /** Mirror the drawing across x (a pallet arranged face-down). */
  flipped?: boolean;
}

export type MaterialSpriteBuilder = (
  material: MaterialInstance,
  options?: MaterialSpriteOptions,
) => Container | null;

let builder: MaterialSpriteBuilder = () => null;

/** Called once by the material-sprite port to plug its drawings in. */
export function registerMaterialSpriteBuilder(b: MaterialSpriteBuilder): void {
  builder = b;
}

/**
 * A drawing of one material, centered on its own origin, or null while
 * the material-sprite port hasn't landed.
 */
export function buildMaterialSprite(
  material: MaterialInstance,
  options?: MaterialSpriteOptions,
): Container | null {
  return builder(material, options);
}
