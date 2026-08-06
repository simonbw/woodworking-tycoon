import React from "react";
import { MaterialPile } from "../../game/GameState";
import { cellToPixelVec } from "./shop-scale";
import { MaterialSprite } from "../material-sprites/MaterialSprite";
import {
  TARGET_HIGHLIGHT_FILTERS,
  TUTORIAL_HIGHLIGHT_FILTERS,
} from "./targetHighlight";

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
  /** Whether the guided opening is pointing the player at this piece. */
  tutorialTarget?: boolean;
  /**
   * Pointing at a piece within reach aims the interact key at it — the
   * cursor's version of rummaging with R. Absent for pieces out of reach:
   * the mouse chooses among what the body can already touch, it doesn't
   * extend the body's reach.
   */
  onHover?: () => void;
  /** Right-click: spread out everything within reach on a card. */
  onRightClick?: () => void;
}> = ({ pile, highlighted, tutorialTarget, onHover, onRightClick }) => {
  const [x, y] = cellToPixelVec(pile.position);
  const inReach = onHover != null || onRightClick != null;
  return (
    <pixiContainer
      x={x}
      y={y}
      rotation={pile.rotation}
      eventMode={inReach ? "static" : "auto"}
      cursor={inReach ? "pointer" : "default"}
      onPointerOver={onHover}
      onRightClick={onRightClick}
      filters={
        highlighted
          ? TARGET_HIGHLIGHT_FILTERS
          : tutorialTarget
            ? TUTORIAL_HIGHLIGHT_FILTERS
            : undefined
      }
    >
      <MaterialSprite material={pile.material} />
    </pixiContainer>
  );
};
