import { Graphics } from "pixi.js";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  coverageFraction,
  makeCoverageGrid,
  stampStroke,
} from "../../game/bench-work/coverage";
import { rowLayout } from "../../game/bench-work/workpiece";
import { MaterialInstance } from "../../game/Materials";
import { playSound } from "../../utils/sfx";
import { MaterialSprite } from "../material-sprites/MaterialSprite";
import { BenchPointerBus, BenchPointerEvent } from "./benchPointer";
import { StageFit } from "./stageMath";

/** The gap the strips wait apart at, before they're butted together. */
export const GLUE_GAP_IN = 2;

/** How wide the glue "brush" paints along a joint, in inches. */
const BEAD_RADIUS_IN = 1;

/** Glue laid per second of active spreading, in²/s — one tunable. */
const SPREAD_PER_SECOND = 14;

/**
 * How much of a joint the bead must cover. Deliberately short of the
 * sanding mask's 98%: squeeze-out closes small gaps, and pixel-hunting
 * the last half-inch of a glue line is nobody's idea of joinery.
 */
const SPREAD_COMPLETE = 0.85;

type GlueStage = "spread" | "butt" | "clamp";

/**
 * The glue-up script: spread glue along each waiting joint (stroke),
 * butt the boards together (point/snap), place the clamps (point, one
 * per requiredClamps). Everything here is ephemeral — masks, beads, and
 * placed pieces are UI state — until the LAST clamp goes on, which
 * fires the single commit: spend the glue, tie up the clamps, start the
 * hands-free cure (see docs/bench-minigames.md, decision 4).
 */
