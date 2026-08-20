import { Graphics } from "pixi.js";
import { PIXELS_PER_CELL } from "../shop-scale";
import { MachineActivity } from "./machine-activity";

/**
 * The chrome every machine wears regardless of type — the old
 * MachineSprite's `DustBagSprite` and `OperationStatusBadge`, as plain
 * draw functions the MachineView drives.
 */

/**
 * The canvas collection bag on a machine's dust port: a plump little
 * sack cinched at the neck, tucked against the machine's corner so it
 * reads at a glance which stations are bagged.
 */
export function drawDustBag(g: Graphics): void {
  g.clear();
  const x = PIXELS_PER_CELL * 0.85;
  const y = PIXELS_PER_CELL * 0.8;
  // The bag: a soft sack, slightly slumped
  g.ellipse(x, y, 12, 14);
  g.fill(0xcbb489);
  g.ellipse(x, y, 12, 14);
  g.stroke({ width: 2, color: 0x9a865e });
  // Slump crease
  g.moveTo(x - 8, y + 2);
  g.quadraticCurveTo(x, y + 7, x + 8, y + 1);
  g.stroke({ width: 1.5, color: 0x9a865e });
  // Cinched neck + port stub toward the machine
  g.rect(x - 3, y - 19, 6, 6);
  g.fill(0x4b5563);
  g.moveTo(x - 4, y - 13);
  g.lineTo(x + 4, y - 13);
  g.stroke({ width: 3, color: 0x7c2d12 });
}

/**
 * Floating status over a working machine: a progress bar (amber while an
 * attended phase needs you at the machine, green while a hands-free
 * phase runs on its own) or a pulsing amber pause marker when an
 * attended phase is waiting for the player to come back.
 */
export function drawOperationStatusBadge(
  g: Graphics,
  activity: MachineActivity,
): void {
  g.clear();
  const { isOperating, needsYou, fraction, relevantPhase } = activity;
  if (!isOperating || relevantPhase === undefined) {
    return;
  }
  const y = -PIXELS_PER_CELL * 1.8;
  if (needsYou) {
    // Amber pause marker: this machine is waiting for the player
    g.circle(0, y, 7);
    g.fill({ color: 0x1c1917, alpha: 0.75 });
    g.circle(0, y, 6);
    g.fill(0xf59e0b);
    for (const x of [-2.5, 1]) {
      g.rect(x, y - 3, 1.5, 6);
      g.fill(0x1c1917);
    }
    return;
  }
  // Progress bar: amber while attended handwork, green while hands-free
  const barWidth = PIXELS_PER_CELL * 1.87;
  g.rect(-barWidth / 2 - 1, y - 3, barWidth + 2, 6);
  g.fill({ color: 0x1c1917, alpha: 0.75 });
  g.rect(-barWidth / 2, y - 2, barWidth * fraction, 4);
  g.fill(relevantPhase.attended ? 0xf59e0b : 0x4ade80);
}
