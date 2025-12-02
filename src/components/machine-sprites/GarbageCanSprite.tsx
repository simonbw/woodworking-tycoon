import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { Machine } from "../../game/Machine";
import { MaterialSprite } from "../material-sprites/MaterialSprite";
import { PIXELS_PER_CELL } from "../shop-view/shop-scale";

export const GarbageCanSprite: React.FC<{ machine: Machine }> = ({ machine }) => {
  const { inputMaterials, processingMaterials, outputMaterials } = machine;

  return (
    <pixiContainer>
      <pixiGraphics
        draw={useCallback((g: Graphics) => {
          g.clear();
          const size = PIXELS_PER_CELL * 0.6;
          const halfSize = size / 2;

          // Draw garbage can body (trapezoid shape)
          g.moveTo(-halfSize * 0.8, -halfSize);
          g.lineTo(halfSize * 0.8, -halfSize);
          g.lineTo(halfSize, halfSize);
          g.lineTo(-halfSize, halfSize);
          g.lineTo(-halfSize * 0.8, -halfSize);
          g.fill({ color: 0x4a5568 }); // Gray color

          // Draw lid
          g.rect(-halfSize * 0.9, -halfSize * 1.1, size * 0.9, size * 0.15);
          g.fill({ color: 0x2d3748 }); // Darker gray

          // Draw handle on lid
          g.circle(0, -halfSize * 1.1, size * 0.08);
          g.fill({ color: 0x1a202c }); // Very dark gray
        }, [])}
      />
      {inputMaterials.map((material, index) => (
        <pixiContainer
          y={-PIXELS_PER_CELL * 0.3}
          angle={index * 10}
          key={`in-${index}`}
        >
          <MaterialSprite material={material} key={index} alpha={0.7} />
        </pixiContainer>
      ))}
      {processingMaterials.map((material, index) => (
        <pixiContainer
          y={PIXELS_PER_CELL * 0.1}
          angle={index * 10}
          key={`proc-${index}`}
        >
          <MaterialSprite
            material={material}
            key={index}
            alpha={0.3}
            tint={0xff6666}
          />
        </pixiContainer>
      ))}
    </pixiContainer>
  );
};
