import { Graphics as PixiGraphics } from "@pixi/graphics";
import { Graphics } from "@pixi/react";
import React, { useCallback } from "react";

export const DefaultMaterialPileSprite: React.FC = () => {
  return (
    <Graphics
      draw={useCallback((g: PixiGraphics) => {
        g.clear();
        g.beginFill(0);
        g.drawRect(-10, -10, 20, 20);
        g.endFill();
      }, [])}
    />
  );
};
