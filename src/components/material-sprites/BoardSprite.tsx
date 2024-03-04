import { Graphics } from "@pixi/react";
import React, { useCallback } from "react";
import { Board } from "../../game/Materials";
import { PixiGraphics } from "../../utils/PixiGraphics";
import { colorBySpecies } from "../shop-view/colorBySpecies";
import { PIXELS_PER_INCH } from "../shop-view/shop-scale";

const INCHES_PER_FOOT = 6; // yeah, that's dumb, I know
export const BoardSprite: React.FC<
  {
    board: Omit<Board, "id" | "type">;
  } & React.ComponentProps<typeof Graphics>
> = ({ board, ...rest }) => {
  const { width: boardWidth, length: boardLength, thickness, species } = board;

  const draw = useCallback(
    (g: PixiGraphics) => {
      g.clear();
      g.beginFill(colorBySpecies[species].primary);
      const width = boardWidth * PIXELS_PER_INCH;
      const height = boardLength * PIXELS_PER_INCH * INCHES_PER_FOOT;
      const depth = (thickness * PIXELS_PER_INCH) / 4;
      g.drawRect(-width / 2, -height / 2, width, height);
      g.endFill();

      g.beginFill(colorBySpecies[species].secondary);
      g.drawRect(width / 2, -height / 2, depth, height);
      g.endFill();
    },
    [boardWidth, boardLength, thickness, species]
  );

  return <Graphics {...rest} draw={draw} />;
};
