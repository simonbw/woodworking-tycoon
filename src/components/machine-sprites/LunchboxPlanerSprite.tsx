import React from "react";
import { animated, useSpring } from "react-spring";
import { Machine } from "../../game/Machine";
import { BOARD_DIMENSIONS } from "../../game/Materials";
import { isBoard } from "../../game/board-helpers";
import { lerp } from "../../utils/mathUtils";
import { useTexture } from "../../utils/useTexture";
import { MaterialSprite } from "../material-sprites/MaterialSprite";
import { IMAGE_SCALE } from "../shop-view/MachineSprite";
import { PIXELS_PER_INCH, feetToPixels } from "../shop-view/shop-scale";
import { extractFirstNumber } from "./extractFirstNumber";

const AnimatedPixiSprite = animated("pixiSprite");

export const LunchboxPlanerSprite: React.FC<Machine> = (machine) => {
  const { inputMaterials, outputMaterials } = machine;
  const planerBottomTexture = useTexture("/images/lunchbox-planer-bottom.png");
  const planerTopTexture = useTexture("/images/lunchbox-planer-top.png");
  const planerScrewsTexture = useTexture("/images/lunchbox-planer-screws.png");

  const cutThickness =
    extractFirstNumber(machine.selectedOperation.id) ||
    Math.max(...BOARD_DIMENSIONS);

  const springProps = useSpring({
    scale: IMAGE_SCALE + cutThickness * 0.005
  });

  return (
    <pixiContainer>
      <pixiSprite
        texture={planerBottomTexture}
        scale={IMAGE_SCALE}
        anchor={0.5}
      />
      {inputMaterials.filter(isBoard).map((board, index) => (
        <pixiContainer
          key={`in-${index}`}
          angle={0}
          x={lerp(
            -inputMaterials.length * PIXELS_PER_INCH,
            inputMaterials.length * PIXELS_PER_INCH,
            index / inputMaterials.length
          )}
          y={feetToPixels(board.length / 2)}
        >
          <MaterialSprite material={board} key={index} />
        </pixiContainer>
      ))}
      {outputMaterials.filter(isBoard).map((board, index) => (
        <pixiContainer
          key={`out-${index}`}
          angle={0}
          x={lerp(
            -outputMaterials.length * PIXELS_PER_INCH,
            outputMaterials.length * PIXELS_PER_INCH,
            index / outputMaterials.length
          )}
          y={-feetToPixels(board.length / 2)}
        >
          <MaterialSprite material={board} key={index} />
        </pixiContainer>
      ))}
      <AnimatedPixiSprite
        texture={planerTopTexture}
        scale={springProps.scale}
        anchor={0.5}
      />
      <pixiSprite
        texture={planerScrewsTexture}
        scale={IMAGE_SCALE + 0.01}
        anchor={0.5}
      />
    </pixiContainer>
  );
};
