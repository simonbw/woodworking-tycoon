import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { canisterFillFraction } from "../../game/ShopVac";
import { rotateVec, scaleVec } from "../../game/Vectors";
import { useGameState } from "../useGameState";
import { cellToPixelCenter, PIXELS_PER_CELL } from "./shop-scale";

/**
 * The shop vac: a squat canister drum on casters. Parked, it sits on its
 * cell; while the player drags it, it trails half a cell behind them
 * with the hose stretched to their hand. The drum's window shows how
 * full the canister is.
 */
export const ShopVacSprite: React.FC = () => {
  const gameState = useGameState();
  const vac = gameState.shopVac;
  const player = gameState.player;

  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      if (!vac) {
        return;
      }
      const carried = vac.position === null;
      const playerCenter = cellToPixelCenter(player.position);
      let x: number;
      let y: number;
      if (carried) {
        // Trails behind the player, opposite their facing
        const behind = scaleVec(
          rotateVec([1, 0], player.direction),
          -PIXELS_PER_CELL * 0.55,
        );
        x = playerCenter[0] + behind[0];
        y = playerCenter[1] + behind[1];
      } else {
        [x, y] = cellToPixelCenter(vac.position!);
      }

      const radius = PIXELS_PER_CELL * 0.21;
      // Shadow, casters
      g.ellipse(x, y + radius * 0.45, radius * 1.15, radius * 0.55);
      g.fill({ color: 0x000000, alpha: 0.22 });
      // Drum
      g.circle(x, y, radius);
      g.fill(0x3d4855);
      g.circle(x, y, radius);
      g.stroke({ width: 2.5, color: 0x262e38 });
      // Canister window: fills amber-brown as dust comes aboard
      const fill = canisterFillFraction(vac);
      g.circle(x, y, radius * 0.62);
      g.fill(0x1c2128);
      if (fill > 0) {
        const inner = radius * 0.62;
        const top = y + inner - 2 * inner * fill;
        g.rect(x - inner, top, inner * 2, y + inner - top);
        g.fill({ color: 0xa8895c, alpha: 0.95 });
        // Clip the fill back to the round window
        g.circle(x, y, radius * 0.62);
        g.stroke({ width: inner * 0.8, color: 0x3d4855 });
        g.circle(x, y, radius * 0.62 + 1);
        g.stroke({ width: 2, color: 0x262e38 });
      }
      // Lid handle
      g.rect(x - radius * 0.35, y - radius - 4, radius * 0.7, 4);
      g.fill(0xd97706);

      // Hose to the player's hand while dragging
      if (carried) {
        const midX = (x + playerCenter[0]) / 2;
        const midY = (y + playerCenter[1]) / 2 - 10;
        g.moveTo(x, y - radius * 0.5);
        g.quadraticCurveTo(midX, midY, playerCenter[0], playerCenter[1]);
        g.stroke({ width: 5, color: 0x262e38 });
        g.moveTo(x, y - radius * 0.5);
        g.quadraticCurveTo(midX, midY, playerCenter[0], playerCenter[1]);
        g.stroke({ width: 3, color: 0x4a5866 });
      }
    },
    [vac, player.position, player.direction],
  );

  if (!vac) {
    return null;
  }
  return <pixiGraphics draw={draw} />;
};
