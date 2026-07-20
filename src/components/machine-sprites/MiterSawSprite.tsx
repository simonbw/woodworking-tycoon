import React from "react";
import { animated, useSpring } from "react-spring";
import { Machine } from "../../game/Machine";
import { isBoard } from "../../game/board-helpers";
import { useTexture } from "../../utils/useTexture";
import { MaterialSprite } from "../material-sprites/MaterialSprite";
import { IMAGE_SCALE } from "../shop-view/MachineSprite";
import { feetToPixels, inchesToPixels } from "../shop-view/shop-scale";
import { useMachineActivity } from "../shop-view/useMachineActivity";
import { CutParticles } from "./CutParticles";

const AnimatedPixiContainer = animated("pixiContainer");

export const MiterSawSprite: React.FC<{ machine: Machine }> = ({ machine }) => {
  const { inputMaterials, outputMaterials } = machine;
  const { isOperating, needsYou } = useMachineActivity(machine);
  const miterSawBaseTexture = useTexture("/images/miter-saw-base.png");
  const miterSawTopTexture = useTexture("/images/miter-saw-top.png");

  const inputBoards = inputMaterials.filter(isBoard);
  const processingBoards = machine.processingMaterials.filter(isBoard);
  // Mid-cut the stock has moved to processing; it stays clamped in place.
  const stock = inputBoards[0] ?? processingBoards[0];

  // The length stop is set targetLength right of the blade, so that much of
  // the stock slides out past the cut line — the board tracks the Target
  // Length setting. Clamped to the board so an uncuttable setting (stop past
  // the board's far end) parks the whole board beyond the blade instead of
  // detaching it from the saw.
  const targetLength = Number(machine.selectedParameters?.targetLength) || 0;
  const stopOffset = stock
    ? feetToPixels(Math.min(targetLength, stock.length))
    : 0;
  const springProps = useSpring({ x: stopOffset });

  return (
    <pixiContainer>
      <pixiSprite
        texture={miterSawBaseTexture}
        scale={IMAGE_SCALE}
        anchor={{ x: 0.5, y: 0.5 }}
      />
      <AnimatedPixiContainer x={springProps.x}>
        {[...inputBoards, ...processingBoards].map((board, index) => {
          const x = feetToPixels(-board.length / 2) - 3;
          const y = inchesToPixels(board.width / 2 - 3);
          return (
            <pixiContainer angle={90} x={x} y={y} key={index}>
              <MaterialSprite material={board} />
            </pixiContainer>
          );
        })}
      </AnimatedPixiContainer>
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
      {processingBoards[0] && (
        <CutParticles
          kind="dust"
          species={processingBoards[0].species}
          active={isOperating && !needsYou}
          // The blade throws dust back behind the fence
          direction={-Math.PI / 2}
          spread={0.9}
        />
      )}
    </pixiContainer>
  );
};
