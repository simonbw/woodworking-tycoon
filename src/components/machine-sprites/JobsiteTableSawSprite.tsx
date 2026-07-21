import { Texture } from "pixi.js";
import React from "react";
import { animated, useSpring } from "react-spring";
import { Machine } from "../../game/Machine";
import { BOARD_DIMENSIONS } from "../../game/Materials";
import { isBoard } from "../../game/board-helpers";
import { lerp } from "../../utils/mathUtils";
import { useTexture } from "../../utils/useTexture";
import { MaterialSprite } from "../material-sprites/MaterialSprite";
import { IMAGE_SCALE } from "../shop-view/MachineSprite";
import {
  PIXELS_PER_INCH,
  feetToPixels,
  inchesToPixels,
} from "../shop-view/shop-scale";
import { useMachineActivity } from "../shop-view/useMachineActivity";
import { CutParticles, dustEscapeFraction } from "./CutParticles";

const AnimatedPixiContainer = animated("pixiContainer");
const AnimatedPixiSprite = animated("pixiSprite");

export const JobsiteTableSawSprite: React.FC<{ machine: Machine }> = ({
  machine,
}) => {
  const { inputMaterials, processingMaterials, outputMaterials } = machine;
  const { fraction, working } = useMachineActivity(machine);
  const cutting = processingMaterials.filter(isBoard)[0];
  const tableSawTableTexture = useTexture(
    "/images/jobsite-table-saw-table.png",
  );
  const tableSawFenceTexture = useTexture(
    "/images/jobsite-table-saw-fence.png",
  );

  // Ops without a width parameter (sled crosscuts) park the fence out of
  // the way at the far end of the rail.
  const ripWidth =
    Number(machine.selectedParameters?.targetWidth) ||
    Math.max(...BOARD_DIMENSIONS);
  const fencePosition = ripWidth * PIXELS_PER_INCH;

  const springProps = useSpring({
    x: fencePosition,
  });

  // One spring drives both the feeding board and the kerf that opens
  // behind the blade (the blade sits at the machine's center, x = 0).
  const cutLength = cutting ? feetToPixels(cutting.length) : 0;
  const feed = useSpring({
    y: cutting
      ? lerp(
          cutLength / 2 + inchesToPixels(2),
          -cutLength / 2 - inchesToPixels(3),
          fraction,
        )
      : 0,
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
        {cutting && (
          <AnimatedPixiContainer
            y={feed.y}
            x={-inchesToPixels(cutting.width / 2 + cutting.thickness / 4)}
          >
            <MaterialSprite material={cutting} />
          </AnimatedPixiContainer>
        )}
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
      {cutting && (
        // The kerf: a dark slit that opens behind the blade as the board
        // feeds through, splitting the already-cut portion in two
        <AnimatedPixiSprite
          texture={Texture.WHITE}
          tint={0x120d08}
          alpha={0.9}
          width={3}
          anchor={{ x: 0.5, y: 1 }}
          y={feed.y.to((y) => Math.min(y + cutLength / 2, 0))}
          height={feed.y.to((y) =>
            Math.max(0, Math.min(y + cutLength / 2, 0) - (y - cutLength / 2)),
          )}
        />
      )}
      {cutting && (
        <CutParticles
          intensity={dustEscapeFraction(machine)}
          kind="dust"
          species={cutting.species}
          active={working}
          // The blade kicks dust back toward the infeed side
          direction={Math.PI / 2}
        />
      )}
    </pixiContainer>
  );
};
