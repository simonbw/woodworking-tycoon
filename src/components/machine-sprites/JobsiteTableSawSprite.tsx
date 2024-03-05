import { Container, Sprite } from "@pixi/react-animated";
import React from "react";
import { Spring } from "react-spring";
import { Machine } from "../../game/Machine";
import { BOARD_DIMENSIONS } from "../../game/Materials";
import { Vector } from "../../game/Vectors";
import { isBoard } from "../../game/board-helpers";
import { MaterialSprite } from "../material-sprites/MaterialSprite";
import { IMAGE_SCALE } from "../shop-view/MachineSprite";
import {
  PIXELS_PER_INCH,
  feetToPixels,
  inchesToPixels,
} from "../shop-view/shop-scale";
import { extractFirstNumber } from "./extractFirstNumber";

export const JobsiteTableSawSprite: React.FC<Machine> = (machine) => {
  const { inputMaterials, outputMaterials } = machine;

  const ripWidth =
    extractFirstNumber(machine.selectedOperation.id) ||
    Math.max(...BOARD_DIMENSIONS);
  const fencePosition = ripWidth * PIXELS_PER_INCH;

  const anchor: Vector = [0.5, 0.5];
  return (
    <Container>
      <Sprite
        image={"/images/jobsite-table-saw-table.png"}
        scale={IMAGE_SCALE * 0.8}
        anchor={anchor}
      />
      <Spring to={{ x: fencePosition }}>
        {({ x }) => (
          <Container x={x}>
            {inputMaterials.filter(isBoard).map((board, index) => {
              return (
                <Container
                  angle={index * 10}
                  y={feetToPixels(board.length / 2) + inchesToPixels(2)}
                  x={-inchesToPixels(board.width / 2 + board.thickness / 4)}
                  key={`in-${index}`}
                >
                  <MaterialSprite material={board} key={index} />
                </Container>
              );
            })}
            {outputMaterials.filter(isBoard).map((board, index) => {
              return (
                <Container
                  angle={-index - 1}
                  y={-feetToPixels(board.length / 2) - inchesToPixels(3)}
                  x={-inchesToPixels(board.width / 2 + board.thickness / 4)}
                  key={`out-${index}`}
                >
                  <MaterialSprite material={board} key={index} />
                </Container>
              );
            })}
            <Sprite
              image={"/images/jobsite-table-saw-fence.png"}
              scale={IMAGE_SCALE * 0.8}
              anchor={anchor}
            />
          </Container>
        )}
      </Spring>
    </Container>
  );
};
