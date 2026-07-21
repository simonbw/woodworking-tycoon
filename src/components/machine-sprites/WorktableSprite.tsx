import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { Machine } from "../../game/Machine";
import { PIXELS_PER_CELL } from "../shop-view/shop-scale";

/**
 * A shop-built worktable: a laminated wood top spanning the table's
 * footprint, breadboard-framed, with the leg posts peeking out at the
 * corners. One sprite draws every size — the top is the bounding box of
 * cellsOccupied (worktables are always solid rectangles).
 */
export const WorktableSprite: React.FC<{ machine: Machine }> = ({
  machine,
}) => {
  const cells = machine.type.cellsOccupied;

  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      const xs = cells.map(([x]) => x);
      const ys = cells.map(([, y]) => y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);

      // The top overhangs the legs but stays inside the cell bounds
      const inset = PIXELS_PER_CELL * 0.06;
      const left = (minX - 0.5) * PIXELS_PER_CELL + inset;
      const top = (minY - 0.5) * PIXELS_PER_CELL + inset;
      const width = (maxX - minX + 1) * PIXELS_PER_CELL - inset * 2;
      const height = (maxY - minY + 1) * PIXELS_PER_CELL - inset * 2;

      // Drop shadow toward the lower right
      g.roundRect(left + 4, top + 5, width, height, 6);
      g.fill({ color: 0x000000, alpha: 0.18 });

      // Leg posts at the corners, sticking out from under the top
      const legSize = PIXELS_PER_CELL * 0.16;
      for (const [lx, ly] of [
        [left + 2, top + 2],
        [left + width - legSize - 2, top + 2],
        [left + 2, top + height - legSize - 2],
        [left + width - legSize - 2, top + height - legSize - 2],
      ]) {
        g.rect(lx - 1.5, ly - 1.5, legSize + 3, legSize + 3);
        g.fill({ color: 0x5c3b1e });
      }

      // The laminated top
      g.roundRect(left, top, width, height, 5);
      g.fill({ color: 0xb08850 });
      g.roundRect(left, top, width, height, 5);
      g.stroke({ width: 2.5, color: 0x6b4a26 });

      // Lamination lines run along the long axis
      const alongX = width >= height;
      const stripCount = 4;
      const span = alongX ? height : width;
      for (let i = 1; i < stripCount; i++) {
        const offset = (span / stripCount) * i;
        if (alongX) {
          g.moveTo(left + 4, top + offset);
          g.lineTo(left + width - 4, top + offset);
        } else {
          g.moveTo(left + offset, top + 4);
          g.lineTo(left + offset, top + height - 4);
        }
        g.stroke({ width: 1, color: 0x8a6536, alpha: 0.7 });
      }

      // A light catch along the top-left edges
      g.moveTo(left + 3, top + height * 0.35);
      g.lineTo(left + 3, top + 3);
      g.lineTo(left + width * 0.35, top + 3);
      g.stroke({ width: 1.5, color: 0xd8b478, alpha: 0.8 });
    },
    [cells],
  );

  return <pixiGraphics draw={draw} />;
};
