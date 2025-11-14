import React from "react";
import { Machine } from "../../game/Machine";
import { BOARD_DIMENSIONS } from "../../game/Materials";
import { isBoard } from "../../game/board-helpers";
import { useTexture } from "../../utils/useTexture";
import { MaterialSprite } from "../material-sprites/MaterialSprite";
import { IMAGE_SCALE } from "../shop-view/MachineSprite";
import { feetToPixels, inchesToPixels } from "../shop-view/shop-scale";
import { extractFirstNumber } from "./extractFirstNumber";

export const MiterSawSprite: React.FC<Machine> = (machine) => {
  const { inputMaterials, outputMaterials } = machine;
  const miterSawBaseTexture = useTexture("/images/miter-saw-base.png");
  const miterSawTopTexture = useTexture("/images/miter-saw-top.png");

  const cutLength =
    extractFirstNumber(machine.selectedOperation.id) ||
    Math.max(...BOARD_DIMENSIONS);

  return (
    <pixiContainer>
      <pixiSprite
        texture={miterSawBaseTexture}
        scale={IMAGE_SCALE}
        anchor={{ x: 0.5, y: 0.5 }}
      />
      {inputMaterials.filter(isBoard).map((board, index) => {
        const x = feetToPixels(-board.length / 2) - 3;
        const y = inchesToPixels(board.width / 2 - 3);
        return (
          <pixiContainer angle={90} x={x} y={y} key={index}>
            <MaterialSprite material={board} />
          </pixiContainer>
        );
      })}
      {outputMaterials.filter(isBoard).map((board, index) => {
        const x = feetToPixels(board.length / 2) + 3;
        const y = inchesToPixels(board.width / 2 - 3);
        return (
          <pixiContainer angle={90 + index * 5} x={x} y={y} key={index}>
            <MaterialSprite material={board} />
          </pixiContainer>
        );
      })}
      <pixiSprite
        texture={miterSawTopTexture}
        scale={IMAGE_SCALE}
        anchor={{ x: 0.5, y: 0.5 }}
      />
    </pixiContainer>
  );
};
