import { useApplication } from "@pixi/react";
import { Graphics, RenderTexture } from "pixi.js";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { DustMap, dustKeyToVec } from "../../game/Dust";
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

  const scratch = useMemo(() => new Graphics(), []);
  useEffect(() => {
    return () => {
      scratch.destroy();
    };
  }, [scratch]);

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

  return <pixiSprite texture={texture} x={0} y={0} />;
};