export const GlueSurface: React.FC<{
  pieces: ReadonlyArray<MaterialInstance>;
  requiredClamps: number;
  fit: StageFit;
  bus: BenchPointerBus;
  onCommit: () => void;
  onWork: () => void;
  onStage?: (stage: GlueStage, done: number, total: number) => void;
}> = ({ pieces, requiredClamps, fit, bus, onCommit, onWork, onStage }) => {
  // The staged-piece list is rebuilt from GameState every render (the
  // world keeps ticking under the bench view), so everything ephemeral
  // here keys on the pieces' IDs — not array identity — or the beads
  // would wipe five times a second.
  const piecesKey = pieces.map((piece) => piece.id).join("|");
  const layout = useMemo(
    () => rowLayout(pieces, GLUE_GAP_IN),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [piecesKey],
  );
  const jointCount = Math.max(pieces.length - 1, 1);

  // One 1-D coverage strip per joint
  const joints = useMemo(
    () =>
      Array.from({ length: jointCount }, (_, i) => {
        const left = layout.slots[i];
        const right = layout.slots[i + 1];
        const heightIn = Math.min(left.heightIn, right.heightIn);
        return {
          xIn: left.xIn + left.widthIn + GLUE_GAP_IN / 2,
          heightIn,
          grid: makeCoverageGrid(1, heightIn),
        };
      }),
    [jointCount, layout],
  );
  const [stage, setStage] = useState<GlueStage>("spread");
  const [spreadDone, setSpreadDone] = useState(0);
  const [butted, setButted] = useState(0);
  const [clamps, setClamps] = useState(0);
  const committedRef = useRef(false);
  const lastPoint = useRef<{ xIn: number; yIn: number; at: number } | null>(
    null,
  );

  useEffect(() => {
    onStage?.(
      stage,
      stage === "spread" ? spreadDone : stage === "butt" ? butted : clamps,
      stage === "spread"
        ? jointCount
        : stage === "butt"
          ? jointCount
          : requiredClamps,
    );
  }, [stage, spreadDone, butted, clamps, jointCount, requiredClamps, onStage]);

  const handlePointer = useCallback(
    (event: BenchPointerEvent) => {
      if (committedRef.current) return;
      const { xIn, yIn, type } = event;
      if (stage === "spread") {
        if (type === "up" || type === "leave") {
          lastPoint.current = null;
          return;
        }
        if (type === "down") {
          lastPoint.current = { xIn, yIn, at: performance.now() };
          return;
        }
        if (!event.held) return;
        const last = lastPoint.current;
        lastPoint.current = { xIn, yIn, at: performance.now() };
        if (!last) return;
        // Spread lands on whichever joint the pointer is riding
        const joint = joints.find(
          (candidate) => Math.abs(candidate.xIn - xIn) <= BEAD_RADIUS_IN * 1.5,
        );
        if (!joint) return;
        const distance = Math.abs(yIn - last.yIn);
        if (distance < 0.05) return;
        onWork();
        const dt = performance.now() - last.at;
        const gain = Math.min(
          1,
          (SPREAD_PER_SECOND * Math.min(dt, 100)) /
            1000 /
            Math.max(distance, 0.1),
        );
        stampStroke(
          joint.grid,
          0.5,
          last.yIn,
          0.5,
          yIn,
          BEAD_RADIUS_IN,
          gain / 4,
        );
        const done = joints.filter(
          (j) => coverageFraction(j.grid) >= SPREAD_COMPLETE,
        ).length;
        setSpreadDone(done);
        if (done === jointCount) {
          setStage("butt");
        }
        return;
      }
      if (type !== "down") return;
      if (stage === "butt") {
        // Press the next unmated piece to slide it against its neighbor
        playSound("material-drop", 0.4);
        const next = butted + 1;
        setButted(next);
        if (next >= jointCount) {
          setStage("clamp");
        }
        return;
      }
      // clamp stage: press a clamp spot; the last one commits
      playSound("glue-clamp", 0.5);
      const next = clamps + 1;
      setClamps(next);
      if (next >= requiredClamps && !committedRef.current) {
        committedRef.current = true;
        onCommit();
      }
    },
    [
      butted,
      clamps,
      jointCount,
      joints,
      onCommit,
      onWork,
      requiredClamps,
      stage,
    ],
  );
  useEffect(() => bus.register(handlePointer), [bus, handlePointer]);

  // Once butted, pieces close ranks: recompute a gapless layout
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const closed = useMemo(() => rowLayout(pieces, 0), [piecesKey]);
  const slots = stage === "spread" ? layout.slots : closed.slots;
  const centerOffset =
    stage === "spread" ? 0 : (layout.size.widthIn - closed.size.widthIn) / 2;

  const drawOverlay = useCallback(
    (g: Graphics) => {
      g.clear();
      if (stage === "spread") {
        // Beads: amber along each joint, opacity following coverage
        for (const joint of joints) {
          const covered =
            joint.grid.covered / (joint.grid.cols * joint.grid.rows);
          g.moveTo(joint.xIn * fit.pxPerIn, 0)
            .lineTo(joint.xIn * fit.pxPerIn, joint.heightIn * fit.pxPerIn)
            .stroke({
              width: 4,
              color: 0xe8b84a,
              alpha: 0.15 + covered * 0.75,
            });
        }
        return;
      }
      // Clamp bars across the glued row
      const width = closed.size.widthIn * fit.pxPerIn;
      const height = closed.size.heightIn * fit.pxPerIn;
      for (let i = 0; i < requiredClamps; i++) {
        const y = ((i + 1) / (requiredClamps + 1)) * height;
        const placed = i < clamps;
        const x0 = centerOffset * fit.pxPerIn - 8;
        const x1 = centerOffset * fit.pxPerIn + width + 8;
        if (placed) {
          g.moveTo(x0, y)
            .lineTo(x1, y)
            .stroke({ width: 5, color: 0xb3502d, alpha: 0.95 });
          g.rect(x0 - 4, y - 6, 6, 12).fill(0x57504a);
          g.rect(x1 - 2, y - 6, 6, 12).fill(0x57504a);
        } else if (stage === "clamp") {
          g.moveTo(x0, y)
            .lineTo(x1, y)
            .stroke({ width: 3, color: 0xf5efe3, alpha: 0.35 });
        }
      }
    },
    [
      centerOffset,
      clamps,
      closed.size.heightIn,
      closed.size.widthIn,
      fit.pxPerIn,
      joints,
      requiredClamps,
      stage,
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
          alpha={stage === "butt" && index > butted ? 0.85 : 1}
        >
          <MaterialSprite material={slot.material} />
        </pixiContainer>
      ))}
      <pixiGraphics
        draw={drawOverlay}
        key={`overlay-${stage}-${spreadDone}-${butted}-${clamps}`}
      />
    </pixiContainer>
  );
};
