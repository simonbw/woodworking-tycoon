import { Container, Sprite } from "@pixi/react";
import { Sprite as AnimatedSprite } from "@pixi/react-animated";
import React from "react";
import { Spring } from "react-spring";
import { Machine } from "../../game/Machine";
import { BOARD_DIMENSIONS } from "../../game/Materials";
import { isBoard } from "../../game/board-helpers";
import { lerp } from "../../utils/mathUtils";
import { MaterialSprite } from "../material-sprites/MaterialSprite";
import { IMAGE_SCALE } from "../shop-view/MachineSprite";
import { PIXELS_PER_INCH, feetToPixels } from "../shop-view/shop-scale";
import { extractFirstNumber } from "./extractFirstNumber";

export const LunchboxPlanerSprite: React.FC<Machine> = (machine) => {
  const { inputMaterials, outputMaterials } = machine;
  const cutThickness =
    extractFirstNumber(machine.selectedOperation.id) ||
    Math.max(...BOARD_DIMENSIONS);

  return (
    <Container>
      <Sprite
        image={"/images/lunchbox-planer-bottom.png"}
        scale={IMAGE_SCALE}
        anchor={[0.5, 0.5]}
      />
      {inputMaterials.filter(isBoard).map((board, index) => (
        <Container
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
        </Container>
      ))}
      {outputMaterials.filter(isBoard).map((board, index) => (
        <Container
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
        </Container>
      ))}
      <Spring to={{ scale: IMAGE_SCALE + cutThickness * 0.005 }}>
        {({ scale }) => (
          <AnimatedSprite
            image={"/images/lunchbox-planer-top.png"}
            scale={scale}
            anchor={[0.5, 0.5]}
          />
        )}
      </Spring>
      <Sprite
        image={"/images/lunchbox-planer-screws.png"}
        scale={IMAGE_SCALE + 0.01}
        anchor={[0.5, 0.5]}
      />
    </Container>
  );
};
