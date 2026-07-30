import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { Machine, machineKey } from "../../game/Machine";
import { ShopInfo } from "../../game/ShopInfo";
import { Vector } from "../../game/Vectors";
import { useGameState, useMachines } from "../useGameState";
import {
  cordAnchor,
  cordSlack,
  nearestOutlet,
  Outlet,
  outletPositions,
} from "./power-cords";
import { cellToPixel, PIXELS_PER_CELL } from "./shop-scale";

const CORD = 0x1f1b16;
const PLUG = 0x3a332b;
const PLATE = 0xcbc0a6;
const PLATE_EDGE = 0x8f866c;
const SLOT = 0x1c1917;

/** Outward normal of the wall an outlet is mounted on, in world axes. */
function outwardNormal(outlet: Outlet): Vector {
  switch (outlet.side) {
    case "top":
      return [0, -1];
    case "bottom":
      return [0, 1];
    case "left":
      return [-1, 0];
    case "right":
      return [1, 0];
  }
}

/** An outlet's point on the wall face, in world pixels. */
function outletPixel(outlet: Outlet): Vector {
  return [cellToPixel(outlet.position[0]), cellToPixel(outlet.position[1])];
}

/**
 * A duplex receptacle drawn on the wall band: an ivory plate proud of the
 * face, two dark slots. Stylized elevation view, like the door jambs.
 */
function drawOutletPlate(g: Graphics, outlet: Outlet): void {
  const [x, y] = outletPixel(outlet);
  const [nx, ny] = outwardNormal(outlet);
  const [tx, ty] = [-ny, nx];
  const plate = (along: number, deep: number, color: number) => {
    const cx = x + nx * (deep / 2);
    const cy = y + ny * (deep / 2);
    const w = Math.abs(tx * along) + Math.abs(nx * deep);
    const h = Math.abs(ty * along) + Math.abs(ny * deep);
    g.rect(cx - w / 2, cy - h / 2, w, h);
    g.fill(color);
  };
  plate(13, 8, PLATE_EDGE);
  plate(11, 7, PLATE);
  // Two slots, side by side along the wall
  for (const offset of [-3, 3]) {
    g.rect(x + tx * offset - 1 + nx * 2, y + ty * offset - 1 + ny * 2, 2, 2);
    g.fill(SLOT);
  }
}

/**
 * One machine's cord: a lazy curve from under the machine to its outlet,
 * ending in a plug body against the wall. The bow is hash-seeded per
 * machine so it holds still frame to frame but re-drapes on a move.
 */
function drawCord(g: Graphics, machine: Machine, shopInfo: ShopInfo): void {
  const anchor = cordAnchor(machine);
  const outlet = nearestOutlet(anchor, shopInfo);
  const [sx, sy] = [cellToPixel(anchor[0]), cellToPixel(anchor[1])];
  const [ex, ey] = outletPixel(outlet);

  const dx = ex - sx;
  const dy = ey - sy;
  const dist = Math.hypot(dx, dy) || 1;
  // Bow the cord sideways: more slack on longer runs, capped so a
  // cross-shop cord doesn't swing into the next aisle.
  const bow =
    cordSlack(machineKey(machine.state)) *
    Math.min(dist * 0.25, PIXELS_PER_CELL);
  const midX = sx + dx / 2 + (-dy / dist) * bow;
  const midY = sy + dy / 2 + (dx / dist) * bow;

  g.moveTo(sx, sy);
  g.quadraticCurveTo(midX, midY, ex, ey);
  g.stroke({ width: 3, color: CORD, cap: "round", join: "round" });

  // The plug body, sticking out of the receptacle over the cord's end
  const [nx, ny] = outwardNormal(outlet);
  const [tx, ty] = [-ny, nx];
  const plugAlong = 7;
  const plugOut = 6;
  const cx = ex - nx * (plugOut / 2);
  const cy = ey - ny * (plugOut / 2);
  const w = Math.abs(tx * plugAlong) + Math.abs(nx * plugOut);
  const h = Math.abs(ty * plugAlong) + Math.abs(ny * plugOut);
  g.rect(cx - w / 2, cy - h / 2, w, h);
  g.fill(PLUG);
}

/**
 * Power cords for every corded machine on the floor, drawn on the slab
 * under the machines so only the runs between them read. A carried
 * machine leaves the machine list, so its cord unplugs by itself.
 */
export const PowerCordLayer: React.FC = () => {
  const gameState = useGameState();
  const machines = useMachines();
  const shopInfo = gameState.shopInfo;

  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      for (const outlet of outletPositions(shopInfo)) {
        drawOutletPlate(g, outlet);
      }
      for (const machine of machines) {
        if (machine.type.corded) {
          drawCord(g, machine, shopInfo);
        }
      }
    },
    [machines, shopInfo],
  );

  return <pixiGraphics draw={draw} />;
};
