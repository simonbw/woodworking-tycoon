import { Graphics as PixiGraphics } from "@pixi/graphics";
import { Graphics } from "@pixi/react";
import React, { useCallback } from "react";
import { FinishedProduct } from "../../game/Materials";
import { colorBySpecies } from "../shop-view/colorBySpecies";

export const FinishedBoxSprite: React.FC<{
  material: FinishedProduct;
}> = ({ material }) => {
  return (
    <Graphics
      draw={useCallback((g: PixiGraphics) => {
        g.clear();
        g.beginFill(colorBySpecies[material.species].primary);
        g.lineStyle(1, colorBySpecies[material.species].secondary);
        g.drawRect(-10, -10, 20, 20);
        g.endFill();
      }, [])}
    />
  );
};
