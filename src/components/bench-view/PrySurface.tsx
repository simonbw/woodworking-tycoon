import { Graphics } from "pixi.js";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { PryTarget } from "../../game/bench-work/workpiece";
import { Pallet } from "../../game/Materials";
import { INCHES_PER_FOOT } from "../../game/shop-scale";
import {
  MAX_BOTTOM_DECK,
  MAX_TOP_DECK,
  PalletSprite,
} from "../material-sprites/PalletSprite";
import { lerp } from "../../utils/mathUtils";
import { BenchPointerBus, BenchPointerEvent } from "./benchPointer";
import { StageFit } from "./stageMath";

/**
 * Pallet dismantling, nail by nail: the staged pallet at high zoom with
 * a marked nail on every board still attached. Pressing one pries it —
 * a short lever animation, then the incremental commit
 * (pryPalletNailAction): the nail clinks into the tin, the board pops
 * free, and the pallet's own state remembers exactly where you left it.
 * The animation IS the pacing — mashing can't outrun the pry bar.
 */

/** How long one pry takes, pointer-down to commit. */
export const PRY_MS = 280;

/** A pallet's sprite spans 4'×3' minus a hair (see PalletSprite). */
const PALLET_WIDTH_IN = 4 * INCHES_PER_FOOT - 2;
const PALLET_HEIGHT_IN = 3 * INCHES_PER_FOOT - 2;

/** Where a nail sits on the sprite, in workpiece inches from top-left. */
export function nailPosition(target: PryTarget): { xIn: number; yIn: number } {
  if (target.kind === "stringer") {
    return {
      xIn: PALLET_WIDTH_IN / 2,
      yIn: lerp(0, PALLET_HEIGHT_IN, target.index / 2),
    };
  }
  // Deck boards: indices 0..3 are the bottom row, 4..10 the top (the
  // sprite draws both rows across the width at mid-height)
  const bottom = target.index < MAX_BOTTOM_DECK;
  const across = bottom
    ? target.index / (MAX_BOTTOM_DECK - 1)
    : (target.index - MAX_BOTTOM_DECK) / (MAX_TOP_DECK - 1);
  return {
    xIn: lerp(0, PALLET_WIDTH_IN, across),
    yIn: PALLET_HEIGHT_IN / 2 + (bottom ? 6 : -6),
  };
}

export const PrySurface: React.FC<{
  pallet: Pallet;
  targets: ReadonlyArray<PryTarget>;
  fit: StageFit;
  bus: BenchPointerBus;
  onPry: (target: PryTarget) => void;
}> = ({ pallet, targets, fit, bus, onPry }) => {
  // The nail currently being levered out, if any — input waits for it
  const [prying, setPrying] = useState<PryTarget | null>(null);
  const pryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (pryTimer.current) clearTimeout(pryTimer.current);
    },
    [],
  );

  const handlePointer = useCallback(
    (event: BenchPointerEvent) => {
      if (event.type !== "down" || prying) return;
      const hit = targets.find((target) => {
        const at = nailPosition(target);
        return Math.hypot(at.xIn - event.xIn, at.yIn - event.yIn) <= 3.5;
      });
      if (!hit) return;
      setPrying(hit);
      pryTimer.current = setTimeout(() => {
        setPrying(null);
        onPry(hit);
      }, PRY_MS);
    },
    [onPry, prying, targets],
  );
  useEffect(() => bus.register(handlePointer), [bus, handlePointer]);

  const drawNails = useCallback(
    (g: Graphics) => {
      g.clear();
      for (const target of targets) {
        const at = nailPosition(target);
        const x = at.xIn * fit.pxPerIn;
        const y = at.yIn * fit.pxPerIn;
        const active =
          prying &&
          prying.kind === target.kind &&
          prying.index === target.index;
        // Nail head with a marking ring — the ring is the "press here"
        g.circle(x, y, active ? 7 : 5).stroke({
          width: 2,
          color: active ? 0xd97c26 : 0xf5efe3,
          alpha: 0.9,
        });
        g.circle(x, y, 2.5).fill({ color: 0x57504a });
        if (active) {
          // The pry bar's lever line, kicked out during the pull
          g.moveTo(x, y)
            .lineTo(x + 14, y - 18)
            .stroke({ width: 3, color: 0x8a8378, alpha: 0.9 });
        }
      }
    },
    [fit.pxPerIn, prying, targets],
  );

  return (
    <pixiContainer x={fit.originX} y={fit.originY}>
      <pixiContainer
        x={(fit.widthIn * fit.pxPerIn) / 2}
        y={(fit.heightIn * fit.pxPerIn) / 2}
        scale={fit.spriteScale}
      >
        <PalletSprite pallet={pallet} />
      </pixiContainer>
      <pixiGraphics draw={drawNails} />
    </pixiContainer>
  );
};
