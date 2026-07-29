import { useTick } from "@pixi/react";
import { Graphics, Ticker } from "pixi.js";
import React, { useRef } from "react";
import { holdingBroom } from "../../game/HeldTool";
import { mixColors } from "../../utils/colorUtils";
import { rUniform } from "../../utils/randUtils";
import { dominantDustColor } from "./dust-color";
import { useGameState } from "../useGameState";
import { PIXELS_PER_CELL } from "./shop-scale";

/** Where the bristle head rides, in front of the body (local px). */
const HEAD_REACH = PIXELS_PER_CELL * 1.5;
/** Half the bristle bar's width. */
const HEAD_HALF_WIDTH = PIXELS_PER_CELL * 0.7;
/** How far the head sways to each side mid-stroke. */
const STROKE_SWAY = PIXELS_PER_CELL * 0.55;
/** Strokes per second while sweeping. */
const STROKE_RATE = 2.1;

interface Chip {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: number;
}

const MAX_CHIPS = 60;

/**
 * The broom in the player's hands, drawn in the body's rotated frame so
 * it always points where the player faces (up in local space). Idle it
 * rides at a slight angle; while the operate key is held it strokes side
 * to side and kicks a spray of species-colored flecks off the bristles.
 * The chips are pure garnish — the real dust movement is state, baked
 * into the DustLayer as cells change.
 */
export const HeldBroomSprite: React.FC = () => {
  const gameState = useGameState();
  const stateRef = useRef(gameState);
  stateRef.current = gameState;
  const graphicsRef = useRef<Graphics>(null);
  const phase = useRef(0);
  const chips = useRef<Chip[]>([]);

  useTick((ticker: Ticker) => {
    const g = graphicsRef.current;
    if (!g) return;
    const gs = stateRef.current;
    const dt = Math.min(ticker.deltaMS, 100) / 1000;
    const sweeping = gs.player.operating === true && gs.player.away === null;

    // The stroke: a pendulum while sweeping, easing home when not
    let sway: number;
    if (sweeping) {
      phase.current += dt * STROKE_RATE * Math.PI * 2;
      sway = Math.sin(phase.current) * STROKE_SWAY;
    } else {
      phase.current = 0;
      sway = STROKE_SWAY * 0.35;
    }

    g.clear();

    // Chips first, under the broom head
    if (sweeping && chips.current.length < MAX_CHIPS) {
      const color = dominantDustColor(gs);
      if (color !== null) {
        // Kicked off wherever the bristles are right now, thrown forward
        for (let i = 0; i < 2; i++) {
          chips.current.push({
            x: sway + rUniform(-HEAD_HALF_WIDTH, HEAD_HALF_WIDTH),
            y: -HEAD_REACH + rUniform(-4, 4),
            vx: Math.cos(phase.current) * rUniform(20, 60),
            vy: rUniform(-70, -20),
            life: 0,
            maxLife: rUniform(0.25, 0.5),
            size: rUniform(1.2, 2.6),
            color: mixColors(color, 0xffffff, rUniform(0.1, 0.4)),
          });
        }
      }
    }
    chips.current = chips.current.filter((chip) => {
      chip.life += dt;
      if (chip.life >= chip.maxLife) return false;
      chip.x += chip.vx * dt;
      chip.y += chip.vy * dt;
      chip.vx *= 1 - 4 * dt;
      chip.vy *= 1 - 4 * dt;
      const alpha = 0.8 * (1 - chip.life / chip.maxLife);
      g.rect(chip.x - chip.size / 2, chip.y - chip.size / 2, chip.size, chip.size);
      g.fill({ color: chip.color, alpha });
      return true;
    });

    // Handle, from the hands out to the head
    const gripX = 6;
    const gripY = 10;
    g.moveTo(gripX, gripY);
    g.lineTo(sway * 0.6, -HEAD_REACH * 0.55);
    g.lineTo(sway, -HEAD_REACH + 6);
    g.stroke({ width: 5, color: 0x2c2015 });
    g.moveTo(gripX, gripY);
    g.lineTo(sway * 0.6, -HEAD_REACH * 0.55);
    g.lineTo(sway, -HEAD_REACH + 6);
    g.stroke({ width: 3, color: 0x8a6a45 });

    // Ferrule and the bristle bar, tilted a touch with the stroke
    const tilt = (sway / STROKE_SWAY) * 0.18;
    const cos = Math.cos(tilt);
    const sin = Math.sin(tilt);
    const barX = sway;
    const barY = -HEAD_REACH;
    const bar = (halfW: number, halfH: number, dy: number) => {
      const corners = [
        [-halfW, dy - halfH],
        [halfW, dy - halfH],
        [halfW, dy + halfH],
        [-halfW, dy + halfH],
      ].map(([x, y]) => ({
        x: barX + x * cos - y * sin,
        y: barY + x * sin + y * cos,
      }));
      g.poly(corners);
    };
    bar(HEAD_HALF_WIDTH * 0.45, 3, 4);
    g.fill(0xb8b0a0);
    bar(HEAD_HALF_WIDTH, 5, -2);
    g.fill(0xd9c374);
    bar(HEAD_HALF_WIDTH, 5, -2);
    g.stroke({ width: 1.5, color: 0x8f7c3a });
  });

  if (!holdingBroom(gameState)) {
    return null;
  }
  // The draw prop is a mount-time no-op — every real frame is drawn
  // imperatively in useTick above
  return <pixiGraphics ref={graphicsRef} draw={() => {}} />;
};
