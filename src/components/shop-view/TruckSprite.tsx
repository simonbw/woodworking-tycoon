import React from "react";
import { truckParkedRect } from "../../game/lot";
import { useTexture } from "../../utils/useTexture";
import { useGameState } from "../useGameState";
import { cellToPixel, inchesToPixels } from "./shop-scale";

/**
 * The truck parked in the driveway, backed in with the tailgate to the
 * garage. Where it sits — and the solid the walking body bounces off —
 * comes from truckParkedRect in lot.ts; this component only maps the art
 * onto that footprint.
 *
 * The art is a 400×600 top-down view drawn nose-up. Inside that canvas
 * the red body is 184 px wide, the mirrors reach 264, and the truck spans
 * 562 px bumper to bumper — proportionally a little longer than a real
 * Ranger, so no single scale can match both figures. Scaling the canvas
 * to 144" splits the difference: a 66" body and a 202" length, each
 * within a few percent — the same figures lot.ts uses for the footprint.
 * The sprite is turned 180°, so the rear bumper sits under the canvas's
 * (flipped) top margin.
 */
const TRUCK_CANVAS_WIDTH = inchesToPixels(144);
const TRUCK_CANVAS_HEIGHT = TRUCK_CANVAS_WIDTH * (600 / 400);

/** Transparent canvas beyond the rear bumper, as a fraction of the art
 * (600 minus the 27 px nose margin minus the 562 px truck). */
const TRUCK_TAIL_INSET = 11 / 600;

export const TruckSprite: React.FC = () => {
  const gameState = useGameState();
  const truckTexture = useTexture("/images/pickup-truck.png");

  const rect = truckParkedRect(gameState.shopInfo);
  const centerX = cellToPixel((rect.min[0] + rect.max[0]) / 2);
  const tailgateY = cellToPixel(rect.min[1]);
  // Flipped canvas: its top edge rides TAIL_INSET above the rear bumper
  const centerY =
    tailgateY - TRUCK_CANVAS_HEIGHT * TRUCK_TAIL_INSET + TRUCK_CANVAS_HEIGHT / 2;

  return (
    <pixiSprite
      texture={truckTexture}
      x={centerX}
      y={centerY}
      width={TRUCK_CANVAS_WIDTH}
      height={TRUCK_CANVAS_HEIGHT}
      anchor={{ x: 0.5, y: 0.5 }}
      angle={180}
    />
  );
};
