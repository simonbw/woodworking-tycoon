import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { Machine } from "../../game/Machine";
import { MaterialSprite } from "../material-sprites/MaterialSprite";
import { PIXELS_PER_CELL } from "../shop-view/shop-scale";

export const SalesTableSprite: React.FC<{ machine: Machine }> = ({
  machine,
}) => {
  const { inputMaterials } = machine;

  return (
    <pixiContainer>
      <pixiGraphics
        draw={useCallback((g: Graphics) => {
          g.clear();
          const size = PIXELS_PER_CELL * 0.85;
          const half = size / 2;

          // Folding table top
          g.roundRect(-half, -half, size, size, 4);
          g.fill({ color: 0xd9d4c5 }); // plastic table top
          g.roundRect(-half, -half, size, size, 4);
          g.stroke({ width: 2, color: 0x8a8578 });

          // Cash box in the corner
          const boxSize = size * 0.28;
          g.roundRect(
            half - boxSize - 3,
            -half + 3,
            boxSize,
            boxSize * 0.75,
            2,
          );
          g.fill({ color: 0x4a5d23 }); // money-green box
          g.circle(half - boxSize / 2 - 3, -half + 3 + boxSize * 0.375, 1.5);
          g.fill({ color: 0xc9b783 }); // latch
        }, [])}
      />
      {inputMaterials.map((material, index) => (
        <pixiContainer
          x={-PIXELS_PER_CELL * 0.15 + (index % 2) * 6}
          y={PIXELS_PER_CELL * 0.05 + Math.floor(index / 2) * 5}
          angle={index * 15 - 10}
          key={`in-${index}`}
        >
          <MaterialSprite material={material} />
        </pixiContainer>
      ))}
    </pixiContainer>
  );
};
