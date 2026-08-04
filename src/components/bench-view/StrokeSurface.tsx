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
import {
  BenchPlacement,
  benchPointInFrame,
} from "../../game/bench-work/bench-layout";
import { placedPieceSize } from "../../game/bench-work/workpiece";
import { OperationInteraction } from "../../game/Machine";
import { MaterialInstance } from "../../game/Materials";
import { MaterialSprite } from "../material-sprites/MaterialSprite";
import { BenchPointerBus, BenchPointerEvent } from "./benchPointer";
import { EdgeBandSprite } from "./EdgeBandSprite";
import { StageFit, strokeGain } from "./stageMath";

/**
 * Stroke work, in place: the claimed workpiece drawn exactly where it
 * lies on the bench (its persistent placement — position, turn, flip, on
 * edge), its two surface states stacked with the finished one revealed
 * through a PIXI RenderTexture the brush stamps into. Standard
 * scratch-off rendering, one draw call per stamp, never read back from
 * the GPU; completion is the CPU-side accumulation grid's call
 * (bench-work/coverage.ts), bumped analytically as the same stamps land.
 * Mounted only once the operation has started — the tool-first press
 * that claims the piece happens in the scene handler — so the scene
 * never draws the piece twice.
 */
export const StrokeSurface: React.FC<{
  interaction: Extract<OperationInteraction, { kind: "stroke" }>;
  /** The piece as it is now and as the work leaves it. */
  workpiece: MaterialInstance;
  finished: MaterialInstance | null;
  /** Where the piece lies — strokes land through this transform. */
  placement: BenchPlacement;
  /** Scene fit: bench-top inches, the same space the pointer reports. */
  fit: StageFit;
  bus: BenchPointerBus;
  /** The owning tool is in hand — strokes land only then. */
  active: boolean;
  /** Coverage crossed the threshold — the finish commit. */
  onComplete: () => void;
  /** Every active stroke event (dust + foley throttles upstream). */
  onWork: () => void;
  onProgress?: (fraction: number) => void;
}> = ({
  interaction,
  workpiece,
  finished,
  placement,
  fit,
  bus,
  active,
  onComplete,
  onWork,
  onProgress,
}) => {
  const { app } = useApplication();
  const band = interaction.band ?? "face";
  const radiusIn = interaction.brushWidthIn / 2;
  const size = placedPieceSize(workpiece, placement);
  const widthPx = Math.max(2, Math.round(size.widthIn * fit.pxPerIn));
  const heightPx = Math.max(2, Math.round(size.heightIn * fit.pxPerIn));

  // One attempt per workpiece: a fresh grid and a fresh scratch texture.
  // Ephemeral by design (decision 3) — close the sheet and it's gone.
  const grid = useMemo(
    () => makeCoverageGrid(size.widthIn, size.heightIn),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workpiece.id, band],
  );
  const renderTexture = useMemo(
    () => RenderTexture.create({ width: widthPx, height: heightPx }),
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
  const activeRef = useRef(active);
  activeRef.current = active;
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
      if (doneRef.current || !activeRef.current) {
        lastPoint.current = null;
        return;
      }
      const { type } = event;
      if (type === "up" || type === "leave") {
        lastPoint.current = null;
        return;
      }
      // The pointer arrives in bench inches; the piece's placement
      // carries it into the workpiece's own frame, turn and flip and all
      const { xIn, yIn } = benchPointInFrame(
        placement,
        size,
        event.xIn,
        event.yIn,
      );
      const inBounds =
        xIn >= -radiusIn &&
        xIn <= size.widthIn + radiusIn &&
        yIn >= -radiusIn &&
        yIn <= size.heightIn + radiusIn;
      if (!inBounds) {
        lastPoint.current = null;
        return;
      }
      if (type === "down") {
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
      onWork();

      // Visual layer: stamp the brush along the segment, in texture px
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
      fit.pxPerIn,
      grid,
      interaction.coveragePerSecond,
      onComplete,
      onProgress,
      onWork,
      placement,
      radiusIn,
      renderTexture,
      size,
    ],
  );
  useEffect(() => bus.register(handlePointer), [bus, handlePointer]);

  const before =
    band === "face" ? (
      <MaterialSprite material={workpiece} onEdge={placement.onEdge} />
    ) : (
      <EdgeBandSprite material={workpiece} finished={false} />
    );
  const after = finished ? (
    band === "face" ? (
      <MaterialSprite material={finished} onEdge={placement.onEdge} />
    ) : (
      <EdgeBandSprite material={finished} finished />
    )
  ) : null;

  return (
    <pixiContainer
      x={fit.originX + placement.xIn * fit.pxPerIn}
      y={fit.originY + placement.yIn * fit.pxPerIn}
      angle={placement.angleDeg}
      scale={{ x: placement.flipped ? -1 : 1, y: 1 }}
    >
      {/* Before state */}
      <pixiContainer scale={fit.spriteScale}>{before}</pixiContainer>
      {/* Finished state, revealed through the scratch mask */}
      {after && (
        <pixiContainer ref={setRevealed}>
          <pixiContainer scale={fit.spriteScale}>{after}</pixiContainer>
        </pixiContainer>
      )}
      <pixiSprite
        ref={setMaskSprite}
        texture={renderTexture}
        x={-widthPx / 2}
        y={-heightPx / 2}
      />
    </pixiContainer>
  );
};
