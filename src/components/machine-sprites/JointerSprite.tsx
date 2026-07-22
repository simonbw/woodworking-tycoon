import React from "react";
import { Machine } from "../../game/Machine";
import { Board } from "../../game/Materials";
import { isBoard } from "../../game/board-helpers";
import { useTexture } from "../../utils/useTexture";
import { MaterialSprite } from "../material-sprites/MaterialSprite";
import { OnEdgeBoardSprite } from "../material-sprites/OnEdgeBoardSprite";
import { IMAGE_SCALE } from "../shop-view/MachineSprite";
import { PIXELS_PER_INCH, feetToPixels } from "../shop-view/shop-scale";
import { useMachineActivity } from "../shop-view/useMachineActivity";
import { CutParticles, cutSprayIntensity } from "./CutParticles";
import { FeedingBoard } from "./FeedingBoard";

/** Where the fence's working face sits in the texture. */
const FENCE_INNER_X = 19;

/**
 * Top-down jointer: long infeed/outfeed tables split by the cutterhead,
 * with a fence along the right side.
 */
export const JointerSprite: React.FC<{ machine: Machine }> = ({ machine }) => {
  const { inputMaterials, processingMaterials, outputMaterials } = machine;
  const { fraction, working } = useMachineActivity(machine);
  const cutting = processingMaterials.filter(isBoard)[0];
  const jointerTexture = useTexture("/images/benchtop-jointer.png");

  // Edge jointing stands the board on edge against the fence; face
  // jointing lays it flat on the beds.
  const edgeMode = machine.state.selectedOperationId === "jointEdge";
  const boardX = (board: Board, index: number) =>
    edgeMode
      ? FENCE_INNER_X -
        Math.max(3, (board.thickness * PIXELS_PER_INCH) / 4) / 2 -
        index * 5
      : index * 4;
  const boardSprite = (board: Board & { id: string }) =>
    edgeMode ? (
      <OnEdgeBoardSprite board={board} seed={board.id} />
    ) : (
      <MaterialSprite material={board} />
    );

  return (
    <pixiContainer>
      <pixiSprite texture={jointerTexture} scale={IMAGE_SCALE} anchor={0.5} />
      {inputMaterials.filter(isBoard).map((board, index) => (
        <pixiContainer
          key={`in-${index}`}
          x={boardX(board, index)}
          y={feetToPixels(board.length / 2)}
        >
          {boardSprite(board)}
        </pixiContainer>
      ))}
      {processingMaterials.filter(isBoard).map((board, index) => (
        <FeedingBoard
          board={board}
          fraction={fraction}
          fromY={feetToPixels(board.length / 2)}
          toY={-feetToPixels(board.length / 2)}
          x={boardX(board, index)}
          key={`proc-${index}`}
        >
          {edgeMode ? boardSprite(board) : undefined}
        </FeedingBoard>
      ))}
      {outputMaterials.filter(isBoard).map((board, index) => (
        <pixiContainer
          key={`out-${index}`}
          x={boardX(board, index)}
          y={-feetToPixels(board.length / 2)}
        >
          {boardSprite(board)}
        </pixiContainer>
      ))}
      {cutting && (
        <>
          {/* Curls spill off the cutterhead toward the outfeed table */}
          <CutParticles
            intensity={cutSprayIntensity(machine)}
            kind="shavings"
            species={cutting.species}
            active={working}
            direction={-Math.PI / 2}
            spread={1.5}
            density={1.3}
          />
          {/* The chip port ejects a jet of dust out the side, away from
              the fence */}
          <CutParticles
            intensity={cutSprayIntensity(machine)}
            kind="dust"
            species={cutting.species}
            active={working}
            x={-8}
            direction={Math.PI}
            spread={0.7}
            density={0.9}
          />
          {/* Fine dust boils up around the cutterhead and the board */}
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
