import { Graphics } from "@pixi/react";
import React, { useCallback } from "react";
import { Board } from "../../game/Materials";
import { PixiGraphics } from "../../utils/PixiGraphics";
import { PIXELS_PER_INCH } from "../shop-view/MaterialPileSprite";
import { colorBySpecies } from "../shop-view/colorBySpecies";

export const BoardSprite: React.FC<{
  board: Omit<Board, "id" | "type">;
}> = ({ board }) => {
  const { width: boardWidth, length: boardLength } = board;

  const draw = useCallback(
    (g: PixiGraphics) => {
      g.clear();
      g.beginFill(colorBySpecies[board.species]);
      const width = boardWidth * PIXELS_PER_INCH;
      const height = boardLength * 12 * PIXELS_PER_INCH;
      g.drawRect(-width / 2, -height / 2, width, height);
      g.endFill();
    },
    [board.width, board.length, board.species]
  );

  return <Graphics draw={draw} />;
};
