import { useApplication } from "@pixi/react";
import { Container, Graphics, RenderTexture } from "pixi.js";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  DUST_MAX_PER_CELL,
  DustMap,
  dustKeyToVec,
  dustTotal,
} from "../../game/Dust";
import { DustSpecies } from "../../game/Materials";
import { mixColors } from "../../utils/colorUtils";
import { seededRandom } from "../../utils/randUtils";
import { useGameState } from "../useGameState";
import { dustColorBySpecies } from "./colorBySpecies";
import { DustStamp, onDustStamp } from "./dustStampBus";
import { PIXELS_PER_CELL } from "./shop-scale";

/**
 * Stamps drawn per unit of persisted dust when rebuilding the floor from
 * GameState.dust on load. Art-directed to roughly match the density a
 * live session's settled particles produce — not an exact accounting.
 */
const REBUILD_STAMPS_PER_UNIT = 5;
/** Of the rebuilt stamps, how many read as shaving curls vs flecks. */
const REBUILD_SHAVING_CHANCE = 0.3;
const STAMP_ALPHA = 0.8;
/** How opaque a completely buried cell's base wash gets. */
const WASH_MAX_ALPHA = 0.72;

function drawStamp(g: Graphics, stamp: DustStamp): void {
  if (stamp.kind === "dust") {
    g.rect(
      stamp.x - stamp.size / 2,
      stamp.y - stamp.size / 2,
      stamp.size,
      stamp.size,
    );
    g.fill({ color: stamp.color, alpha: STAMP_ALPHA });
  } else {
    // moveTo first: without it the path connects each curl to the last
    // one drawn, which turns a batched rebuild into streaks
    g.moveTo(
      stamp.x + stamp.size * Math.cos(stamp.angle),
      stamp.y + stamp.size * Math.sin(stamp.angle),
    );
    g.arc(
      stamp.x,
      stamp.y,
      stamp.size,
      stamp.angle,
      stamp.angle + Math.PI * 1.3,
    );
    g.stroke({ width: 1.4, color: stamp.color, alpha: STAMP_ALPHA });
  }
}

/**
 * Deterministic drawing for one cell's persisted dust — same save, same
 * grime. A dusting is a scatter of flecks; a real drift lays a wobbly
 * opaque wash under them, so a buried cell reads as buried and a
 * cleaning stroke visibly takes the floor back. The wash polygon stays
 * inside the cell's rect (the eraser works cell rects), but its
 * vertices reach the edges so neighboring drifts touch instead of
 * showing the grid.
 */
function drawRebuiltCell(
  g: Graphics,
  key: string,
  amounts: DustMap[string],
): void {
  const [cellX, cellY] = dustKeyToVec(key);
  const rng = seededRandom(`dust:${key}`);
  const total = dustTotal(amounts);
  const fraction = Math.min(1, total / DUST_MAX_PER_CELL);

  // The base wash: overlapping soft clumps in the amount-weighted blend
  // of the species colors. Clump centers pile up mid-cell and thin out
  // toward the edges, so neighboring drifts read as one dappled mass
  // with no cell seams — the grid only exists in the ledger.
  if (fraction > 0.1) {
    let washColor: number | null = null;
    let weight = 0;
    for (const [species, amount] of Object.entries(amounts)) {
      const color = dustColorBySpecies[species as DustSpecies].primary;
      weight += amount ?? 0;
      washColor =
        washColor === null
          ? mixColors(color, 0xffffff, 0)
          : mixColors(washColor, color, (amount ?? 0) / weight);
    }
    if (washColor !== null) {
      const clumps = Math.ceil(3 + fraction * 9);
      const depth = Math.min(1, fraction * 1.4);
      for (let i = 0; i < clumps; i++) {
        // Clumps stay inside the cell rect (the eraser works cell rects)
        const clumpRadius = PIXELS_PER_CELL * (0.14 + rng() * 0.2);
        const range = PIXELS_PER_CELL - clumpRadius * 2;
        g.circle(
          cellX * PIXELS_PER_CELL + clumpRadius + rng() * range,
          cellY * PIXELS_PER_CELL + clumpRadius + rng() * range,
          clumpRadius,
        );
        g.fill({
          color: mixColors(washColor, 0xffffff, rng() * 0.25),
          alpha: (0.35 + rng() * 0.2) * depth * WASH_MAX_ALPHA,
        });
      }
    }
  }

  for (const [species, amount] of Object.entries(amounts)) {
    const base = dustColorBySpecies[species as DustSpecies].primary;
    const count = Math.round((amount ?? 0) * REBUILD_STAMPS_PER_UNIT);
    for (let i = 0; i < count; i++) {
      const shaving = rng() < REBUILD_SHAVING_CHANCE;
      drawStamp(g, {
        x: (cellX + 0.05 + rng() * 0.9) * PIXELS_PER_CELL,
        y: (cellY + 0.05 + rng() * 0.9) * PIXELS_PER_CELL,
        color: mixColors(base, 0xffffff, 0.15 + rng() * 0.3),
        size: shaving ? 3 + rng() * 2 : 1.4 + rng() * 1.6,
        kind: shaving ? "shavings" : "dust",
        angle: rng() * Math.PI * 2,
      });
    }
  }
}

