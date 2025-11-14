import React, { useCallback } from "react";
import { Graphics as PixiGraphics } from "pixi.js";
import { omitUndefined } from "../../utils/objectUtils";

export const DefaultMaterialPileSprite: React.FC<{
  alpha?: number;
  tint?: number;
}> = ({ alpha, tint }) => {
  return (
    <pixiGraphics
      {...omitUndefined({ alpha, tint })}
      draw={useCallback((g: PixiGraphics) => {
        g.clear();
        g.rect(-10, -10, 20, 20);
        g.fill(0);
      }, [])}
    />
  );
};
