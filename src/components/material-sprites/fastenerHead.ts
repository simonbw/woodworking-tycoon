import { Graphics } from "pixi.js";
import { ConsumableId } from "../../game/Consumable";

/**
 * A driven fastener's head, drawn wherever fasteners show — the pallet's
 * nails, a build's driven crossings, a finished product's bill of
 * hardware. A nail is a domed head with a glint; a screw is the same
 * head with the driver's cross recessed into it, so the two economies
 * read apart at a glance in both views.
 */
export function drawFastenerHead(
  g: Graphics,
  x: number,
  y: number,
  r: number,
  consumable: ConsumableId,
): void {
  g.circle(x, y, r).fill({ color: 0x4a443e });
  if (consumable === "screws") {
    const s = r * 0.72;
    const width = Math.max(r * 0.3, 0.3);
    g.moveTo(x - s, y)
      .lineTo(x + s, y)
      .stroke({ width, color: 0x241f1b });
    g.moveTo(x, y - s)
      .lineTo(x, y + s)
      .stroke({ width, color: 0x241f1b });
  } else {
    g.circle(x - r * 0.3, y - r * 0.3, r * 0.4).fill({ color: 0x9a938c });
  }
}
