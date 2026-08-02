import { Graphics } from "pixi.js";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { rowLayout } from "../../game/bench-work/workpiece";
import { ConsumableAmount } from "../../game/Consumable";
import { MaterialInstance } from "../../game/Materials";
import { playSound } from "../../utils/sfx";
import { MaterialSprite } from "../material-sprites/MaterialSprite";
import { BenchPointerBus, BenchPointerEvent } from "./benchPointer";
import { StageFit } from "./stageMath";

/** Components wait this far apart before they're snapped home. */
export const ASSEMBLY_GAP_IN = 3;

/**
 * Assembly: snap each component onto its ghost outline, then drive the
 * fasteners — one per requiredConsumables unit, at the joints of the
 * generic derived layout (components in a row; hand-authored art can
 * come later for hero products). Everything before the last fastener is
 * ephemeral; the commit fires once the build is fully together, which
 * is when the recipe's start (spending the nails) and finish (the
 * product) resolve back to back — performance affects speed, never
 * quality.
 */
export const AssemblySurface: React.FC<{
  pieces: ReadonlyArray<MaterialInstance>;
  fasteners: ReadonlyArray<ConsumableAmount>;
  fit: StageFit;
  bus: BenchPointerBus;
  onCommit: () => void;
  onStage?: (snapped: number, driven: number, fastenerTotal: number) => void;
}> = ({ pieces, fasteners, fit, bus, onCommit, onStage }) => {
  const layout = useMemo(() => rowLayout(pieces, ASSEMBLY_GAP_IN), [pieces]);
  const closed = useMemo(() => rowLayout(pieces, 0.5), [pieces]);
  const fastenerTotal = useMemo(
    () => fasteners.reduce((sum, f) => sum + f.amount, 0),
    [fasteners],
  );
  const fastenerClip = fasteners.some((f) => f.id === "screws")
    ? "assembly-mallet" // the drill's own clip can join later
    : "assembly-mallet";

  const [snapped, setSnapped] = useState(0);
  const [driven, setDriven] = useState(0);
  const committedRef = useRef(false);

  useEffect(() => {
    onStage?.(snapped, driven, fastenerTotal);
  }, [snapped, driven, fastenerTotal, onStage]);

  // Fastener spots: spread along the joined row's seams
  const fastenerSpots = useMemo(() => {
    const spots: Array<{ xIn: number; yIn: number }> = [];
    const height = closed.size.heightIn;
    for (let i = 0; i < fastenerTotal; i++) {
      const seam = closed.slots[(i % Math.max(closed.slots.length - 1, 1)) + 1];
      const xIn = seam ? seam.xIn - 0.25 : closed.size.widthIn / 2;
      const row = Math.floor(i / Math.max(closed.slots.length - 1, 1));
      const yIn =
        ((row % 4) + 1) *
        (height /
          (Math.ceil(fastenerTotal / Math.max(closed.slots.length - 1, 1)) +
            1));
      spots.push({ xIn, yIn });
    }
    return spots;
  }, [closed, fastenerTotal]);

  const allSnapped = snapped >= pieces.length;
  const slots = allSnapped ? closed.slots : layout.slots;
  const centerOffset = allSnapped
    ? (layout.size.widthIn - closed.size.widthIn) / 2
    : 0;

  const handlePointer = useCallback(
    (event: BenchPointerEvent) => {
      if (committedRef.current || event.type !== "down") return;
      if (!allSnapped) {
        // Snap the next component onto its outline
        playSound("material-drop", 0.4);
        const next = snapped + 1;
        setSnapped(next);
        if (next >= pieces.length && fastenerTotal === 0) {
          committedRef.current = true;
          onCommit();
        }
        return;
      }
      // Drive the fastener nearest the press
      const spot = fastenerSpots[driven];
      if (!spot) return;
      const near =
        Math.hypot(spot.xIn + centerOffset - event.xIn, spot.yIn - event.yIn) <=
        6;
      // Any press drives the next marked fastener when close enough;
      // far-off presses do nothing (no free progress for mashing)
      if (!near) return;
      playSound(fastenerClip, 0.5);
      const next = driven + 1;
      setDriven(next);
      if (next >= fastenerTotal && !committedRef.current) {
        committedRef.current = true;
        onCommit();
      }
    },
    [
      allSnapped,
      centerOffset,
      driven,
      fastenerClip,
      fastenerSpots,
      fastenerTotal,
      onCommit,
      pieces.length,
      snapped,
    ],
  );
  useEffect(() => bus.register(handlePointer), [bus, handlePointer]);

  const drawOverlay = useCallback(
    (g: Graphics) => {
      g.clear();
      if (!allSnapped) {
        // Ghost outlines where the remaining components land
        for (let i = snapped; i < layout.slots.length; i++) {
          const slot = layout.slots[i];
          g.rect(
            slot.xIn * fit.pxPerIn,
            ((layout.size.heightIn - slot.heightIn) / 2) * fit.pxPerIn,
            slot.widthIn * fit.pxPerIn,
            slot.heightIn * fit.pxPerIn,
          ).stroke({ width: 2, color: 0xf5efe3, alpha: 0.5 });
        }
        return;
      }
      // Fastener markers: driven heads solid, the next one ringed
      fastenerSpots.forEach((spot, index) => {
        const x = (spot.xIn + centerOffset) * fit.pxPerIn;
        const y = spot.yIn * fit.pxPerIn;
        if (index < driven) {
          g.circle(x, y, 3).fill(0x57504a);
        } else if (index === driven) {
          g.circle(x, y, 6).stroke({ width: 2, color: 0xd97c26, alpha: 0.9 });
          g.circle(x, y, 2).fill({ color: 0x57504a, alpha: 0.6 });
        } else {
          g.circle(x, y, 4).stroke({
            width: 1.5,
            color: 0xf5efe3,
            alpha: 0.35,
          });
        }
      });
    },
    [
      allSnapped,
      centerOffset,
      driven,
      fastenerSpots,
      fit.pxPerIn,
      layout,
      snapped,
    ],
  );

  return (
    <pixiContainer x={fit.originX} y={fit.originY}>
      {slots.map((slot, index) => (
        <pixiContainer
          key={slot.material.id}
          x={(slot.xIn + slot.widthIn / 2 + centerOffset) * fit.pxPerIn}
          y={(layout.size.heightIn / 2) * fit.pxPerIn}
          scale={fit.spriteScale}
          alpha={!allSnapped && index >= snapped ? 0.35 : 1}
        >
          <MaterialSprite material={slot.material} />
        </pixiContainer>
      ))}
      <pixiGraphics draw={drawOverlay} key={`assembly-${snapped}-${driven}`} />
    </pixiContainer>
  );
};
