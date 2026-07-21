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

  // The head sinks through the chop and lifts once the cut releases
  const plunge = useSpring({ p: processingBoards.length > 0 ? fraction : 0 });

  // The head swings to the set detent about the fence pivot — the shop
  // reads "the saw's still set to 45" at a glance. Cutting the right end
  // mirrors the swing, so both settings are visible on the machine.
  const angleSetting = Number(machine.selectedParameters?.angle) || 0;
  const swingSign = machine.selectedParameters?.cutEnd === "right" ? -1 : 1;
  const headSwing = useSpring({ a: angleSetting * swingSign });
  // A miter saw's head pivots where the blade meets the fence, behind the
  // board (the stock's back edge sits 3" behind the machine's center line)
  const pivotY = inchesToPixels(-3);

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
      {/* Kerf and head swing together about the fence pivot, so the cut
          line on the board always lies under the blade */}
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
        <CutParticles
          intensity={cutSprayIntensity(machine)}
          kind="dust"
          species={cutting.species}
          active={working}
          // The blade throws dust back behind the fence, tilted with the head
          direction={
            -Math.PI / 2 + (angleSetting * swingSign * Math.PI) / 180
          }
          spread={0.9}
        />
      )}
    </pixiContainer>
  );
};
