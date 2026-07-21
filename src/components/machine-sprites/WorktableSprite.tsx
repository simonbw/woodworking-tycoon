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
  const upgrades = machine.upgrades;

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

      // Installed upgrades read at a glance. The front edge (toward the
      // operator cell) is +y in machine-local coordinates.
      const front = top + height;
      const viseCount = upgrades.filter((id) => id === "vise").length;
      for (let i = 0; i < Math.min(viseCount, 2); i++) {
        // Cast-iron jaws clamped over the front edge (second vise goes
        // to the other corner)
        const vx = i === 0 ? left + width * 0.18 : left + width * 0.82;
        g.rect(vx - 8, front - 6, 16, 10);
        g.fill({ color: 0x4a5568 });
        g.rect(vx - 8, front - 6, 16, 10);
        g.stroke({ width: 1.5, color: 0x2d3748 });
        // The screw and handle poking out
        g.rect(vx - 1.5, front + 4, 3, 5);
        g.fill({ color: 0x2d3748 });
        g.rect(vx - 6, front + 8, 12, 2.5);
        g.fill({ color: 0x718096 });
      }
      if (upgrades.includes("toolDrawers")) {
        // Drawer fronts with pulls, tucked under the top's front edge
        const drawerWidth = Math.min(width * 0.32, 34);
        for (const dx of [left + width * 0.36, left + width * 0.64]) {
          g.rect(dx - drawerWidth / 2, front - 7, drawerWidth, 6);
          g.fill({ color: 0x8a6536 });
          g.rect(dx - drawerWidth / 2, front - 7, drawerWidth, 6);
          g.stroke({ width: 1, color: 0x5c3b1e });
          g.rect(dx - 4, front - 5.5, 8, 2.5);
          g.fill({ color: 0x2d3748 });
        }
      }
    },
    [cells, upgrades],
  );

  return <pixiGraphics draw={draw} />;
};
