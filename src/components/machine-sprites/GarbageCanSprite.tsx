import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { Machine } from "../../game/Machine";
import { MaterialSprite } from "../material-sprites/MaterialSprite";
import { PIXELS_PER_CELL } from "../shop-view/shop-scale";

export const GarbageCanSprite: React.FC<{ machine: Machine }> = ({
  machine,
}) => {
  const { inputMaterials, processingMaterials, outputMaterials } = machine;

  return (
    <pixiContainer>
      <pixiGraphics
        draw={useCallback((g: Graphics) => {
          g.clear();
          const radius = (PIXELS_PER_CELL * 0.7) / 2;

          // Drop shadow offset toward the lower right
          g.circle(radius * 0.08, radius * 0.1, radius);
          g.fill({ color: 0x000000, alpha: 0.15 });

          // Rolled outer rim
          g.circle(0, 0, radius);
          g.fill({ color: 0x718096 });
          g.circle(0, 0, radius);
          g.stroke({ width: 1.5, color: 0x2d3748 });

          // Lid surface inset within the rim
          g.circle(0, 0, radius * 0.85);
          g.fill({ color: 0x4a5568 });

          // Concentric ridges pressed into the lid
          g.circle(0, 0, radius * 0.62);
          g.stroke({ width: 1.5, color: 0x3b475c });
          g.circle(0, 0, radius * 0.38);
          g.stroke({ width: 1.5, color: 0x3b475c });

          // Highlight catching light from the upper left
          const highlightRadius = radius * 0.92;
          const highlightStart = Math.PI * 1.05;
          g.moveTo(
            Math.cos(highlightStart) * highlightRadius,
            Math.sin(highlightStart) * highlightRadius,
          );
          g.arc(0, 0, highlightRadius, highlightStart, Math.PI * 1.45);
          g.stroke({ width: 2, color: 0xa0aec0, alpha: 0.8 });

          // Handle bar across the center of the lid
          g.roundRect(-radius * 0.4, -radius * 0.09, radius * 0.8, radius * 0.18, radius * 0.09);
          g.fill({ color: 0x2d3748 });
        }, [])}
      />
      {inputMaterials.map((material, index) => (
        <pixiContainer angle={index * 25 + 10} scale={0.7} key={`in-${index}`}>
          <MaterialSprite material={material} key={index} alpha={0.7} />
        </pixiContainer>
      ))}
      {processingMaterials.map((material, index) => (
        <pixiContainer angle={index * 25 + 10} scale={0.7} key={`proc-${index}`}>
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
