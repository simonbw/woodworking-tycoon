import { useTick } from "@pixi/react";
import { Container, Graphics, Ticker } from "pixi.js";
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
import { materialDustSpecies } from "../../game/material-helpers";
import { OperationInteraction, ParameterValues } from "../../game/Machine";
import { Board } from "../../game/Materials";
import { HandSawVoice, playSawPartCrack } from "../../utils/handSawSynth";
import { MaterialSprite } from "../material-sprites/MaterialSprite";
import { BenchPointerBus, BenchPointerEvent } from "./benchPointer";
import { KerfDust, KerfDustBus } from "./KerfDust";
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
 *
 * The cut reads spatially: the dark kerf consumes the pencil line from
 * one edge toward the other as the mask deepens — the line itself is
 * the progress indicator — with the board drawn as two masked halves so
 * the offcut side can sag open a sliver over the last strokes, and each
 * stroke spills species-colored dust at the crossing point (KerfDust).
 * The kerf redraws imperatively from the stroke handler, off React's
 * render path, like the pointer bus it hangs off.
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
  // The ghost mark trailing the pointer, in local inches from the top end
  const [ghostMarkIn, setGhostMarkIn] = useState<number | null>(null);
  const doneRef = useRef(false);
  const dustBus = useMemo<KerfDustBus>(
    () => ({ queue: [] }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workpiece.id],
  );
  useEffect(() => {
    doneRef.current = false;
  }, [workpiece.id]);
  const startedRef = useRef(started);
  startedRef.current = started;
  const activeRef = useRef(active);
  activeRef.current = active;
  const lastX = useRef<number | null>(null);

  // The saw's synthesized voice (handSawSynth.ts): fed per stroke with
  // the hand's speed and direction, ticked every frame so it decays the
  // moment the hand stops. Built lazily on the first stroke — a surface
  // that only ever shows the pencil line stays silent and graphless.
  const voiceRef = useRef<HandSawVoice | null>(null);
  const lastStrokeAt = useRef<number | null>(null);
  useEffect(
    () => () => {
      voiceRef.current?.dispose();
      voiceRef.current = null;
    },
    [],
  );
  useTick((ticker: Ticker) => {
    voiceRef.current?.tick(ticker.deltaMS / 1000);
  });

  const kerfG = useRef<Graphics>(null);
  // The offcut half's container, sagged imperatively as the cut nears
  // through; state for the mask-wiring effects, refs for the handler.
  const offcutRef = useRef<Container | null>(null);
  const [keptC, setKeptC] = useState<Container | null>(null);
  const [keptM, setKeptM] = useState<Graphics | null>(null);
  const [offcutC, setOffcutC] = useState<Container | null>(null);
  const [offcutM, setOffcutM] = useState<Graphics | null>(null);
  useEffect(() => {
    if (!keptC || !keptM) return;
    keptC.mask = keptM;
    return () => {
      keptC.mask = null;
    };
  }, [keptC, keptM]);
  useEffect(() => {
    if (!offcutC || !offcutM) return;
    offcutC.mask = offcutM;
    return () => {
      offcutC.mask = null;
    };
  }, [offcutC, offcutM]);

  // The line's y at a given local x, in inches — miters slant it
  const lineY = useCallback(
    (xIn: number, centerYIn: number): number => {
      const run = Math.tan((angle * Math.PI) / 180);
      return centerYIn + (xIn - size.widthIn / 2) * run;
    },
    [angle, size.widthIn],
  );

  /** Line endpoints in local px, centered on the piece. */
  const linePx = useCallback(() => {
    const centerYIn =
      markedFraction !== null
        ? markedFraction * size.heightIn
        : (ghostMarkIn ?? null);
    if (centerYIn === null) return null;
    const w = size.widthIn * fit.pxPerIn;
    return {
      x0: -w / 2,
      y0: (lineY(0, centerYIn) - size.heightIn / 2) * fit.pxPerIn,
      x1: w / 2,
      y1: (lineY(size.widthIn, centerYIn) - size.heightIn / 2) * fit.pxPerIn,
    };
  }, [fit.pxPerIn, ghostMarkIn, lineY, markedFraction, size]);

  const applySag = useCallback(() => {
    const offcut = offcutRef.current;
    const line = linePx();
    if (!offcut) return;
    if (!line) return;
    // Nothing until the last strokes, then the offcut hangs open: the
    // angle is sized so the kerf's free end gapes about a fifth of an
    // inch by the final stroke, whatever the board's width — a fixed
    // angle would vanish on narrow stock.
    const t = Math.min(1, Math.max(0, (kerfFraction(mask) - 0.85) / 0.15));
    const lengthPx = Math.hypot(line.x1 - line.x0, line.y1 - line.y0);
    const gapPx = 0.22 * fit.pxPerIn;
    // The fibers still holding are at the uncut end of the fuse-burn;
    // negative rotation swings the free corner away from the kept side.
    offcut.pivot.set(line.x1, line.y1);
    offcut.position.set(line.x1, line.y1);
    offcut.rotation = -t * t * Math.min(0.07, gapPx / lengthPx);
  }, [fit.pxPerIn, linePx, mask]);

  const drawLine = useCallback(
    (g: Graphics) => {
      g.clear();
      const line = linePx();
      if (!line) return;
      const { x0, y0, x1, y1 } = line;
      if (markedFraction === null) {
        // The pencil mark, waiting for the press to commit it
        g.moveTo(x0, y0)
          .lineTo(x1, y1)
          .stroke({ width: 2, color: 0x4a4237, alpha: 0.7 });
        return;
      }
      const fraction = kerfFraction(mask);
      const dx = x1 - x0;
      const dy = y1 - y0;
      const length = Math.hypot(dx, dy);
      // Perpendicular unit, for the ragged wander of a hand-cut kerf
      const px = -dy / length;
      const py = dx / length;
      // The pencil line still waiting ahead of the cut
      if (fraction < 1) {
        g.moveTo(x0 + dx * fraction, y0 + dy * fraction)
          .lineTo(x1, y1)
          .stroke({ width: 2, color: 0x4a4237, alpha: 0.7 });
      }
      if (fraction <= 0) return;
      // The kerf consumes the line from one edge toward the other — a
      // jittered polyline (deterministic per vertex, so redraws don't
      // shimmer), drawn twice: the torn mouth wide and soft, stopping
      // short of the tip, and the through-cut thin and dark to the tip.
      const steps = Math.max(2, Math.round((length * fraction) / 5));
      const wander = (index: number): number => {
        const s = Math.sin(index * 127.1 + 311.7) * 43758.5453;
        return (s - Math.floor(s)) * 2 - 1;
      };
      const kerfPath = (upTo: number) => {
        g.moveTo(x0, y0);
        for (let i = 1; i <= steps; i++) {
          const t = (i / steps) * upTo;
          const w = i === steps ? 0 : wander(i) * 0.8;
          g.lineTo(x0 + dx * t + px * w, y0 + dy * t + py * w);
        }
      };
      if (fraction > 0.12) {
        kerfPath(fraction * 0.88);
        g.stroke({ width: 3.4, color: 0x2b241c, alpha: 0.5 });
      }
      kerfPath(fraction);
      g.stroke({ width: 1.8, color: 0x2b241c, alpha: 0.95 });
    },
    [linePx, markedFraction, mask],
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
      const run = Math.tan((angle * Math.PI) / 180);
      const norm = Math.hypot(1, run);
      const direction = Math.sign(xIn - last) || 1;
      // The voice hears every stroke: speed from the event spacing,
      // direction for the push–pull asymmetry, depth for the timbre arc
      const strokeNow = performance.now();
      const dt = Math.min(
        0.1,
        Math.max(
          0.004,
          (strokeNow - (lastStrokeAt.current ?? strokeNow)) / 1000,
        ),
      );
      lastStrokeAt.current = strokeNow;
      voiceRef.current ??= new HandSawVoice();
      voiceRef.current.stroke(
        travel / dt,
        direction > 0 ? 1 : -1,
        kerfFraction(mask),
      );
      // Dust spills at the crossing point, kicked the way the saw moves
      dustBus.queue.push({
        x: (xIn - size.widthIn / 2) * fit.pxPerIn,
        y: (lineY(xIn, centerY) - size.heightIn / 2) * fit.pxPerIn,
        dirX: (direction * 1) / norm,
        dirY: (direction * run) / norm,
        travelIn: travel,
      });
      if (kerfG.current) drawLine(kerfG.current);
      applySag();
      onProgress?.(next);
      if (kerfComplete(mask) && !doneRef.current) {
        doneRef.current = true;
        // The last fibers let go: the crack plays detached from the
        // voice, which the unmount is about to dispose. handSawCut is
        // explicitly silent in GameSoundLayer's OPERATION_CLIP map so
        // no generic completion whack lands on top of this.
        playSawPartCrack();
        onComplete();
      }
    },
    [
      angle,
      applySag,
      drawLine,
      dustBus,
      fit.pxPerIn,
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

  // The two halves' masks: everything to either side of the marked
  // line, with margin so the sprite's full extent stays covered. Each
  // mask is a child of the container it clips, so the offcut's mask
  // sags with it.
  const drawHalfMask = useCallback(
    (side: "kept" | "offcut") => (g: Graphics) => {
      g.clear();
      const line = linePx();
      if (!line) return;
      const margin = 6;
      const xL = line.x0 - margin;
      const xR = line.x1 + margin;
      const slope = (line.y1 - line.y0) / (line.x1 - line.x0);
      const yL = line.y0 - slope * margin;
      const yR = line.y1 + slope * margin;
      const edge =
        side === "kept"
          ? -(size.heightIn * fit.pxPerIn) / 2 - margin
          : (size.heightIn * fit.pxPerIn) / 2 + margin;
      g.poly([xL, yL, xR, yR, xR, edge, xL, edge]).fill(0xffffff);
    },
    [fit.pxPerIn, linePx, size.heightIn],
  );
  const drawKeptMask = useMemo(() => drawHalfMask("kept"), [drawHalfMask]);
  const drawOffcutMask = useMemo(() => drawHalfMask("offcut"), [drawHalfMask]);

  const species = materialDustSpecies(workpiece)[0] ?? "pine";

  return (
    <pixiContainer
      x={fit.originX + placement.xIn * fit.pxPerIn}
      y={fit.originY + placement.yIn * fit.pxPerIn}
      angle={placement.angleDeg}
      scale={{ x: placement.flipped ? -1 : 1, y: 1 }}
    >
      {/* Once claimed, the board draws here — the scene no longer has
          it — as two masked halves seamed under the kerf line, so the
          offcut can hang open a sliver over the last strokes */}
      {started && (
        <>
          <pixiContainer ref={setKeptC}>
            <pixiContainer scale={fit.spriteScale}>
              <MaterialSprite material={workpiece} />
            </pixiContainer>
            <pixiGraphics ref={setKeptM} draw={drawKeptMask} />
          </pixiContainer>
          <pixiContainer
            ref={(c: Container | null) => {
              offcutRef.current = c;
              setOffcutC(c);
            }}
          >
            <pixiContainer scale={fit.spriteScale}>
              <MaterialSprite material={workpiece} />
            </pixiContainer>
            <pixiGraphics ref={setOffcutM} draw={drawOffcutMask} />
          </pixiContainer>
        </>
      )}
      <pixiGraphics ref={kerfG} draw={drawLine} />
      {started && (
        <KerfDust bus={dustBus} species={species} pxPerIn={fit.pxPerIn} />
      )}
    </pixiContainer>
  );
};
