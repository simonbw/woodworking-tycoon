import { useApplication } from "@pixi/react";
import { Container, Graphics, RenderTexture, Sprite } from "pixi.js";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  coverageComplete,
  coverageProgress,
  makeCoverageGrid,
  stampStroke,
} from "../../game/bench-work/coverage";
import { OperationInteraction } from "../../game/Machine";
import { MaterialInstance } from "../../game/Materials";
import { MaterialSprite } from "../material-sprites/MaterialSprite";
import { BenchPointerBus, BenchPointerEvent } from "./benchPointer";
import { EdgeBandSprite } from "./EdgeBandSprite";
import { StageFit, strokeGain } from "./stageMath";

/**
 * Stroke work as a per-pixel transition: the workpiece draws its two
 * surface states stacked, the upper (finished) one revealed through a
 * PIXI RenderTexture the brush stamps into — standard scratch-off
 * rendering, one draw call per stamp, never read back from the GPU.
 * Completion is the CPU-side accumulation grid's call (see
 * bench-work/coverage.ts), bumped analytically as the same stamps land.
 */
export const StrokeSurface: React.FC<{
  interaction: Extract<OperationInteraction, { kind: "stroke" }>;
  /** The piece as it is now and as the work leaves it. */
  workpiece: MaterialInstance;
  finished: MaterialInstance | null;
  fit: StageFit;
  bus: BenchPointerBus;
  started: boolean;
  /** First gesture — starts the operation (claims the piece). */
  onFirstStroke: () => void;
  /** Coverage crossed the threshold — the finish commit. */
  onComplete: () => void;
  /** Every active stroke event (dust + foley throttles upstream). */
  onWork: () => void;
  onProgress?: (fraction: number) => void;
}> = ({
  interaction,
  workpiece,
  finished,
  fit,
  bus,
  started,
  onFirstStroke,
  onComplete,
  onWork,
  onProgress,
}) => {
  const { app } = useApplication();
  const band = interaction.band ?? "face";
  const radiusIn = interaction.brushWidthIn / 2;

  // One attempt per workpiece: a fresh grid and a fresh scratch texture.
  // Ephemeral by design (decision 3) — close the sheet and it's gone.
  const grid = useMemo(
    () => makeCoverageGrid(fit.widthIn, fit.heightIn),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workpiece.id, band],
  );
  const renderTexture = useMemo(
    () =>
      RenderTexture.create({
        width: Math.max(2, Math.round(fit.widthIn * fit.pxPerIn)),
        height: Math.max(2, Math.round(fit.heightIn * fit.pxPerIn)),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workpiece.id, band],
  );
  useEffect(
    () => () => {
      renderTexture.destroy(true);
    },
    [renderTexture],
  );

  // The soft brush stamped into the texture: full core, feathered rim
  const brush = useMemo(() => {
    const g = new Graphics();
    const r = Math.max(radiusIn * fit.pxPerIn, 3);
    g.circle(0, 0, r).fill({ color: 0xffffff, alpha: 0.55 });
    g.circle(0, 0, r * 0.66).fill({ color: 0xffffff, alpha: 0.8 });
    g.circle(0, 0, r * 0.4).fill({ color: 0xffffff, alpha: 1 });
    return g;
  }, [radiusIn, fit.pxPerIn]);
  useEffect(() => () => brush.destroy(), [brush]);

  const doneRef = useRef(false);
  useEffect(() => {
    doneRef.current = false;
  }, [workpiece.id]);
  const startedRef = useRef(started);
  startedRef.current = started;
  const lastPoint = useRef<{ xIn: number; yIn: number; at: number } | null>(
    null,
  );

  // Mask plumbing: the finished layer only shows through the scratch
  const [maskSprite, setMaskSprite] = useState<Sprite | null>(null);
  const [revealed, setRevealed] = useState<Container | null>(null);
  useEffect(() => {
    if (maskSprite && revealed) {
      revealed.mask = maskSprite;
      return () => {
        revealed.mask = null;
      };
    }
  }, [maskSprite, revealed]);

  const handlePointer = useCallback(
    (event: BenchPointerEvent) => {
      if (doneRef.current) return;
      const { xIn, yIn, type } = event;
      if (type === "up" || type === "leave") {
        lastPoint.current = null;
        return;
      }
      const inBounds =
        xIn >= -radiusIn &&
        xIn <= fit.widthIn + radiusIn &&
        yIn >= -radiusIn &&
        yIn <= fit.heightIn + radiusIn;
      if (!inBounds) {
        lastPoint.current = null;
        return;
      }
      if (type === "down") {
        if (!startedRef.current) onFirstStroke();
        lastPoint.current = { xIn, yIn, at: performance.now() };
        return;
      }
      if (!event.held) return;
      const last = lastPoint.current;
      if (!last) {
        lastPoint.current = { xIn, yIn, at: performance.now() };
        return;
      }
      const now = performance.now();
      const distance = Math.hypot(xIn - last.xIn, yIn - last.yIn);
      if (distance < 0.05) return;
      if (!startedRef.current) onFirstStroke();
      onWork();

      // Visual layer: stamp the brush along the segment
      const spacing = Math.max(radiusIn / 2, 0.05);
      const steps = Math.max(1, Math.ceil(distance / spacing));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        brush.position.set(
          (last.xIn + (xIn - last.xIn) * t) * fit.pxPerIn,
          (last.yIn + (yIn - last.yIn) * t) * fit.pxPerIn,
        );
        app.renderer.render({
          container: brush,
          target: renderTexture,
          clear: false,
        });
      }

      // Accounting layer: the same stroke, analytically
      const gain = strokeGain(
        interaction.coveragePerSecond,
        radiusIn,
        distance,
        now - last.at,
      );
      stampStroke(grid, last.xIn, last.yIn, xIn, yIn, radiusIn, gain);
      lastPoint.current = { xIn, yIn, at: now };
      onProgress?.(coverageProgress(grid));

      if (coverageComplete(grid) && !doneRef.current) {
        doneRef.current = true;
        onComplete();
      }
    },
    [
      app,
      brush,
      fit,
      grid,
      interaction.coveragePerSecond,
      onComplete,
      onFirstStroke,
      onProgress,
      onWork,
      radiusIn,
      renderTexture,
    ],
  );
  useEffect(() => bus.register(handlePointer), [bus, handlePointer]);

  const centerX = (fit.widthIn * fit.pxPerIn) / 2;
  const centerY = (fit.heightIn * fit.pxPerIn) / 2;
  return (
    <pixiContainer x={fit.originX} y={fit.originY}>
      {/* Before state */}
      <pixiContainer x={centerX} y={centerY} scale={fit.spriteScale}>
        {band === "face" ? (
          <MaterialSprite material={workpiece} />
        ) : (
          <EdgeBandSprite material={workpiece} finished={false} />
        )}
      </pixiContainer>
      {/* Finished state, revealed through the scratch mask */}
      {finished && (
        <pixiContainer ref={setRevealed}>
          <pixiContainer x={centerX} y={centerY} scale={fit.spriteScale}>
            {band === "face" ? (
              <MaterialSprite material={finished} />
            ) : (
              <EdgeBandSprite material={finished} finished />
            )}
          </pixiContainer>
        </pixiContainer>
      )}
      <pixiSprite ref={setMaskSprite} texture={renderTexture} />
    </pixiContainer>
  );
};
