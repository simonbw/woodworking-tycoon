import { Graphics as PixiGraphics } from "@pixi/graphics";
import { Graphics } from "@pixi/react";
import React, { useCallback } from "react";
import { omitUndefined } from "../../utils/objectUtils";

export const DefaultMaterialPileSprite: React.FC<{
  alpha?: number;
  tint?: number;
}> = ({ alpha, tint }) => {
  return (
    <Graphics
      {...omitUndefined({ alpha, tint })}
      draw={useCallback((g: PixiGraphics) => {
        g.clear();
        g.beginFill(0);
        g.drawRect(-10, -10, 20, 20);
        g.endFill();
      }, [])}
    />
  );
};
