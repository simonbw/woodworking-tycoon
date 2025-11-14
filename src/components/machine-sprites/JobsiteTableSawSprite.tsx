import React from "react";
import { animated, useSpring } from "react-spring";
import { Machine } from "../../game/Machine";
import { BOARD_DIMENSIONS } from "../../game/Materials";
import { isBoard } from "../../game/board-helpers";
import { useTexture } from "../../utils/useTexture";
import { MaterialSprite } from "../material-sprites/MaterialSprite";
import { IMAGE_SCALE } from "../shop-view/MachineSprite";
import {
  PIXELS_PER_INCH,
  feetToPixels,
  inchesToPixels,
} from "../shop-view/shop-scale";
import { extractFirstNumber } from "./extractFirstNumber";

const AnimatedPixiContainer = animated("pixiContainer");

export const JobsiteTableSawSprite: React.FC<Machine> = (machine) => {
  const { inputMaterials, outputMaterials } = machine;
  const tableSawTableTexture = useTexture("/images/jobsite-table-saw-table.png");
  const tableSawFenceTexture = useTexture("/images/jobsite-table-saw-fence.png");

  const ripWidth =
    extractFirstNumber(machine.selectedOperation.id) ||
    Math.max(...BOARD_DIMENSIONS);
  const fencePosition = ripWidth * PIXELS_PER_INCH;

  const springProps = useSpring({
    x: fencePosition
  });

  return (
    <pixiContainer>
      <pixiSprite
        texture={tableSawTableTexture}
        scale={IMAGE_SCALE * 0.8}
        anchor={0.5}
      />
      <AnimatedPixiContainer x={springProps.x}>
        {inputMaterials.filter(isBoard).map((board, index) => {
          return (
            <pixiContainer
              angle={index * 10}
              y={feetToPixels(board.length / 2) + inchesToPixels(2)}
              x={-inchesToPixels(board.width / 2 + board.thickness / 4)}
              key={`in-${index}`}
            >
              <MaterialSprite material={board} key={index} />
            </pixiContainer>
          );
        })}
        {outputMaterials.filter(isBoard).map((board, index) => {
          return (
            <pixiContainer
              angle={-index - 1}
              y={-feetToPixels(board.length / 2) - inchesToPixels(3)}
              x={-inchesToPixels(board.width / 2 + board.thickness / 4)}
              key={`out-${index}`}
            >
              <MaterialSprite material={board} key={index} />
            </pixiContainer>
          );
        })}
        <pixiSprite
          texture={tableSawFenceTexture}
          scale={IMAGE_SCALE * 0.8}
          anchor={0.5}
        />
      </AnimatedPixiContainer>
    </pixiContainer>
  );
};
