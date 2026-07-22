import React from "react";
import { animated, useSpring } from "react-spring";
import { Machine } from "../../game/Machine";
import { thicknessStepBelow } from "../../game/machines/lunchboxPlaner";
import { BOARD_DIMENSIONS, BoardDimension } from "../../game/Materials";
import { isBoard } from "../../game/board-helpers";
import { lerp } from "../../utils/mathUtils";
import { useTexture } from "../../utils/useTexture";
import { MaterialSprite } from "../material-sprites/MaterialSprite";
import { IMAGE_SCALE } from "../shop-view/MachineSprite";
import { PIXELS_PER_INCH, feetToPixels } from "../shop-view/shop-scale";
import { useMachineActivity } from "../shop-view/useMachineActivity";
import { CutParticles, cutSprayIntensity } from "./CutParticles";
import { FeedingBoard } from "./FeedingBoard";

const AnimatedPixiSprite = animated("pixiSprite");

export const LunchboxPlanerSprite: React.FC<{ machine: Machine }> = ({
  machine,
}) => {
  const { inputMaterials, processingMaterials, outputMaterials } = machine;
  const { fraction, working } = useMachineActivity(machine);
  const cutting = processingMaterials.filter(isBoard)[0];
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
          // Mirrors the plane operation's output: one detent off at most,
          // smooth surface emerging from the outfeed past the cutter head
          exitedAs={{
            ...board,
            thickness: Math.max(
              cutThickness,
              thicknessStepBelow(board.thickness) ?? board.thickness,
            ) as BoardDimension,
            jointedFaces: 2,
            surface: "smooth",
          }}
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
      {cutting && (
        <>
          {/* A lunchbox planer is a snow machine out the outfeed side;
              wide spread so the curls scatter off the exiting board */}
          <CutParticles
            intensity={cutSprayIntensity(machine)}
            kind="shavings"
            species={cutting.species}
            active={working}
            y={-26}
            direction={-Math.PI / 2}
            spread={1.7}
            density={1.3}
          />
          {/* The chip port blasts a hard jet of dust alongside the curls */}
          <CutParticles
            intensity={cutSprayIntensity(machine)}
            kind="dust"
            species={cutting.species}
            active={working}
            y={-26}
            direction={-Math.PI / 2}
            spread={1}
            density={0.9}
          />
          {/* Fine dust leaks out around the board at the cutter head */}
          <CutParticles
            intensity={cutSprayIntensity(machine)}
            kind="dust"
            species={cutting.species}
            active={working}
            direction={0}
            ambient
            density={0.7}
          />
        </>
      )}
    </pixiContainer>
  );
};
