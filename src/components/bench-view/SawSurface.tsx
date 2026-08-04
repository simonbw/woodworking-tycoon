import { Graphics } from "pixi.js";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  kerfComplete,
  kerfFraction,
  makeKerfMask,
  sawStroke,
} from "../../game/bench-work/coverage";
import {
  BenchPlacement,
  benchPointInFrame,
} from "../../game/bench-work/bench-layout";
import { nearestSawMark } from "../../game/bench-work/tool-work";
import {
  placedPieceSize,
  sawCrossSection,
  sawLineFraction,
} from "../../game/bench-work/workpiece";
import { OperationInteraction, ParameterValues } from "../../game/Machine";
import { Board } from "../../game/Materials";
import { MaterialSprite } from "../material-sprites/MaterialSprite";
import { BenchPointerBus, BenchPointerEvent } from "./benchPointer";
import { StageFit } from "./stageMath";

/**
 * The hand saw, in place: the mark, then the kerf, on the board exactly
 * where it lies. Before the mark this is pure presentation — a pencil
 * line tracking the pointer along the saw's half-foot detents, slanted
 * by the angle stop (R swings it) — and the press that commits the mark
 * lives in the scene handler, which starts the operation with the
 * marked cut's parameters. Once started, the board is claimed and this
 * surface draws it (the scene no longer does), and push–pull strokes
 * near the line deepen a 1-D mask scaled to the stock's cross-section.
 */
export const SawSurface: React.FC<{
  interaction: Extract<OperationInteraction, { kind: "saw" }>;
  workpiece: Board;
  placement: BenchPlacement;
  /** Scene fit: bench-top inches, the same space the pointer reports. */
  fit: StageFit;
  bus: BenchPointerBus;
  started: boolean;
  /** The saw is in hand — strokes land only then. */
  active: boolean;
  /** Pre-mark: the angle the ghost line slants at (the angle stop).
   * Started: the resolved parameters the cut was marked with. */
  params: ParameterValues;
  onComplete: () => void;
  onWork: () => void;
  onProgress?: (fraction: number) => void;
}> = ({
  interaction,
  workpiece,
  placement,
  fit,
  bus,
  started,
  active,
  params,
  onComplete,
  onWork,
  onProgress,
}) => {
  const size = placedPieceSize(workpiece, placement);
  const angle = Number(params.angle ?? 0);
  const markedFraction = started ? sawLineFraction(workpiece, params) : null;

  const mask = useMemo(() => {
    const { widthIn, thicknessIn } = sawCrossSection(workpiece);
    return makeKerfMask(widthIn, thicknessIn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workpiece.id]);
  const [fraction, setFraction] = useState(0);
  // The ghost mark trailing the pointer, in local inches from the top end
  const [ghostMarkIn, setGhostMarkIn] = useState<number | null>(null);
  const doneRef = useRef(false);
  useEffect(() => {
    doneRef.current = false;
    setFraction(0);
  }, [workpiece.id]);
  const startedRef = useRef(started);
  startedRef.current = started;
  const activeRef = useRef(active);
  activeRef.current = active;
  const lastX = useRef<number | null>(null);

  // The line's y at a given local x, in inches — miters slant it
  const lineY = useCallback(
    (xIn: number, centerYIn: number): number => {
      const run = Math.tan((angle * Math.PI) / 180);
      return centerYIn + (xIn - size.widthIn / 2) * run;
    },
    [angle, size.widthIn],
  );

  const handlePointer = useCallback(
    (event: BenchPointerEvent) => {
      if (doneRef.current) return;
      const { type } = event;
      if (type === "up" || type === "leave") {
        lastX.current = null;
        if (type === "leave") setGhostMarkIn(null);
        return;
      }
      const { xIn, yIn } = benchPointInFrame(
        placement,
        size,
        event.xIn,
        event.yIn,
      );
      if (!startedRef.current) {
        // Pre-mark: the pencil line follows the hand between the detents
        const over =
          xIn >= -1 &&
          xIn <= size.widthIn + 1 &&
          yIn >= -1 &&
          yIn <= size.heightIn + 1;
        setGhostMarkIn(
          over && activeRef.current ? nearestSawMark(workpiece, yIn) : null,
        );
        return;
      }
      if (!activeRef.current) {
        lastX.current = null;
        return;
      }
      // The saw only bites within a hand's width of the marked line
      const centerY = (markedFraction ?? 0) * size.heightIn;
      const nearLine =
        xIn >= -0.5 &&
        xIn <= size.widthIn + 0.5 &&
        Math.abs(yIn - lineY(xIn, centerY)) <= 1.5;
      if (type === "down") {
        if (nearLine) lastX.current = xIn;
        return;
      }
      if (!event.held) return;
      if (!nearLine) {
        lastX.current = null;
        return;
      }
      const last = lastX.current;
      lastX.current = xIn;
      if (last === null) return;
      const travel = Math.abs(xIn - last);
      if (travel < 0.05) return;
      onWork();
      const next = sawStroke(mask, travel, interaction.kerfPerSecond);
      setFraction(next);
      onProgress?.(next);
      if (kerfComplete(mask) && !doneRef.current) {
        doneRef.current = true;
        onComplete();
      }
    },
    [
      interaction.kerfPerSecond,
      lineY,
      markedFraction,
      mask,
      onComplete,
      onProgress,
      onWork,
      placement,
      size,
      workpiece,
    ],
  );
  useEffect(() => bus.register(handlePointer), [bus, handlePointer]);

  const drawLine = useCallback(
    (g: Graphics) => {
      g.clear();
      const centerYIn =
        markedFraction !== null
          ? markedFraction * size.heightIn
          : (ghostMarkIn ?? null);
      if (centerYIn === null) return;
      const w = size.widthIn * fit.pxPerIn;
      const x0 = -w / 2;
      const x1 = w / 2;
      const y0 = (lineY(0, centerYIn) - size.heightIn / 2) * fit.pxPerIn;
      const y1 =
        (lineY(size.widthIn, centerYIn) - size.heightIn / 2) * fit.pxPerIn;
      if (markedFraction === null) {
        // The pencil mark, waiting for the press to commit it
        g.moveTo(x0, y0)
          .lineTo(x1, y1)
          .stroke({ width: 2, color: 0x4a4237, alpha: 0.7 });
        return;
      }
      // The kerf: darker and wider as the cut deepens
      g.moveTo(x0, y0)
        .lineTo(x1, y1)
        .stroke({
          width: 2 + kerfFraction(mask) * 3,
          color: 0x2b241c,
          alpha: 0.5 + kerfFraction(mask) * 0.5,
        });
    },
    [fit.pxPerIn, ghostMarkIn, lineY, markedFraction, mask, size],
  );

  return (
    <pixiContainer
      x={fit.originX + placement.xIn * fit.pxPerIn}
      y={fit.originY + placement.yIn * fit.pxPerIn}
      angle={placement.angleDeg}
      scale={{ x: placement.flipped ? -1 : 1, y: 1 }}
    >
      {/* Once claimed, the board draws here — the scene no longer has it */}
      {started && (
        <pixiContainer scale={fit.spriteScale}>
          <MaterialSprite material={workpiece} />
        </pixiContainer>
      )}
      {/* fraction in deps keeps the kerf redrawing as it deepens */}
      <pixiGraphics draw={drawLine} key={`kerf-${Math.round(fraction * 40)}`} />
    </pixiContainer>
  );
};
