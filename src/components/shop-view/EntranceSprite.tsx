import React from "react";
import { DOOR_HALF_WIDTH } from "../../game/ShopInfo";
import { useTexture } from "../../utils/useTexture";
import { useGameState } from "../useGameState";
import { PIXELS_PER_CELL, cellToPixelVec } from "./shop-scale";

/** Door cell offsets from the entrance, left to right across the opening. */
const DOOR_CELL_OFFSETS = Array.from(
  { length: DOOR_HALF_WIDTH * 2 + 1 },
  (_, i) => i - DOOR_HALF_WIDTH,
);

/**
 * The garage-door threshold along the entrance's outer edge — hazard-striped
 * paint marking where deliveries land, so crates showing up there read as
 * "came in through the door". One painted tile per door cell, spanning the
 * full door width (see DOOR_HALF_WIDTH), centered on the entrance cell.
 */
export const EntranceSprite: React.FC = () => {
  const gameState = useGameState();
  const [x, y] = cellToPixelVec(gameState.shopInfo.entrancePosition);
  const paintTexture = useTexture("/images/door-warning-paint.png");

  return (
    <pixiContainer x={x} y={y}>
      {DOOR_CELL_OFFSETS.map((offset) => (
        <pixiSprite
          key={offset}
          texture={paintTexture}
          x={offset * PIXELS_PER_CELL}
          width={PIXELS_PER_CELL}
          height={PIXELS_PER_CELL}
        />
      ))}
    </pixiContainer>
  );
};
