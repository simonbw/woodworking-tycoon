import { useTick } from "@pixi/react";
import { Container, Graphics } from "pixi.js";
import React, { useCallback, useRef } from "react";
import {
  isSameNail,
  palletNailPosition,
  PALLET_HEIGHT_IN,
  PALLET_WIDTH_IN,
} from "../../game/bench-work/pallet-geometry";
import { BenchPlacement } from "../../game/bench-work/bench-layout";
import { pieceSize } from "../../game/bench-work/workpiece";
import { MaterialInstance, Pallet, PalletNail } from "../../game/Materials";
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

/** The tween the pieces turn with: the spring react-spring would run
 * (tension 300, friction 26) — a hand turning the piece, no bounce. */
function stepSpring(
  value: number,
  velocity: number,
  target: number,
  dt: number,
): [number, number] {
  const nextVelocity = velocity + (300 * (target - value) - 26 * velocity) * dt;
  const next = value + nextVelocity * dt;
  return Math.abs(target - next) < 0.01 && Math.abs(nextVelocity) < 0.05
    ? [target, 0]
    : [next, nextVelocity];
}

/**
 * One loose piece, its turn and flip tweened on the PIXI ticker — R and
 * F read as the piece being turned by hand, not teleported. Position
 * tracks the drag directly; only angle and flip ease in. Deliberately
 * NOT react-spring's animated("pixiContainer"): its web-targeted prop
 * applier doesn't drive the PIXI reconciler, and the container silently
 * renders nothing.
 */
const TweenedPiece: React.FC<{
  piece: LoosePiece;
  fit: StageFit;
  hovered: boolean;
  dragging: boolean;
}> = ({ piece, fit, hovered, dragging }) => {
  const { placement, material } = piece;
  const targetAngle = placement.angleDeg;
  const targetFlip = placement.flipped ? -1 : 1;
  const nodeRef = useRef<Container | null>(null);
  const anim = useRef({
    angle: targetAngle,
    flip: targetFlip,
    angleVelocity: 0,
    flipVelocity: 0,
  });

  useTick((ticker) => {
    const node = nodeRef.current;
    if (!node) return;
    const a = anim.current;
    const dt = Math.min(ticker.deltaMS, 50) / 1000;
    [a.angle, a.angleVelocity] = stepSpring(
      a.angle,
      a.angleVelocity,
      targetAngle,
      dt,
    );
    [a.flip, a.flipVelocity] = stepSpring(
      a.flip,
      a.flipVelocity,
      targetFlip,
      dt,
    );
    node.angle = a.angle;
    node.scale.set(a.flip * fit.spriteScale, fit.spriteScale);
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
    <pixiContainer
      ref={nodeRef}
      x={fit.originX + placement.xIn * fit.pxPerIn}
      y={fit.originY + placement.yIn * fit.pxPerIn}
      angle={anim.current.angle}
      scale={{
        x: anim.current.flip * fit.spriteScale,
        y: fit.spriteScale,
      }}
      alpha={dragging ? 0.9 : 1}
    >
      <MaterialSprite material={material} />
      <pixiGraphics draw={drawRing} />
    </pixiContainer>
  );
};

export const BenchScene: React.FC<{
  pallet: Pallet | null;
  targets: ReadonlyArray<PalletNail>;
  pieces: ReadonlyArray<LoosePiece>;
  /** Bench-inch fit: origin at the bench top's top-left corner. */
  fit: StageFit;
  /** The staged pallet's top-left corner, in bench inches. */
  palletOriginIn: { xIn: number; yIn: number };
  /** Nails light up while the hammer is in hand. */
  hammerHeld: boolean;
  prying: PalletNail | null;
  /** The nail under the held hammer right now. */
  hoveredNail: PalletNail | null;
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
  // The nail heads themselves are part of the pallet (PalletSprite draws
  // them in both views); this layer is only the pry chrome around them.
  const drawNailChrome = useCallback(
    (g: Graphics) => {
      g.clear();
      if (!pallet) return;
      for (const nail of targets) {
        if (!hammerHeld) continue;
        const at = palletNailPosition(nail);
        const x = fit.originX + (palletOriginIn.xIn + at.xIn) * fit.pxPerIn;
        const y = fit.originY + (palletOriginIn.yIn + at.yIn) * fit.pxPerIn;
        if (isSameNail(hoveredNail, nail)) {
          // The hammer is over this one: the ring warms and widens
          g.circle(x, y, 9).fill({ color: 0xd97c26, alpha: 0.2 });
          g.circle(x, y, 9).stroke({ width: 3, color: 0xd97c26, alpha: 1 });
        } else {
          // The "pry here" ring, lit while the hammer is in hand
          g.circle(x, y, 7).stroke({
            width: 2.5,
            color: 0xf5efe3,
            alpha: 0.95,
          });
        }
      }
      if (prying) {
        // The pull in progress: the press already committed, so the nail
        // is gone from the pallet — the widened ring and the claw's
        // lever line play out over the empty hole.
        const at = palletNailPosition(prying);
        const x = fit.originX + (palletOriginIn.xIn + at.xIn) * fit.pxPerIn;
        const y = fit.originY + (palletOriginIn.yIn + at.yIn) * fit.pxPerIn;
        g.circle(x, y, 10).stroke({
          width: 2.5,
          color: 0xd97c26,
          alpha: 0.95,
        });
        g.moveTo(x, y)
          .lineTo(x + 16, y - 22)
          .stroke({ width: 3.5, color: 0x8a8378, alpha: 0.9 });
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
      <pixiGraphics draw={drawNailChrome} />
    </pixiContainer>
  );
};
