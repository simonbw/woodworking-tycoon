import { Graphics } from "pixi.js";
import { PIXELS_PER_CELL } from "../components/shop-view/shop-scale";
import { Game } from "../core/Game";
import { dustTotal } from "../game/Dust";
import { DUSTPAN_CAPACITY } from "../game/game-actions/dust-actions";
import { Player } from "../sim/entities/Player";
import { Broom } from "../sim/singletons/Broom";

/** Where the bristle head rides, in front of the body (local px). */
const HEAD_REACH = PIXELS_PER_CELL * 1.5;
/** Half the bristle bar's width. */
const HEAD_HALF_WIDTH = PIXELS_PER_CELL * 0.7;
/** How far the head sways to each side mid-stroke. */
const STROKE_SWAY = PIXELS_PER_CELL * 0.55;
/** Strokes per second while sweeping. */
const STROKE_RATE = 2.1;
/** How quickly the head swings around to a new aim, per second. */
const AIM_TURN_RATE = 10;

/**
 * The broom-and-dustpan combo in the player's hands — the old
 * HeldBroomSprite, drawn in the body's rotated frame so it always points
 * where the player faces (up in local space). Idle it rides at a slight
 * angle; while the operate key is held it strokes side to side. The pan
 * rides at the hip and shows its fill. The dust flying off the floor
 * into the pan is the dust-motion port's job — this is just the tool.
 *
 * Not an entity: PlayerView owns one and calls `update` each render,
 * exactly as the old PersonSprite mounted HeldBroomSprite inside its own
 * container, so the broom rides under the body sprite in the same frame.
 */
export class HeldBroomGraphics {
  readonly graphics = new Graphics();
  private phase = 0;

  /** @param parentRotation the body frame's eased world rotation. */
  update(dt: number, game: Game, player: Player, parentRotation: number): void {
    const g = this.graphics;
    const broom = game.entities.tryGetSingleton(Broom);
    if (!broom?.inHand) {
      if (g.visible) {
        g.visible = false;
        g.clear();
      }
      return;
    }
    g.visible = true;
    const clampedDt = Math.min(dt, 0.1);
    const sweeping = player.operating === true && player.away === null;

    // The mouse steers the head: swing the whole broom toward the aimed
    // cell, counter-rotating out of the body's eased heading so the
    // bristles land where the swath actually works. No aim eases home.
    const aim = player.sweepAim;
    let targetRotation = 0;
    if (aim) {
      const worldAngle = Math.atan2(
        aim[1] + 0.5 - player.position[1],
        aim[0] + 0.5 - player.position[0],
      );
      targetRotation = worldAngle + Math.PI / 2 - parentRotation;
    }
    const delta =
      ((targetRotation - g.rotation + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    g.rotation += delta * Math.min(1, clampedDt * AIM_TURN_RATE);

    // The stroke: a pendulum while sweeping, easing home when not
    let sway: number;
    if (sweeping) {
      this.phase += clampedDt * STROKE_RATE * Math.PI * 2;
      sway = Math.sin(this.phase) * STROKE_SWAY;
    } else {
      this.phase = 0;
      sway = STROKE_SWAY * 0.35;
    }

    g.clear();

    // The dustpan, riding at the hip: a shallow tray whose tint fills
    // with the pan's actual load
    const panFill = Math.min(1, dustTotal(broom.dustpan) / DUSTPAN_CAPACITY);
    const panX = -10;
    const panY = 6;
    g.roundRect(panX - 7, panY - 5, 14, 10, 2);
    g.fill(0x4a5866);
    if (panFill > 0) {
      g.roundRect(panX - 5.5, panY - 3.5, 11 * Math.min(1, panFill), 7, 1.5);
      g.fill({ color: 0xa8895c, alpha: 0.95 });
    }
    g.roundRect(panX - 7, panY - 5, 14, 10, 2);
    g.stroke({ width: 1.5, color: 0x262e38 });

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
  }
}
