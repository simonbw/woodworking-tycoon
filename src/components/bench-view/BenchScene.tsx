import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { animated, useSpring } from "react-spring";
import {
  PALLET_HEIGHT_IN,
  PALLET_WIDTH_IN,
  palletNailPosition,
} from "../../game/bench-work/pallet-geometry";
import { BenchPlacement } from "../../game/bench-work/bench-layout";
import { pieceSize, PryTarget } from "../../game/bench-work/workpiece";
import { MaterialInstance, Pallet } from "../../game/Materials";
import { MaterialSprite } from "../material-sprites/MaterialSprite";
import { PalletSprite } from "../material-sprites/PalletSprite";
import { StageFit } from "./stageMath";

/**
 * The freeform half of the bench view: the bench's actual contents laid
 * out on the wood — a staged pallet with its remaining nails, and every
 * loose piece lying where the bench layout (real game state) says it
 * lies. Pure renderer: hit-testing and all state live in
 * BenchWorkSurface, which shares this file's coordinate space (bench-top
 * inches, the bench's top-left at the fit origin).
 */

export interface LoosePiece {
  readonly material: MaterialInstance;
  readonly placement: BenchPlacement;
}

/** Pointer must land this close (in inches) to pry a nail. */
export const NAIL_HIT_RADIUS_IN = 3.5;

const AnimatedPixiContainer = animated("pixiContainer");

/**
 * One loose piece, its turn and flip tweened — R and F read as the piece
 * being turned by hand, not teleported. Position tracks the drag
 * directly; only angle and flip ease in.
 */
const TweenedPiece: React.FC<{
  piece: LoosePiece;
  fit: StageFit;
  hovered: boolean;
  dragging: boolean;
}> = ({ piece, fit, hovered, dragging }) => {
  const { placement, material } = piece;
  const spring = useSpring({
    angle: placement.angleDeg,
    flip: placement.flipped ? -1 : 1,
    config: { tension: 300, friction: 26 },
  });

  const drawRing = useCallback(
    (g: Graphics) => {
      g.clear();
      if (!hovered && !dragging) return;
      const size = pieceSize(material);
      // Drawn in sprite pixels (inside the scaled container), so the
      // ring hugs the piece through the tweened turn.
      const w = (size.widthIn * fit.pxPerIn) / fit.spriteScale;
      const h = (size.heightIn * fit.pxPerIn) / fit.spriteScale;
      const pad = 4 / fit.spriteScale;
      g.roundRect(
        -w / 2 - pad,
        -h / 2 - pad,
        w + pad * 2,
        h + pad * 2,
        pad,
      ).stroke({
        width: 2 / fit.spriteScale,
        color: 0xf5efe3,
        alpha: dragging ? 0.9 : 0.55,
      });
    },
    [hovered, dragging, material, fit],
  );

  return (
    <AnimatedPixiContainer
      x={fit.originX + placement.xIn * fit.pxPerIn}
      y={fit.originY + placement.yIn * fit.pxPerIn}
      angle={spring.angle}
      scale={{
        x: spring.flip.to((f: number) => f * fit.spriteScale),
        y: fit.spriteScale,
      }}
      alpha={dragging ? 0.9 : 1}
    >
      <MaterialSprite material={material} />
      <pixiGraphics draw={drawRing} />
    </AnimatedPixiContainer>
  );
};

export const BenchScene: React.FC<{
  pallet: Pallet | null;
  targets: ReadonlyArray<PryTarget>;
  pieces: ReadonlyArray<LoosePiece>;
  /** Bench-inch fit: origin at the bench top's top-left corner. */
  fit: StageFit;
  /** The staged pallet's top-left corner, in bench inches. */
  palletOriginIn: { xIn: number; yIn: number };
  /** Nails light up while the hammer is in hand. */
  hammerHeld: boolean;
  prying: PryTarget | null;
  /** The nail under the held hammer right now. */
  hoveredNail: PryTarget | null;
  hoveredId: string | null;
  draggingId: string | null;
}> = ({
  pallet,
  targets,
  pieces,
  fit,
  palletOriginIn,
  hammerHeld,
  prying,
  hoveredNail,
  hoveredId,
  draggingId,
}) => {
  const sameTarget = (a: PryTarget | null, b: PryTarget) =>
    a !== null && a.kind === b.kind && a.index === b.index;

  const drawNails = useCallback(
    (g: Graphics) => {
      g.clear();
      if (!pallet) return;
      for (const target of targets) {
        const at = palletNailPosition(target);
        const x = fit.originX + (palletOriginIn.xIn + at.xIn) * fit.pxPerIn;
        const y = fit.originY + (palletOriginIn.yIn + at.yIn) * fit.pxPerIn;
        const active = sameTarget(prying, target);
        const hovered = !active && sameTarget(hoveredNail, target);
        if (hammerHeld || active) {
          if (hovered) {
            // The hammer is over this one: the ring warms and widens
            g.circle(x, y, 9).fill({ color: 0xd97c26, alpha: 0.2 });
            g.circle(x, y, 9).stroke({
              width: 3,
              color: 0xd97c26,
              alpha: 1,
            });
          } else {
            // The "pry here" ring, lit while the hammer is in hand
            g.circle(x, y, active ? 10 : 7).stroke({
              width: 2.5,
              color: active ? 0xd97c26 : 0xf5efe3,
              alpha: 0.95,
            });
          }
        }
        // The nail head itself, always visible
        g.circle(x, y, 3).fill({ color: 0x4a443e });
        g.circle(x - 0.8, y - 0.8, 1.1).fill({ color: 0x9a938c });
        if (active) {
          // The claw's lever line, kicked out during the pull
          g.moveTo(x, y)
            .lineTo(x + 16, y - 22)
            .stroke({ width: 3.5, color: 0x8a8378, alpha: 0.9 });
        }
      }
    },
    [pallet, targets, fit, palletOriginIn, hammerHeld, prying, hoveredNail],
  );

  // The dragged piece rides on top of the stack
  const ordered =
    draggingId === null
      ? pieces
      : [
          ...pieces.filter((p) => p.material.id !== draggingId),
          ...pieces.filter((p) => p.material.id === draggingId),
        ];

  return (
    <pixiContainer>
      {pallet && (
        <pixiContainer
          x={
            fit.originX +
            (palletOriginIn.xIn + PALLET_WIDTH_IN / 2) * fit.pxPerIn
          }
          y={
            fit.originY +
            (palletOriginIn.yIn + PALLET_HEIGHT_IN / 2) * fit.pxPerIn
          }
          scale={fit.spriteScale}
        >
          <PalletSprite pallet={pallet} />
        </pixiContainer>
      )}
      {ordered.map((piece) => (
        <TweenedPiece
          key={piece.material.id}
          piece={piece}
          fit={fit}
          hovered={hoveredId === piece.material.id}
          dragging={draggingId === piece.material.id}
        />
      ))}
      <pixiGraphics draw={drawNails} />
    </pixiContainer>
  );
};
