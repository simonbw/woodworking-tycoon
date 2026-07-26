import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { Machine } from "../../game/Machine";
import { Board } from "../../game/Materials";
import { isBoard } from "../../game/board-helpers";
import { OnEdgeBoardSprite } from "../material-sprites/OnEdgeBoardSprite";
import {
  PIXELS_PER_CELL,
  feetToPixels,
  inchesToPixels,
} from "../shop-view/shop-scale";
import { useMachineActivity } from "../shop-view/useMachineActivity";
import { CutParticles, cutSprayIntensity } from "./CutParticles";
import { FeedingBoard } from "./FeedingBoard";

// Cast iron, painted frame, and the blade — the band saw's whole palette
const TABLE_IRON = 0x9aa0a6;
const TABLE_EDGE = 0x6c7176;
const FRAME_PAINT = 0x33444f;
const FRAME_SHADE = 0x24333c;
const BLADE_STEEL = 0x1a1a1a;
const FENCE_METAL = 0xb9bec3;

/** The blade line sits at the drawing origin; the fence rides right of it. */
function fenceX(quarters: number): number {
  return inchesToPixels(quarters / 4);
}

/**
 * Top-down band saw: a square cast-iron table with the blade slot running
 * out its front edge, the painted C-frame down the left side, and the
 * upper wheel housing bulging over the back. Stock stands on edge against
 * the fence, which slides in as the fence setting comes down.
 */
export const BandSawSprite: React.FC<{ machine: Machine }> = ({ machine }) => {
  const { inputMaterials, processingMaterials, outputMaterials } = machine;
  const { fraction, working } = useMachineActivity(machine);
  const cutting = processingMaterials.filter(isBoard)[0];

  const fenceSetting = Number(machine.selectedParameters?.targetThickness) || 4;
  const fence = fenceX(fenceSetting);

  // A board rides with one face against the fence, so it hangs off the
  // fence toward (and past) the blade by its own thickness.
  const boardX = (board: Board) => fence - inchesToPixels(board.thickness / 4) / 2;

  const draw = useCallback((g: Graphics) => {
    g.clear();
    // Everything fits inside the 2×2-ft footprint: the column down the
    // left, the table filling the rest, the blade line at x = 0.
    const half = PIXELS_PER_CELL * 0.95;
    const columnWidth = PIXELS_PER_CELL * 0.62;
    const tableLeft = -half + columnWidth * 0.6;
    const wheel = { x: -half + columnWidth * 0.75, y: -half * 0.3, r: 22 };

    // Drop shadow, following the body rather than the whole tile
    g.roundRect(tableLeft + 3, -half + 4, half - tableLeft, half * 2, 5);
    g.circle(wheel.x + 3, wheel.y + 4, wheel.r);
    g.fill({ color: 0x000000, alpha: 0.2 });

    // The table: cast iron, filling the footprint right of the column
    g.roundRect(tableLeft, -half, half - tableLeft, half * 2, 4);
    g.fill(TABLE_IRON);
    g.roundRect(tableLeft, -half, half - tableLeft, half * 2, 4);
    g.stroke({ width: 2, color: TABLE_EDGE });
    // The slot the blade lives in, open at the operator's edge
    g.rect(-2, -PIXELS_PER_CELL * 0.15, 4, half + PIXELS_PER_CELL * 0.15);
    g.fill(0x3f4448);

    // The C-frame: a painted column down the left, carrying the wheels
    // above and below the table
    g.roundRect(-half, -half, columnWidth, half * 2, 5);
    g.fill(FRAME_PAINT);
    // Upper wheel housing, its cover overhanging the back of the table
    g.circle(wheel.x, wheel.y, wheel.r);
    g.fill(FRAME_SHADE);
    g.circle(wheel.x, wheel.y, wheel.r);
    g.stroke({ width: 2, color: 0x1a262d });
    g.circle(wheel.x, wheel.y, wheel.r * 0.45);
    g.stroke({ width: 1.5, color: 0x1a262d, alpha: 0.7 });

    // The blade: a thin ribbon running the length of the table
    g.rect(-1, -half, 2, half * 2);
    g.fill(BLADE_STEEL);
    // Guide post and guard, hanging over the blade above the work
    g.roundRect(
      -PIXELS_PER_CELL * 0.13,
      -PIXELS_PER_CELL * 0.42,
      PIXELS_PER_CELL * 0.26,
      PIXELS_PER_CELL * 0.34,
      2,
    );
    g.fill(FRAME_SHADE);
  }, []);

  const drawFence = useCallback((g: Graphics) => {
    g.clear();
    const half = PIXELS_PER_CELL * 0.95;
    // A bar parallel to the blade, standing tall enough to hold a board up
    g.roundRect(0, -half, inchesToPixels(1.5), half * 2, 2);
    g.fill(FENCE_METAL);
    g.roundRect(0, -half, inchesToPixels(1.5), half * 2, 2);
    g.stroke({ width: 1, color: TABLE_EDGE });
  }, []);

  // Centered on the 2×2-ft footprint, half a cell past the origin center.
  return (
    <pixiContainer x={PIXELS_PER_CELL * 0.5} y={PIXELS_PER_CELL * 0.5}>
      <pixiGraphics draw={draw} />
      <pixiContainer x={fence}>
        <pixiGraphics draw={drawFence} />
      </pixiContainer>
      {inputMaterials.filter(isBoard).map((board, index) => (
        <pixiContainer
          key={`in-${index}`}
          x={boardX(board)}
          y={feetToPixels(board.length / 2)}
        >
          <OnEdgeBoardSprite board={board} seed={board.id} />
        </pixiContainer>
      ))}
      {processingMaterials.filter(isBoard).map((board, index) => (
        <FeedingBoard
          board={board}
          fraction={fraction}
          fromY={feetToPixels(board.length / 2)}
          toY={-feetToPixels(board.length / 2)}
          x={boardX(board)}
          key={`proc-${index}`}
        >
          <OnEdgeBoardSprite board={board} seed={board.id} />
        </FeedingBoard>
      ))}
      {/* Both halves come off the back of the table, side by side */}
      {outputMaterials.filter(isBoard).map((board, index) => (
        <pixiContainer
          key={`out-${index}`}
          x={fence - inchesToPixels(index * 1.2) - inchesToPixels(board.thickness / 8)}
          y={-feetToPixels(board.length / 2) - inchesToPixels(2)}
        >
          <OnEdgeBoardSprite board={board} seed={board.id} />
        </pixiContainer>
      ))}
      {cutting && (
        <>
          {/* Most of the dust drops through the table into the lower
              wheel housing and puffs out the door */}
          <CutParticles
            intensity={cutSprayIntensity(machine)}
            kind="dust"
            species={cutting.species}
            active={working}
            x={-PIXELS_PER_CELL * 0.5}
            direction={Math.PI}
            spread={0.8}
            density={1.1}
          />
          {/* The rest rides the blade back up onto the table */}
          <CutParticles
            intensity={cutSprayIntensity(machine)}
            kind="dust"
            species={cutting.species}
            active={working}
            direction={Math.PI / 2}
            density={0.8}
          />
        </>
      )}
    </pixiContainer>
  );
};
