import { useTick } from "@pixi/react";
import { Graphics, Ticker } from "pixi.js";
import React, { useRef } from "react";
import { dustKeyToVec, dustTotal, DustMap } from "../../game/Dust";
import { GameState } from "../../game/GameState";
import { holdingBroom } from "../../game/HeldTool";
import { getMachines } from "../../game/Machine";
import { carryingShopVac } from "../../game/ShopVac";
import { chebyshevDistance } from "../../game/Vectors";
import { SWEEP_AIM_REACH } from "../../game/game-actions/dust-actions";
import { mixColors } from "../../utils/colorUtils";
import { rUniform } from "../../utils/randUtils";
import { dominantSpeciesColor } from "./dust-color";
import { playerMotion } from "../world-view/playerMotionStore";
import { useGameState } from "../useGameState";
import { cellToPixel, cellToPixelCenter, PIXELS_PER_CELL } from "./shop-scale";

/** Particles spawned per unit of dust a cell loses in one tick. */
const PARTICLES_PER_UNIT = 5;
/** Ceiling on live particles — a hard cap, not a rate. */
const MAX_PARTICLES = 500;
/** Where the broom head rides ahead of the body, in cells. */
const BROOM_REACH = 1.3;
/** Where the nozzle tip rides ahead of the body, in cells. */
const NOZZLE_REACH = 0.9;

interface DustParticle {
  /** Spawn point, world px. */
  x: number;
  y: number;
  /** Random tumble applied on top of the homing ease. */
  driftX: number;
  driftY: number;
  life: number;
  maxLife: number;
  size: number;
  color: number;
  /** Fly into the tool, or pour downward (emptying at the can). */
  kind: "gather" | "pour";
  /** For pours: the fixed point to fall toward. */
  targetX: number;
  targetY: number;
}

/**
 * The dust in the air: whenever a floor cell loses dust — a broom
 * stroke, the vac's suction, the drag-past trickle — this layer throws
 * a burst of species-colored flecks from that cell that fly into the
 * tool doing the taking; emptying the pan or the canister pours a
 * stream into the garbage can. The floor texture (DustLayer) is the
 * ledger; this is the motion between the entries. Purely cosmetic —
 * it watches GameState.dust and never writes anything.
 */
export const DustMotionLayer: React.FC = () => {
  const gameState = useGameState();
  const stateRef = useRef<GameState>(gameState);
  stateRef.current = gameState;
  const graphicsRef = useRef<Graphics>(null);
  const prevDust = useRef<DustMap>(gameState.dust);
  const prevHeld = useRef(0);
  const particles = useRef<DustParticle[]>([]);

  useTick((ticker: Ticker) => {
    const g = graphicsRef.current;
    if (!g) return;
    g.clear();
    const gs = stateRef.current;
    const dt = Math.min(ticker.deltaMS, 100) / 1000;

    // ---- Spawn from floor cells that lost dust since last frame ----
    const next = gs.dust;
    const prev = prevDust.current;
    if (next !== prev) {
      for (const key of Object.keys(prev)) {
        const lost = dustTotal(prev[key]) - dustTotal(next[key]);
        if (lost <= 1e-6) continue;
        const color = dominantSpeciesColor(prev[key]);
        if (color === null) continue;
        const [cellX, cellY] = dustKeyToVec(key);
        const count = Math.min(
          Math.max(1, Math.round(lost * PARTICLES_PER_UNIT)),
          MAX_PARTICLES - particles.current.length,
        );
        for (let i = 0; i < count; i++) {
          particles.current.push({
            x: (cellX + rUniform(0.1, 0.9)) * PIXELS_PER_CELL,
            y: (cellY + rUniform(0.1, 0.9)) * PIXELS_PER_CELL,
            driftX: rUniform(-30, 30),
            // Biased upward: a stroke kicks dust up before it settles
            // into the pan or the nozzle
            driftY: rUniform(-45, 5),
            life: 0,
            maxLife: rUniform(0.3, 0.55),
            size: rUniform(3, 5.5),
            // Airborne dust catches the light — noticeably paler than
            // the drift it just left, or it vanishes against it
            color: mixColors(color, 0xffffff, rUniform(0.3, 0.55)),
            kind: "gather",
            targetX: 0,
            targetY: 0,
          });
        }
      }
      prevDust.current = next;
    }

    // ---- Spawn the pour while the pan/canister empties at the can ----
    const held =
      dustTotal(gs.dustpan) + dustTotal(gs.shopVac?.canister ?? undefined);
    const poured = prevHeld.current - held;
    if (poured > 1e-6) {
      const can = getMachines(gs.machines).find(
        (machine) => machine.type.id === "garbageCan",
      );
      if (can) {
        const [canX, canY] = cellToPixelCenter(can.position);
        const hand: [number, number] = [
          cellToPixel(playerMotion.pos[0]),
          cellToPixel(playerMotion.pos[1]),
        ];
        const count = Math.min(
          Math.max(2, Math.round(poured * PARTICLES_PER_UNIT * 0.7)),
          MAX_PARTICLES - particles.current.length,
        );
        for (let i = 0; i < count; i++) {
          particles.current.push({
            x: hand[0] + rUniform(-6, 6),
            y: hand[1] + rUniform(-10, 2),
            driftX: rUniform(-15, 15),
            driftY: rUniform(-10, 10),
            life: 0,
            maxLife: rUniform(0.25, 0.4),
            size: rUniform(1.6, 3.2),
            color: mixColors(0xa8895c, 0xffffff, rUniform(0, 0.3)),
            kind: "pour",
            targetX: canX + rUniform(-8, 8),
            targetY: canY + rUniform(-6, 6),
          });
        }
      }
    }
    prevHeld.current = held;

    // ---- The live target the gathered flecks home toward ----
    const aim = gs.player.sweepAim;
    const aimed =
      holdingBroom(gs) &&
      aim != null &&
      chebyshevDistance(aim, gs.player.position) <= SWEEP_AIM_REACH;
    const reach = carryingShopVac(gs) ? NOZZLE_REACH : BROOM_REACH;
    const toolX = aimed
      ? (aim![0] + 0.5) * PIXELS_PER_CELL
      : cellToPixel(playerMotion.pos[0]) +
        Math.cos(playerMotion.heading) * reach * PIXELS_PER_CELL;
    const toolY = aimed
      ? (aim![1] + 0.5) * PIXELS_PER_CELL
      : cellToPixel(playerMotion.pos[1]) +
        Math.sin(playerMotion.heading) * reach * PIXELS_PER_CELL;

    // ---- Integrate and draw ----
    particles.current = particles.current.filter((particle) => {
      particle.life += dt;
      if (particle.life >= particle.maxLife) return false;
      const t = particle.life / particle.maxLife;
      const ease = t * t * (3 - 2 * t);
      const targetX = particle.kind === "gather" ? toolX : particle.targetX;
      const targetY = particle.kind === "gather" ? toolY : particle.targetY;
      const drawX =
        particle.x +
        (targetX - particle.x) * ease +
        particle.driftX * t * (1 - t);
      const drawY =
        particle.y +
        (targetY - particle.y) * ease +
        particle.driftY * t * (1 - t);
      g.rect(
        drawX - particle.size / 2,
        drawY - particle.size / 2,
        particle.size,
        particle.size,
      );
      g.fill({ color: particle.color, alpha: 0.95 * (1 - t * 0.5) });
      return true;
    });
  });

  return <pixiGraphics ref={graphicsRef} draw={(g) => g.clear()} />;
};
