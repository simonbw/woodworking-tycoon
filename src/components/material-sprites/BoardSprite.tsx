import { Graphics } from "@pixi/react";
import React, { useCallback } from "react";
import { Board } from "../../game/Materials";
import { PixiGraphics } from "../../utils/PixiGraphics";
import { colorBySpecies } from "../shop-view/colorBySpecies";
import { INCHES_PER_FOOT, PIXELS_PER_INCH } from "../shop-view/shop-scale";

export const BoardSprite: React.FC<
  {
    board: Omit<Board, "id" | "type">;
  } & React.ComponentProps<typeof Graphics>
> = ({ board, ...rest }) => {
  const { width: boardWidth, length: boardLength, thickness, species } = board;

  const draw = useCallback(
    (g: PixiGraphics) => {
      g.clear();
      const width = boardWidth * PIXELS_PER_INCH;
      const height = boardLength * PIXELS_PER_INCH * INCHES_PER_FOOT;
      const depth = (thickness * PIXELS_PER_INCH) / 4;

      // shadow
      for (const shadowWidth of [1, 2]) {
        g.beginFill(0x000000, 0.1);
        g.drawRect(
          -width / 2 - shadowWidth,
          -height / 2 - shadowWidth,
          width + depth + shadowWidth * 2,
          height + shadowWidth * 2
        );
        g.endFill();
      }

      // main board
      g.beginFill(colorBySpecies[species].primary);
      g.drawRect(-width / 2, -height / 2, width, height);
      g.endFill();

      // edge
      g.beginFill(colorBySpecies[species].secondary);
      g.drawRect(width / 2, -height / 2, depth, height);
      g.endFill();
    },
    [boardWidth, boardLength, thickness, species]
  );

  return (
    <Graphics
      {...rest}
      {...(rest.alpha !== undefined && { alpha: rest.alpha })}
      {...(rest.tint !== undefined && { tint: rest.tint })}
      draw={draw}
    />
  );
};
