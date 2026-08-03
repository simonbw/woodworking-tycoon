import React from "react";
import { FinishedProduct } from "../../game/Materials";
import { mixColors } from "../../utils/colorUtils";
import { omitUndefined } from "../../utils/objectUtils";
import { useTexture } from "../../utils/useTexture";
import { colorBySpecies } from "../shop-view/colorBySpecies";

/**
 * The furniture pieces — shelves, the bookshelf, the side table — are the
 * one corner of the shop drawn from pixel art rather than `Graphics`. The
 * art is exported at `PIXELS_PER_INCH`, so it renders at scale 1 and the
 * sprite's pixels line up with world pixels.
 *
 * Each piece is drawn in a neutral wood and tinted by species, the way
 * `MaterialSprite` already colors everything else. A caller-supplied
 * `tint` multiplies on top of that rather than replacing it.
 */

/**
 * How far the species color is lightened toward white before it becomes a
 * tint. The art already carries its own mid-tone brown, and multiplying two
 * browns straight together crushes walnut and mahogany into near-black.
 */
const SPECIES_TINT_SOFTENING = 0.3;

const FURNITURE_TEXTURES = {
  shelf: "/images/shelf.png",
  bookshelf: "/images/bookshelf.png",
  sideTable: "/images/side-table.png",
} as const;

export type FurnitureType = keyof typeof FURNITURE_TEXTURES;

export function isFurniture(type: string): type is FurnitureType {
  return type in FURNITURE_TEXTURES;
}

/**
 * World-space extent each furniture icon has to cover: the longest side of
 * that piece's art, so every one fills its frame. A shared fit would be
 * truer to how the pieces compare in size, but icons are drawn at around
 * 24px and legibility wins over scale at that size.
 */
export const FURNITURE_ICON_FIT: Record<FurnitureType, number> = {
  shelf: 79,
  bookshelf: 43,
  sideTable: 51,
};

export const FurnitureSprite: React.FC<{
  material: FinishedProduct & { type: FurnitureType };
  alpha?: number;
  tint?: number;
}> = ({ material, alpha, tint }) => {
  const texture = useTexture(FURNITURE_TEXTURES[material.type]);
  const species = mixColors(
    colorBySpecies[material.species].primary,
    0xffffff,
    SPECIES_TINT_SOFTENING,
  );

  return (
    <pixiSprite
      texture={texture}
      anchor={0.5}
      tint={tint === undefined ? species : multiplyColors(species, tint)}
      {...omitUndefined({ alpha })}
    />
  );
};

/** Channel-wise multiply, matching how PIXI would stack two tints. */
function multiplyColors(a: number, b: number): number {
  const channel = (shift: number) =>
    Math.round((((a >> shift) & 0xff) * ((b >> shift) & 0xff)) / 0xff) << shift;
  return channel(16) | channel(8) | channel(0);
}
