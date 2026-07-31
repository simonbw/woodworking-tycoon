import React from "react";
import { MaterialPile } from "../../game/GameState";
import { cellToPixelVec } from "./shop-scale";
import { MaterialSprite } from "../material-sprites/MaterialSprite";
import { TARGET_HIGHLIGHT_FILTERS } from "./targetHighlight";

/**
 * One pile where it lies: `pile.position` is the piece's center point in
 * continuous cell coordinates and `pile.rotation` is the orientation it
 * was dropped in — piles are free-floating, only machines live on the
 * grid. Render order (drop order) decides what's on top.
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
      rotation={pile.rotation}
      filters={highlighted ? TARGET_HIGHLIGHT_FILTERS : undefined}
    >
      <MaterialSprite material={pile.material} />
    </pixiContainer>
  );
};