/**
 * The sawdust that has come to rest on the shop floor, baked into a
 * single RenderTexture so an arbitrarily filthy shop renders at constant
 * cost. Live CutParticles chips bake in as they settle (via the stamp
 * bus); on mount the accumulated grime is rebuilt from GameState.dust,
 * so the floor — species colors included — survives a reload.
 */
export const DustLayer: React.FC<{ width: number; height: number }> = ({
  width,
  height,
}) => {
  const { app } = useApplication();
  const gameState = useGameState();
  // The rebuild wants the dust map at effect time without re-running on
  // every tick's new state object
  const dustRef = useRef(gameState.dust);
  dustRef.current = gameState.dust;

  const texture = useMemo(
    () => RenderTexture.create({ width, height, antialias: true }),
    [width, height],
  );
  useEffect(() => {
    return () => {
      texture.destroy(true);
    };
  }, [texture]);

  // The eraser draws through a wrapper because a blend mode on the root
  // of a renderer.render() call is ignored — blending happens when a
  // child composites into its parent's render.
  const scratch = useMemo(() => new Graphics(), []);
  const wrapper = useMemo(() => {
    const container = new Container();
    container.addChild(scratch);
    return container;
  }, [scratch]);
  useEffect(() => {
    return () => {
      wrapper.destroy({ children: true });
    };
  }, [wrapper]);

  const bakeStamp = useCallback(
    (stamp: DustStamp) => {
      if (!app?.renderer) {
        return;
      }
      scratch.clear();
      drawStamp(scratch, stamp);
      app.renderer.render({
        container: scratch,
        target: texture,
        clear: false,
      });
    },
    [app, texture, scratch],
  );

  useEffect(() => {
    // A fresh texture (mount or shop resize): redraw the persisted floor
    // in one batched render, then bake live settles as they arrive.
    if (app?.renderer) {
      scratch.clear();
      for (const [key, amounts] of Object.entries(dustRef.current)) {
        drawRebuiltCell(scratch, key, amounts);
      }
      app.renderer.render({ container: scratch, target: texture, clear: true });
    }
    return onDustStamp(bakeStamp);
  }, [app, texture, scratch, bakeStamp]);

  // Whenever a cell's dust changes — a sweep taking it, a machine
  // laying more down — erase its patch of the texture and redraw it at
  // the new amount. The seeded stamps are stable per cell, so a growing
  // cell keeps its pattern and just gains stamps; a swept cell visibly
  // thins. This keeps the floor an exact picture of GameState.dust
  // (the settling chips from CutParticles are sub-tick garnish on top).
  const prevDust = useRef(gameState.dust);
  useEffect(() => {
    const prev = prevDust.current;
    const next = gameState.dust;
    prevDust.current = next;
    if (prev === next || !app?.renderer || !wrapper) {
      return;
    }
    const changed = [
      ...new Set([...Object.keys(prev), ...Object.keys(next)]),
    ].filter(
      (key) => Math.abs(dustTotal(next[key]) - dustTotal(prev[key])) > 1e-6,
    );
    if (changed.length === 0) {
      return;
    }
    scratch.clear();
    for (const key of changed) {
      const [cellX, cellY] = dustKeyToVec(key);
      scratch.rect(
        cellX * PIXELS_PER_CELL,
        cellY * PIXELS_PER_CELL,
        PIXELS_PER_CELL,
        PIXELS_PER_CELL,
      );
      scratch.fill(0xffffff);
    }
    scratch.blendMode = "erase";
    app.renderer.render({ container: wrapper, target: texture, clear: false });
    scratch.blendMode = "normal";
    scratch.clear();
    for (const key of changed) {
      const remaining = next[key];
      if (remaining) {
        drawRebuiltCell(scratch, key, remaining);
      }
    }
    app.renderer.render({ container: wrapper, target: texture, clear: false });
  }, [gameState.dust, app, texture, scratch, wrapper]);

  return <pixiSprite texture={texture} x={0} y={0} />;
};
