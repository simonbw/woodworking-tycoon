import React from "react";
import { Machine } from "../../game/Machine";
import { Board } from "../../game/Materials";
import { isBoard } from "../../game/board-helpers";
import { useTexture } from "../../utils/useTexture";
import { OnEdgeBoardSprite } from "../material-sprites/OnEdgeBoardSprite";
import { IMAGE_SCALE } from "../shop-view/MachineSprite";
import { feetToPixels, inchesToPixels } from "../shop-view/shop-scale";
import { useMachineActivity } from "../shop-view/useMachineActivity";
import { CutParticles, cutSprayIntensity } from "./CutParticles";
import { FeedingBoard } from "./FeedingBoard";

/**
 * The art is a 400×400 export at 8 image pixels to the inch, centered on
 * the saw's 2×2-ft footprint — the table's front and back edges land on the
 * footprint's, and the wheel housings hang off the left of it.
 *
 * These read in the art's own pixels and convert through inches rather than
 * through `IMAGE_SCALE`: `MachineSprite` imports this file, so reading its
 * exports out here — before render — gets a binding that isn't set yet.
 */
const ART_CENTER = 200;
const ART_PIXELS_PER_INCH = 8;
const artToShop = (pixels: number) =>
  inchesToPixels(pixels / ART_PIXELS_PER_INCH);

/**
 * Where the blade comes through the table, in the art's pixels — (245, 200),
 * which is the center row and 45 pixels right of the center column. The
 * fence is drawn with its working face right against it, so the fence layer
 * needs no correction beyond the setting itself.
 */
const BLADE_ART_X = 245;

/** The blade in the sprite's own pixels, out from the middle of the art. */
const BLADE_OFFSET = artToShop(BLADE_ART_X - ART_CENTER);

/**
 * The lower wheel housing's door, off the left of the table — where the
 * dust that drops through the table works its way back out. Measured off
 * the blade, like everything else the saw does.
 */
const HOUSING_OFFSET = artToShop(80 - BLADE_ART_X);

/**
 * Top-down 14" band saw: the cast-iron table with the wheel housings and
 * motor hanging off its left, and the upper housing's arm reaching over the
 * work to the guides. Stock stands on edge against the fence, which slides
 * in toward the blade as the fence setting comes down.
 *
 * Everything the saw does happens on the blade line, so the stock, the cut,
 * and the dust are all placed relative to it rather than to the art.
 */
export const BandSawSprite: React.FC<{ machine: Machine }> = ({ machine }) => {
  const { inputMaterials, processingMaterials, outputMaterials } = machine;
  const { fraction, working } = useMachineActivity(machine);
  const cutting = processingMaterials.filter(isBoard)[0];

  const lowerTexture = useTexture("/images/bandsaw-14-lower.png");
  const fenceTexture = useTexture("/images/bandsaw-14-fence.png");
  const upperTexture = useTexture("/images/bandsaw-14-upper.png");

  // The fence stands off the blade by its setting, back down the table.
  const fenceSetting = Number(machine.selectedParameters?.targetThickness) || 4;
  const fenceFace = -inchesToPixels(fenceSetting / 4);

  // A board rides one face against the fence, so it hangs off the fence
  // toward (and past) the blade by its own thickness.
  const boardX = (board: Board) =>
    fenceFace + inchesToPixels(board.thickness / 8);

  // Canvas-centered art; MachineSprite mounts it on the footprint center.
  return (
    <pixiContainer>
      <pixiSprite texture={lowerTexture} scale={IMAGE_SCALE} anchor={0.5} />
      {/* The work sits on the table, under the arm that reaches over it */}
      <pixiContainer x={BLADE_OFFSET}>
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
            x={
              fenceFace +
              inchesToPixels(index * 1.2) +
              inchesToPixels(board.thickness / 8)
            }
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
              x={HOUSING_OFFSET}
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
      {/* The fence was drawn against the blade, so the setting is the whole
          of its travel — no correction for where it sits in the art */}
      <pixiContainer x={fenceFace}>
        <pixiSprite texture={fenceTexture} scale={IMAGE_SCALE} anchor={0.5} />
      </pixiContainer>
      <pixiSprite texture={upperTexture} scale={IMAGE_SCALE} anchor={0.5} />
    </pixiContainer>
  );
};
