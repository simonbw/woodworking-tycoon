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
import { useMachineActivity } from "../shop-view/useMachineActivity";
import { FeedingBoard } from "./FeedingBoard";

const AnimatedPixiSprite = animated("pixiSprite");

export const LunchboxPlanerSprite: React.FC<{ machine: Machine }> = ({
  machine,
}) => {
  const { inputMaterials, processingMaterials, outputMaterials } = machine;
  const { fraction } = useMachineActivity(machine);
  const planerBottomTexture = useTexture("/images/lunchbox-planer-bottom.png");
  const planerTopTexture = useTexture("/images/lunchbox-planer-top.png");
  const planerScrewsTexture = useTexture("/images/lunchbox-planer-screws.png");

  // The cutter head rides at the target thickness
  const cutThickness =
    Number(machine.selectedParameters?.targetThickness) ||
    Math.max(...BOARD_DIMENSIONS);

  const springProps = useSpring({
    scale: IMAGE_SCALE + cutThickness * 0.005,
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
            index / inputMaterials.length,
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
            index / outputMaterials.length,
          )}
          y={-feetToPixels(board.length / 2)}
        >
          <MaterialSprite material={board} key={index} />
        </pixiContainer>
      ))}
      {processingMaterials.filter(isBoard).map((board, index) => (
        <FeedingBoard
          board={board}
          fraction={fraction}
          fromY={feetToPixels(board.length / 2)}
          toY={-feetToPixels(board.length / 2)}
          x={lerp(
            -processingMaterials.length * PIXELS_PER_INCH,
            processingMaterials.length * PIXELS_PER_INCH,
            index / processingMaterials.length,
          )}
          key={`proc-${index}`}
        />
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
