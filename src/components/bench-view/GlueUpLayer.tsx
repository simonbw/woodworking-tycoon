import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import {
  ClampPlacement,
  clampGhosts,
  GlueRun,
} from "../../game/bench-work/glue-up";
import { BenchPlacement } from "../../game/bench-work/bench-layout";
import { MaterialInstance } from "../../game/Materials";
import { MaterialSprite } from "../material-sprites/MaterialSprite";
import { StageFit } from "./stageMath";

/** How wide the glue bottle's bead paints along a seam, in inches. */
export const BEAD_RADIUS_IN = 1;

/** Glue laid per second of active spreading, in²/s — one tunable. */
export const SPREAD_PER_SECOND = 14;

/**
 * How much of a seam the bead must cover. Deliberately short of the
 * sanding mask's 98%: squeeze-out closes small gaps, and pixel-hunting
 * the last half-inch of a glue line is nobody's idea of joinery.
 */
export const SPREAD_COMPLETE = 0.85;

/** How close a bare-hand press must land to a clamp bar to grab it. */
export const CLAMP_HIT_IN = 1.6;

/** A free clamp's bar length before any run tells it what to span. */
const DEFAULT_BAR_IN = 24;

/** The bar overhangs the stock this much on each side — the jaws. */
const BAR_OVERHANG_IN = 3;

function drawClamp(
  g: Graphics,
  clamp: ClampPlacement,
  pxPerIn: number,
  halfBarIn: number,
  style: "ghost" | "placed" | "tightened" | "held",
): void {
  const rad = (clamp.angleDeg * Math.PI) / 180;
  // The bar lies across the run: along the run's cross axis
  const dirX = Math.cos(rad);
  const dirY = Math.sin(rad);
  const cx = clamp.xIn * pxPerIn;
  const cy = clamp.yIn * pxPerIn;
  const half = halfBarIn * pxPerIn;
  const x0 = cx - dirX * half;
  const y0 = cy - dirY * half;
  const x1 = cx + dirX * half;
  const y1 = cy + dirY * half;
  if (style === "ghost") {
    g.moveTo(x0, y0)
      .lineTo(x1, y1)
      .stroke({ width: 3, color: 0xf5efe3, alpha: 0.3 });
    return;
  }
  const alpha = style === "held" ? 0.55 : 0.95;
  g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: 5, color: 0xb3502d, alpha });
  // Jaw blocks at the bar ends, set square to it
  const jawX = -dirY * 0.9 * pxPerIn;
  const jawY = dirX * 0.9 * pxPerIn;
  for (const [ex, ey] of [
    [x0, y0],
    [x1, y1],
  ] as const) {
    g.moveTo(ex - jawX, ey - jawY)
      .lineTo(ex + jawX, ey + jawY)
      .stroke({ width: 8, color: 0x57504a, alpha });
  }
  if (style === "tightened") {
    // The screw handle wound home
    g.circle(cx, cy, 4).fill({ color: 0x2f2b28, alpha: 0.9 });
  }
}

/**
 * The clamps-first glue-up drawn over the scene: seams as beads filling
 * with coverage, ghost bars where the run still wants clamps, the placed
 * bars themselves, and the one riding the cursor. Pure drawing — every
 * gesture is handled by BenchWorkSurface's scene handler, which owns the
 * coverage grids and the commit.
 */
export const GlueUpLayer: React.FC<{
  run: GlueRun | null;
  /** Coverage fraction per seam key. */
  seamCoverage: Readonly<Record<string, number>>;
  clamps: ReadonlyArray<ClampPlacement>;
  /** The first N placed clamps are wound tight. */
  tightened: number;
  ghosts: ReadonlyArray<ClampPlacement>;
  /** The held clamp's live position (already snapped), or null. */
  cursor: ClampPlacement | null;
  fit: StageFit;
}> = ({ run, seamCoverage, clamps, tightened, ghosts, cursor, fit }) => {
  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      const pxPerIn = fit.pxPerIn;
      // Seams first, under the ironmongery
      if (run) {
        for (const seam of run.seams) {
          const covered = Math.min(seamCoverage[seam.key] ?? 0, 1);
          g.moveTo(seam.x0In * pxPerIn, seam.y0In * pxPerIn)
            .lineTo(seam.x1In * pxPerIn, seam.y1In * pxPerIn)
            .stroke({
              width: 4,
              color: covered >= SPREAD_COMPLETE ? 0xe8b84a : 0xf5efe3,
              alpha: 0.2 + covered * 0.7,
            });
        }
      }
      const halfBar = run
        ? run.spanIn / 2 + BAR_OVERHANG_IN
        : DEFAULT_BAR_IN / 2;
      for (const ghost of ghosts) {
        drawClamp(g, ghost, pxPerIn, halfBar, "ghost");
      }
      clamps.forEach((clamp, index) => {
        drawClamp(
          g,
          clamp,
          pxPerIn,
          halfBar,
          index < tightened ? "tightened" : "placed",
        );
      });
      if (cursor) {
        drawClamp(g, cursor, pxPerIn, halfBar, "held");
      }
    },
    [clamps, cursor, fit.pxPerIn, ghosts, run, seamCoverage, tightened],
  );
  return (
    <pixiContainer x={fit.originX} y={fit.originY}>
      <pixiGraphics
        draw={draw}
        key={`glue-${clamps.length}-${tightened}-${ghosts.length}-${
          cursor ? "held" : ""
        }-${run?.seams.map((s) => `${s.key}:${Math.round((seamCoverage[s.key] ?? 0) * 20)}`).join("|") ?? ""}`}
      />
    </pixiContainer>
  );
};

/**
 * A glue-up curing where it was tightened: the very pieces of the run,
 * lying on their own persistent placements with every clamp bar wound
 * home over them. The scene proper is inactive during a cure (nothing
 * drags), so this read-only layer stands in for it.
 */
export const GlueCuringLayer: React.FC<{
  pieces: ReadonlyArray<MaterialInstance>;
  placementFor: (material: MaterialInstance) => BenchPlacement;
  run: GlueRun | null;
  fit: StageFit;
}> = ({ pieces, placementFor, run, fit }) => {
  const clamps = run ? clampGhosts(run) : [];
  return (
    <>
      <pixiContainer x={fit.originX} y={fit.originY}>
        {pieces.map((material) => {
          const placement = placementFor(material);
          return (
            <pixiContainer
              key={material.id}
              x={placement.xIn * fit.pxPerIn}
              y={placement.yIn * fit.pxPerIn}
              rotation={(placement.angleDeg * Math.PI) / 180}
              scale={fit.spriteScale}
            >
              <MaterialSprite material={material} />
            </pixiContainer>
          );
        })}
      </pixiContainer>
      <GlueUpLayer
        run={run}
        seamCoverage={Object.fromEntries(
          (run?.seams ?? []).map((seam) => [seam.key, 1]),
        )}
        clamps={clamps}
        tightened={clamps.length}
        ghosts={[]}
        cursor={null}
        fit={fit}
      />
    </>
  );
};
