import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { Machine } from "../../game/Machine";
import { Board } from "../../game/Materials";
import { isBoard } from "../../game/board-helpers";
import { MaterialSprite } from "../material-sprites/MaterialSprite";
import { OnEdgeBoardSprite } from "../material-sprites/OnEdgeBoardSprite";
import {
  PIXELS_PER_CELL,
  PIXELS_PER_INCH,
  feetToPixels,
} from "../shop-view/shop-scale";
import { useMachineActivity } from "../shop-view/useMachineActivity";
import { CutParticles } from "./CutParticles";
import { FeedingBoard } from "./FeedingBoard";

/** Where the fence's working face sits (see the fence rect in draw). */
const FENCE_INNER_X = PIXELS_PER_CELL * 0.25 - 3;

/**
 * Top-down vector jointer: long infeed/outfeed tables split by the
 * cutterhead, with a fence along the right side. Drawn with graphics until
 * it earns a hand-made texture like the other machines.
 */
export const JointerSprite: React.FC<{ machine: Machine }> = ({ machine }) => {
  const { inputMaterials, processingMaterials, outputMaterials } = machine;
  const { fraction, isOperating, needsYou } = useMachineActivity(machine);
  const cutting = processingMaterials.filter(isBoard)[0];

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

  const draw = useCallback((g: Graphics) => {
    g.clear();
    const bedWidth = PIXELS_PER_CELL * 0.5;
    const bedLength = PIXELS_PER_CELL * 0.95;
    const x = -bedWidth / 2;
    const y = -bedLength / 2;

    // Base / stand
    g.rect(x - 3, y + 6, bedWidth + 6, bedLength - 12);
    g.fill(0x3f3f46);
    // Infeed and outfeed tables (outfeed a hair "higher" = lighter)
    g.rect(x, 2, bedWidth, bedLength / 2 - 2);
    g.fill(0x9ca3af);
    g.rect(x, y, bedWidth, bedLength / 2 - 2);
    g.fill(0xb5bcc4);
    // Cutterhead gap
    g.rect(x, -2, bedWidth, 4);
    g.fill(0x1c1917);
    // Fence along the right edge
    g.rect(x + bedWidth - 3, y + 4, 6, bedLength - 8);
    g.fill(0x6b7280);
    // Guard: the classic porkchop over the cutterhead
    g.ellipse(x + bedWidth * 0.35, 0, bedWidth * 0.32, 7);
    g.fill(0xd97706);
  }, []);

  return (
    <pixiContainer>
      <pixiGraphics draw={draw} />
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
        <CutParticles
          kind="shavings"
          species={cutting.species}
          active={isOperating && !needsYou}
          // Curls spill off the cutterhead toward the outfeed table
          direction={-Math.PI / 2}
          spread={1.5}
        />
      )}
    </pixiContainer>
  );
};
