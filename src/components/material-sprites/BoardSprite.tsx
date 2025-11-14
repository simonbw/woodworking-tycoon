import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { Board } from "../../game/Materials";
import { omitUndefined } from "../../utils/objectUtils";
import { colorBySpecies } from "../shop-view/colorBySpecies";
import { INCHES_PER_FOOT, PIXELS_PER_INCH } from "../shop-view/shop-scale";

export const BoardSprite: React.FC<
  {
    board: Omit<Board, "id" | "type">;
  } & Omit<React.ComponentProps<"pixiGraphics">, "draw">
> = ({ board, ...rest }) => {
  const { width: boardWidth, length: boardLength, thickness, species } = board;

  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      const width = boardWidth * PIXELS_PER_INCH;
      const height = boardLength * PIXELS_PER_INCH * INCHES_PER_FOOT;
      const depth = (thickness * PIXELS_PER_INCH) / 4;

      // shadow
      for (const shadowWidth of [1, 2]) {
        g.rect(
          -width / 2 - shadowWidth,
          -height / 2 - shadowWidth,
          width + depth + shadowWidth * 2,
          height + shadowWidth * 2
        );
        g.fill({ color: 0x000000, alpha: 0.1 });
      }

      // main board
      g.rect(-width / 2, -height / 2, width, height);
      g.fill(colorBySpecies[species].primary);

      // edge
      g.rect(width / 2, -height / 2, depth, height);
      g.fill(colorBySpecies[species].secondary);
    },
    [boardWidth, boardLength, thickness, species]
  );

  return <pixiGraphics {...omitUndefined(rest)} draw={draw} />;
};
