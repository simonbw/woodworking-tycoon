import React from "react";
import { MaterialPile } from "../../game/GameState";
import { cellToPixelVec } from "./shop-scale";
import { MaterialSprite } from "../material-sprites/MaterialSprite";
import { TARGET_HIGHLIGHT_FILTERS } from "./targetHighlight";

/**
 * How far a resting piece is turned off square, in degrees. Deterministic
 * per piece (hashed from the material's id) so a stack of pieces set down
 * on the same spot fans apart naturally instead of merging into one
 * silhouette — and stays put across renders and reloads.
 */
const REST_ANGLE_RANGE = 15;

function restAngle(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return ((hash % 1000) / 1000) * 2 * REST_ANGLE_RANGE - REST_ANGLE_RANGE;
}

/**
 * One pile where it lies: `pile.position` is the piece's center point in
 * continuous cell coordinates — piles are free-floating, only machines
 * live on the grid. Render order (drop order) decides what's on top.
 */
export const MaterialPileSprite: React.FC<{
  pile: MaterialPile;
  /**
   * Whether this is the pile the interact key is about to pick up; it
   * wears the shared targeting outline, so of a stack it's always clear
   * which piece E grabs.
   */
  highlighted?: boolean;
}> = ({ pile, highlighted }) => {
  const [x, y] = cellToPixelVec(pile.position);
  return (
    <pixiContainer
      x={x}
      y={y}
      angle={restAngle(pile.material.id)}
      filters={highlighted ? TARGET_HIGHLIGHT_FILTERS : undefined}
    >
      <MaterialSprite material={pile.material} />
    </pixiContainer>
  );
};
