import { useApplication } from "@pixi/react";
import { Container, Graphics, RenderTexture } from "pixi.js";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { DustMap, dustKeyToVec, dustTotal } from "../../game/Dust";
import { Species } from "../../game/Materials";
import { mixColors } from "../../utils/colorUtils";
import { seededRandom } from "../../utils/randUtils";
import { useGameState } from "../useGameState";
import { colorBySpecies } from "./colorBySpecies";
import { DustStamp, onDustStamp } from "./dustStampBus";
import { PIXELS_PER_CELL } from "./shop-scale";

/**
 * Stamps drawn per unit of persisted dust when rebuilding the floor from
 * GameState.dust on load. Art-directed to roughly match the density a
 * live session's settled particles produce — not an exact accounting.
 */
const REBUILD_STAMPS_PER_UNIT = 2;
/** Of the rebuilt stamps, how many read as shaving curls vs flecks. */
const REBUILD_SHAVING_CHANCE = 0.3;
const STAMP_ALPHA = 0.8;

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

/** Deterministic stamps for one cell's persisted dust — same save, same grime. */
function drawRebuiltCell(
  g: Graphics,
  key: string,
  amounts: DustMap[string],
): void {
  const [cellX, cellY] = dustKeyToVec(key);
  const rng = seededRandom(`dust:${key}`);
  for (const [species, amount] of Object.entries(amounts)) {
    const base = colorBySpecies[species as Species].primary;
    const count = Math.round((amount ?? 0) * REBUILD_STAMPS_PER_UNIT);
    for (let i = 0; i < count; i++) {
      const shaving = rng() < REBUILD_SHAVING_CHANCE;
      drawStamp(g, {
        x: (cellX + 0.05 + rng() * 0.9) * PIXELS_PER_CELL,
        y: (cellY + 0.05 + rng() * 0.9) * PIXELS_PER_CELL,
        color: mixColors(base, 0xffffff, 0.15 + rng() * 0.3),
        size: shaving ? 3 + rng() * 2 : 1.2 + rng() * 1.2,
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

  // Sweeping: when a cell's dust drops, erase its patch of the texture
  // and redraw whatever film remains — the rest of the floor keeps its
  // live-settled look untouched.
  const prevDust = useRef(gameState.dust);
  useEffect(() => {
    const prev = prevDust.current;
    const next = gameState.dust;
    prevDust.current = next;
    if (prev === next || !app?.renderer || !wrapper) {
      return;
    }
    const cleaned = Object.keys(prev).filter(
      (key) => dustTotal(next[key]) < dustTotal(prev[key]) - 1e-6,
    );
    if (cleaned.length === 0) {
      return;
    }
    scratch.clear();
    for (const key of cleaned) {
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
    for (const key of cleaned) {
      const remaining = next[key];
      if (remaining) {
        drawRebuiltCell(scratch, key, remaining);
      }
    }
    app.renderer.render({ container: scratch, target: texture, clear: false });
  }, [gameState.dust, app, texture, scratch, wrapper]);

  return <pixiSprite texture={texture} x={0} y={0} />;
};
