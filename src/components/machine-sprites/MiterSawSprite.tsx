import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { animated, useSpring } from "react-spring";
import { Machine } from "../../game/Machine";
import { isBoard } from "../../game/board-helpers";
import { useTexture } from "../../utils/useTexture";
import { MaterialSprite } from "../material-sprites/MaterialSprite";
import { IMAGE_SCALE } from "../shop-view/MachineSprite";
import { feetToPixels, inchesToPixels } from "../shop-view/shop-scale";
import { useMachineActivity } from "../shop-view/useMachineActivity";
import { CutParticles, cutSprayIntensity } from "./CutParticles";
import { Vibrating } from "./Vibrating";

const AnimatedPixiContainer = animated("pixiContainer");

export const MiterSawSprite: React.FC<{ machine: Machine }> = ({ machine }) => {
  const { inputMaterials, outputMaterials } = machine;
  const { fraction, working, powered } = useMachineActivity(machine);
  const miterSawTopTexture = useTexture("/images/miter-saw-top.png");

  const miterSawStationaryTexture = useTexture(
    "/images/miter-saw-stationary-base.png",
  );
  const miterSawTurntableTexture = useTexture(
    "/images/miter-saw-rotating-base.png",
  );

  const inputBoards = inputMaterials.filter(isBoard);
  const processingBoards = machine.processingMaterials.filter(isBoard);
  // The board on the saw table: set down there with F, and still there
  // mid-cut (it moves to processing but stays clamped in place). There is
  // no preview of a board you're merely holding — you put it on the saw
  // first, then slide it to the mark.
  const stock = inputBoards[0] ?? processingBoards[0];

  // The cut line sits cutPosition inches from the stock's left end, so
  // the rest of the board slides out past the blade to the right. Clamped
  // so a mark beyond the board's far end parks the whole board short of
  // the blade instead of detaching it from the saw.
  const cutPosition = Number(machine.selectedParameters?.cutPosition) || 0;
  const slidBoard = stock;
  const slideOffset = slidBoard
    ? inchesToPixels(Math.max(0, slidBoard.length - cutPosition))
    : 0;
  const springProps = useSpring({ x: slideOffset });

  // The head sinks through the chop and lifts once the cut releases
  const plunge = useSpring({ p: processingBoards.length > 0 ? fraction : 0 });

  // The whole swing assembly — turntable, detent handle, kerf, and head —
  // rotates to the set detent, so the shop reads "the saw's still set to
  // 45" at a glance. The angle is signed — the head swings both ways off
  // square — and which end faces the blade never moves the head.
  const angleSetting = Number(machine.selectedParameters?.angle) || 0;
  const headSwing = useSpring({ a: angleSetting });
  // The pivot is the turntable circle's center, measured off the art:
  // 10 image pixels above the canvas center in miter-saw-rotating-base.png
  const pivotY = -10 * IMAGE_SCALE;

  const cutting = processingBoards[0];
  const kerfY = cutting ? inchesToPixels(cutting.width / 2 - 3) : 0;
  const kerfHalf = cutting ? inchesToPixels(cutting.width / 2) : 0;
  const drawKerf = useCallback(
    (g: Graphics) => {
      g.clear();
      if (!cutting || fraction === 0) return;
      // The cut deepens across the board as the chop comes down
      g.moveTo(0, kerfY - kerfHalf);
      g.lineTo(
        0,
        kerfY - kerfHalf + 2 * kerfHalf * Math.min(1, fraction * 1.2),
      );
      g.stroke({ width: 2.5, color: 0x120d08, alpha: 0.85 });
    },
    [cutting, fraction, kerfY, kerfHalf],
  );

  return (
    <pixiContainer>
      <pixiSprite
        texture={miterSawStationaryTexture}
        scale={IMAGE_SCALE}
        anchor={{ x: 0.5, y: 0.5 }}
      />
      {/* The turntable swings under the stock (the board stays put against
          the fence while the table turns beneath it) */}
      <AnimatedPixiContainer y={pivotY} angle={headSwing.a}>
        <pixiSprite
          texture={miterSawTurntableTexture}
          scale={IMAGE_SCALE}
          anchor={{ x: 0.5, y: 0.5 }}
          y={-pivotY}
        />
      </AnimatedPixiContainer>
      <AnimatedPixiContainer x={springProps.x}>
        {[...inputBoards, ...processingBoards].map((board, index) => {
          const x = inchesToPixels(-board.length / 2) - 3;
          const y = inchesToPixels(board.width / 2 - 3);
          return (
            <pixiContainer angle={90} x={x} y={y} key={index}>
              <MaterialSprite material={board} />
            </pixiContainer>
          );
        })}
      </AnimatedPixiContainer>
      {outputMaterials.filter(isBoard).map((board, index) => {
        const x = inchesToPixels(board.length / 2) + 3;
        const y = inchesToPixels(board.width / 2 - 3);
        return (
          <pixiContainer angle={90 + index * 5} x={x} y={y} key={index}>
            <MaterialSprite material={board} />
          </pixiContainer>
        );
      })}
      {/* Kerf and head swing about the same pivot as the turntable, so the
          cut line on the board always lies under the blade */}
      <AnimatedPixiContainer y={pivotY} angle={headSwing.a}>
        <pixiContainer y={-pivotY}>
          <pixiGraphics draw={drawKerf} />
          <Vibrating active={powered}>
            <AnimatedPixiContainer
              scale={plunge.p.to((p) => 1 - 0.05 * p)}
              y={plunge.p.to((p) => p * 2.5)}
            >
              <pixiSprite
                texture={miterSawTopTexture}
                scale={IMAGE_SCALE}
                anchor={{ x: 0.5, y: 0.5 }}
              />
            </AnimatedPixiContainer>
          </Vibrating>
        </pixiContainer>
      </AnimatedPixiContainer>
      {cutting && (
        <>
          {/* The blade hurls a thick rooster tail back behind the fence,
              tilted with the head */}
          <CutParticles
            intensity={cutSprayIntensity(machine)}
            kind="dust"
            species={cutting.species}
            active={working}
            direction={-Math.PI / 2 + (angleSetting * Math.PI) / 180}
            spread={0.7}
            density={1.6}
          />
          {/* ...and fine dust boils out around the blade in every direction */}
          <CutParticles
            intensity={cutSprayIntensity(machine)}
            kind="dust"
            species={cutting.species}
            active={working}
            direction={0}
            ambient
            density={0.8}
          />
        </>
      )}
    </pixiContainer>
  );
};
