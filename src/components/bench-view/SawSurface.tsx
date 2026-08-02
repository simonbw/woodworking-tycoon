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
} from "../../game/bench-work/coverage";
import { sawStroke } from "../../game/bench-work/coverage";
import {
  sawCrossSection,
  sawLineFraction,
} from "../../game/bench-work/workpiece";
import { Machine, OperationInteraction } from "../../game/Machine";
import { Board } from "../../game/Materials";
import { MaterialSprite } from "../material-sprites/MaterialSprite";
import { BenchPointerBus, BenchPointerEvent } from "./benchPointer";
import { StageFit } from "./stageMath";

/**
 * The hand saw: the mark, then the kerf. The cut line comes from the
 * mounted saw's settings (angle, cut end, target length — the same
 * parameterized crosscut the miter saw runs, zoomed in), so Z/X and R
 * position it exactly as they do on the floor. Pressing on the line
 * commits the mark (starting the operation and claiming the board);
 * push–pull strokes along it deepen a 1-D mask scaled to the stock's
 * cross-section. Outputs are the miter saw's — same cut, sweat pace.
 */
export const SawSurface: React.FC<{
  machine: Machine;
  interaction: Extract<OperationInteraction, { kind: "saw" }>;
  workpiece: Board;
  fit: StageFit;
  bus: BenchPointerBus;
  started: boolean;
  onMark: () => void;
  onComplete: () => void;
  onWork: () => void;
  onProgress?: (fraction: number) => void;
}> = ({
  machine,
  interaction,
  workpiece,
  fit,
  bus,
  started,
  onMark,
  onComplete,
  onWork,
  onProgress,
}) => {
  const operation = machine.selectedOperationOrNull;
  const params = operation ? machine.resolvedParameters(operation) : {};
  const lineFraction = sawLineFraction(workpiece, params);
  const angle = Number(params.angle ?? 0);

  const mask = useMemo(() => {
    const { widthIn, thicknessIn } = sawCrossSection(workpiece);
    return makeKerfMask(widthIn, thicknessIn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workpiece.id]);
  const [fraction, setFraction] = useState(0);
  const doneRef = useRef(false);
  useEffect(() => {
    doneRef.current = false;
    setFraction(0);
  }, [workpiece.id]);
  const startedRef = useRef(started);
  startedRef.current = started;
  const lastX = useRef<number | null>(null);

  // The line's y at a given x, in inches — miters slant it
  const lineY = useCallback(
    (xIn: number): number => {
      const centerY = lineFraction * fit.heightIn;
      const run = Math.tan((angle * Math.PI) / 180);
      return centerY + (xIn - fit.widthIn / 2) * run;
    },
    [angle, fit.heightIn, fit.widthIn, lineFraction],
  );

  const handlePointer = useCallback(
    (event: BenchPointerEvent) => {
      if (doneRef.current) return;
      const { xIn, yIn, type } = event;
      if (type === "up" || type === "leave") {
        lastX.current = null;
        return;
      }
      // The saw only bites within a hand's width of the marked line
      const nearLine =
        xIn >= -0.5 &&
        xIn <= fit.widthIn + 0.5 &&
        Math.abs(yIn - lineY(xIn)) <= 1.5;
      if (type === "down") {
        if (nearLine) {
          if (!startedRef.current) onMark();
          lastX.current = xIn;
        }
        return;
      }
      if (!event.held || !startedRef.current) return;
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
      fit.widthIn,
      interaction.kerfPerSecond,
      lineY,
      mask,
      onComplete,
      onMark,
      onProgress,
      onWork,
    ],
  );
  useEffect(() => bus.register(handlePointer), [bus, handlePointer]);

  const drawLine = useCallback(
    (g: Graphics) => {
      g.clear();
      const x0 = 0;
      const x1 = fit.widthIn * fit.pxPerIn;
      const y0 = lineY(0) * fit.pxPerIn;
      const y1 = lineY(fit.widthIn) * fit.pxPerIn;
      if (!startedRef.current) {
        // The pencil mark, waiting for the first stroke to commit it
        g.moveTo(x0, y0)
          .lineTo(x1, y1)
          .stroke({ width: 2, color: 0x4a4237, alpha: 0.6 });
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
    [fit, lineY, mask],
  );

  return (
    <pixiContainer x={fit.originX} y={fit.originY}>
      <pixiContainer
        x={(fit.widthIn * fit.pxPerIn) / 2}
        y={(fit.heightIn * fit.pxPerIn) / 2}
        scale={fit.spriteScale}
      >
        <MaterialSprite material={workpiece} />
      </pixiContainer>
      {/* fraction in deps keeps the kerf redrawing as it deepens */}
      <pixiGraphics draw={drawLine} key={`kerf-${Math.round(fraction * 40)}`} />
    </pixiContainer>
  );
};
