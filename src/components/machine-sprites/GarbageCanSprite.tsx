import React from "react";
import { Machine } from "../../game/Machine";
import { useTexture } from "../../utils/useTexture";
import { MaterialSprite } from "../material-sprites/MaterialSprite";
import { IMAGE_SCALE } from "../shop-view/MachineSprite";
import { PIXELS_PER_CELL } from "../shop-view/shop-scale";

export const GarbageCanSprite: React.FC<{ machine: Machine }> = ({
  machine,
}) => {
  const { inputMaterials, processingMaterials } = machine;
  const canTexture = useTexture("/images/garbage-can.png");

  // The can is centered on its 2×2-ft footprint, whose center sits half a
  // cell past the origin cell's center.
  return (
    <pixiContainer x={PIXELS_PER_CELL * 0.5} y={PIXELS_PER_CELL * 0.5}>
      <pixiSprite texture={canTexture} scale={IMAGE_SCALE} anchor={0.5} />
      {inputMaterials.map((material, index) => (
        <pixiContainer angle={index * 25 + 10} scale={0.7} key={`in-${index}`}>
          <MaterialSprite material={material} key={index} alpha={0.7} />
        </pixiContainer>
      ))}
      {processingMaterials.map((material, index) => (
        <pixiContainer
          angle={index * 25 + 10}
          scale={0.7}
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
