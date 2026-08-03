import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import {
  PALLET_HEIGHT_IN,
  PALLET_WIDTH_IN,
  palletNailPosition,
} from "../../game/bench-work/pallet-geometry";
import { pieceSize, PryTarget } from "../../game/bench-work/workpiece";
import { MaterialInstance, Pallet } from "../../game/Materials";
import { MaterialSprite } from "../material-sprites/MaterialSprite";
import { PalletSprite } from "../material-sprites/PalletSprite";
import { StageFit } from "./stageMath";

/**
 * The freeform half of the bench view: the bench's actual contents laid
 * out on the wood — a staged pallet with its remaining nails, and every
 * loose piece lying where it was freed or wherever it's been dragged.
 * Pure renderer: hit-testing and all state live in BenchWorkSurface,
 * which shares this file's coordinate space (scene inches, the pallet's
 * top-left at the fit origin).
 */

/** How a loose piece lies on the bench — ephemeral view state, reset
 * when the sheet closes (decision 3: the arrangement is not saved; the
 * pieces themselves are). */
export interface PiecePlacement {
  readonly xIn: number;
  readonly yIn: number;
  readonly angleDeg: number;
  readonly flipped: boolean;
}

export interface LoosePiece {
  readonly material: MaterialInstance;
  readonly placement: PiecePlacement;
}

/** Pointer must land this close (in inches) to pry a nail. */
export const NAIL_HIT_RADIUS_IN = 3.5;

export const BenchScene: React.FC<{
  pallet: Pallet | null;
  targets: ReadonlyArray<PryTarget>;
  pieces: ReadonlyArray<LoosePiece>;
  fit: StageFit;
  /** Nails light up while the hammer is in hand. */
  hammerHeld: boolean;
  prying: PryTarget | null;
  hoveredId: string | null;
  draggingId: string | null;
}> = ({
  pallet,
  targets,
  pieces,
  fit,
  hammerHeld,
  prying,
  hoveredId,
  draggingId,
}) => {
  const drawNails = useCallback(
    (g: Graphics) => {
      g.clear();
      if (!pallet) return;
      for (const target of targets) {
        const at = palletNailPosition(target);
        const x = fit.originX + at.xIn * fit.pxPerIn;
        const y = fit.originY + at.yIn * fit.pxPerIn;
        const active =
          prying !== null &&
          prying.kind === target.kind &&
          prying.index === target.index;
        if (hammerHeld || active) {
          // The "pry here" ring, lit while the hammer is in hand
          g.circle(x, y, active ? 9 : 7).stroke({
            width: 2.5,
            color: active ? 0xd97c26 : 0xf5efe3,
            alpha: 0.95,
          });
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
    [pallet, targets, fit, hammerHeld, prying],
  );

  const drawHover = useCallback(
    (g: Graphics) => {
      g.clear();
      const id = draggingId ?? hoveredId;
      if (!id) return;
      const piece = pieces.find((p) => p.material.id === id);
      if (!piece) return;
      const size = pieceSize(piece.material);
      const w = size.widthIn * fit.pxPerIn;
      const h = size.heightIn * fit.pxPerIn;
      g.roundRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8, 4).stroke({
        width: 2,
        color: 0xf5efe3,
        alpha: draggingId ? 0.9 : 0.55,
      });
      g.position.set(
        fit.originX + piece.placement.xIn * fit.pxPerIn,
        fit.originY + piece.placement.yIn * fit.pxPerIn,
      );
      g.angle = piece.placement.angleDeg;
    },
    [pieces, hoveredId, draggingId, fit],
  );

  return (
    <pixiContainer>
      {pallet && (
        <pixiContainer
          x={fit.originX + (PALLET_WIDTH_IN / 2) * fit.pxPerIn}
          y={fit.originY + (PALLET_HEIGHT_IN / 2) * fit.pxPerIn}
          scale={fit.spriteScale}
        >
          <PalletSprite pallet={pallet} />
        </pixiContainer>
      )}
      {pieces.map(({ material, placement }) => (
        <pixiContainer
          key={material.id}
          x={fit.originX + placement.xIn * fit.pxPerIn}
          y={fit.originY + placement.yIn * fit.pxPerIn}
          angle={placement.angleDeg}
          scale={{
            x: placement.flipped ? -fit.spriteScale : fit.spriteScale,
            y: fit.spriteScale,
          }}
          alpha={draggingId === material.id ? 0.9 : 1}
        >
          <MaterialSprite material={material} />
        </pixiContainer>
      ))}
      <pixiGraphics draw={drawHover} />
      <pixiGraphics draw={drawNails} />
    </pixiContainer>
  );
};
