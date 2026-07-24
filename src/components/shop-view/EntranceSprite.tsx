import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { DOOR_HALF_WIDTH } from "../../game/ShopInfo";
import { useGameState } from "../useGameState";
import { PIXELS_PER_CELL, cellToPixelVec } from "./shop-scale";

/**
 * The garage-door threshold along the entrance's outer edge — a faint
 * hazard-striped strip marking where deliveries land, so crates showing up
 * there read as "came in through the door". The strip spans the full door
 * width (see DOOR_HALF_WIDTH), centered on the entrance cell.
 */
export const EntranceSprite: React.FC = () => {
  const gameState = useGameState();
  const [x, y] = cellToPixelVec(gameState.shopInfo.entrancePosition);

  const draw = useCallback((g: Graphics) => {
    g.clear();
    const stripHeight = 10;
    const left = -DOOR_HALF_WIDTH * PIXELS_PER_CELL;
    const width = (DOOR_HALF_WIDTH * 2 + 1) * PIXELS_PER_CELL;
    const top = PIXELS_PER_CELL - stripHeight;
    g.rect(left, top, width, stripHeight);
    g.fill({ color: 0x2b2b2b, alpha: 0.5 });
    for (let sx = left - stripHeight; sx < left + width; sx += 16) {
      g.moveTo(sx, PIXELS_PER_CELL);
      g.lineTo(sx + stripHeight, top);
      g.stroke({ width: 5, color: 0xd9a441, alpha: 0.5 });
    }
  }, []);

  return (
    <pixiContainer x={x} y={y}>
      <pixiGraphics draw={draw} />
    </pixiContainer>
  );
};
