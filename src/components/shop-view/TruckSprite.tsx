import { useTick } from "@pixi/react";
import { Container, Rectangle, Texture } from "pixi.js";
import React, { useMemo, useRef } from "react";
import { truckBedRect, truckParkedRect } from "../../game/lot";
import { MaterialInstance } from "../../game/Materials";
import { TARGET_HIGHLIGHT_FILTERS } from "./targetHighlight";
import { useTexture } from "../../utils/useTexture";
import { clamp } from "../../utils/mathUtils";
import { MaterialSprite } from "../material-sprites/MaterialSprite";
import {
  TRUCK_ARRIVE_MS,
  TRUCK_DEPART_MS,
  TRUCK_ROLL_IN_MS,
  TRUCK_ROLL_OUT_MS,
} from "../trip/TripTransitionLayer";
import { useGameState } from "../useGameState";
import { MachineCrateSprite } from "./MachineCrateSprite";
import { cellToPixel, inchesToPixels } from "./shop-scale";
import {
  getTruckStage,
  getTruckStageStartedAt,
  useTruckStage,
} from "./truckStageStore";

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

/** How far down the driveway the truck rolls before it's gone, in world
 * pixels — past the walkable lot's bottom edge at full camera scroll. */
const TRUCK_TRAVEL_PX = 1200;

/** The 400×600 art's canvas, in source pixels. */
const TRUCK_SRC_WIDTH = 400;
const TRUCK_SRC_HEIGHT = 600;

/** The cargo box's pixels inside the art — rail to rail, tailgate to
 * cab wall — so the bed can wear the targeting outline on its own. */
const BED_FRAME = new Rectangle(124, 344, 276 - 124, 561 - 344);

/**
 * The targeting treatment the truck wears: the whole body when E would
 * open the cab, just the cargo box when the bed itself is what the keys
 * act on (loading it, unpacking a crate out of it). Lifting a piece back
 * out outlines the piece instead — see `highlightedCargo`.
 */
export type TruckHighlight = "truck" | "bed" | null;

export const TruckSprite: React.FC<{
  highlight?: TruckHighlight;
  /** The piece in the bed E would lift out, outlined on its own the way a
   * pile on the floor is. Matched by identity against `truck.bed`. */
  highlightedCargo?: MaterialInstance;
}> = ({ highlight = null, highlightedCargo }) => {
  const gameState = useGameState();
  const truckTexture = useTexture("/images/pickup-truck.png");
  // The bed cropped out of the same art, drawn over itself pixel for
  // pixel — the outline shader rims a display object's silhouette, so
  // scoping the rim to the bed takes a bed-shaped object to rim.
  const bedTexture = useMemo(
    () => new Texture({ source: truckTexture.source, frame: BED_FRAME }),
    [truckTexture],
  );
  const stage = useTruckStage();
  const rollRef = useRef<Container>(null);

  // The trip roll: the whole truck (cargo riding along) slides down the
  // driveway on departure and backs up it on arrival, mapped off the
  // stage clock each frame (see TripTransitionLayer for the timeline).
  useTick(() => {
    const container = rollRef.current;
    if (!container) return;
    const now = getTruckStage();
    const elapsed = performance.now() - getTruckStageStartedAt();
    let offset = 0;
    if (now === "departing") {
      // The first stretch is the crank; then the wheels roll, easing in.
      const p = clamp(
        (elapsed - TRUCK_ROLL_OUT_MS) / (TRUCK_DEPART_MS - TRUCK_ROLL_OUT_MS),
        0,
        1,
      );
      offset = p * p * TRUCK_TRAVEL_PX;
    } else if (now === "arriving") {
      // Backing in: fast off the street, settling gently into the spot.
      const p = clamp(elapsed / Math.min(TRUCK_ROLL_IN_MS, TRUCK_ARRIVE_MS), 0, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      offset = (1 - eased) * TRUCK_TRAVEL_PX;
    }
    container.y = offset;
  });

  if (stage === "away") {
    return null;
  }

  const rect = truckParkedRect(gameState.shopInfo);
  const centerX = cellToPixel((rect.min[0] + rect.max[0]) / 2);
  const tailgateY = cellToPixel(rect.min[1]);
  // Flipped canvas: its top edge rides TAIL_INSET above the rear bumper
  const centerY =
    tailgateY - TRUCK_CANVAS_HEIGHT * TRUCK_TAIL_INSET + TRUCK_CANVAS_HEIGHT / 2;

  const bed = truckBedRect(gameState.shopInfo);
  const bedCenterX = cellToPixel((bed.min[0] + bed.max[0]) / 2);
  const bedCenterY = cellToPixel((bed.min[1] + bed.max[1]) / 2);

  // The bed crop rides exactly over its own pixels in the body art: the
  // sprite is anchored at its center and turned 180°, so a source-pixel
  // offset from the canvas center lands negated in the world.
  const srcToWorld = TRUCK_CANVAS_WIDTH / TRUCK_SRC_WIDTH;
  const bedFrameX =
    centerX -
    (BED_FRAME.x + BED_FRAME.width / 2 - TRUCK_SRC_WIDTH / 2) * srcToWorld;
  const bedFrameY =
    centerY -
    (BED_FRAME.y + BED_FRAME.height / 2 - TRUCK_SRC_HEIGHT / 2) * srcToWorld;

  return (
    <pixiContainer ref={rollRef}>
      <pixiSprite
        texture={truckTexture}
        x={centerX}
        y={centerY}
        width={TRUCK_CANVAS_WIDTH}
        height={TRUCK_CANVAS_HEIGHT}
        anchor={{ x: 0.5, y: 0.5 }}
        angle={180}
        filters={highlight === "truck" ? TARGET_HIGHLIGHT_FILTERS : undefined}
      />
      {highlight === "bed" && (
        <pixiSprite
          texture={bedTexture}
          x={bedFrameX}
          y={bedFrameY}
          width={BED_FRAME.width * srcToWorld}
          height={BED_FRAME.height * srcToWorld}
          anchor={{ x: 0.5, y: 0.5 }}
          angle={180}
          filters={TARGET_HIGHLIGHT_FILTERS}
        />
      )}
      {/* Cargo lies lengthwise in the bed, fanned like a floor pile.
          Long stock overhangs the tailgate — that's what the truck's
          for. Crates ride behind the cab, stock toward the gate. */}
      {gameState.truck.crates.map((machine, i) => (
        <MachineCrateSprite
          key={`bed-crate-${i}`}
          crate={{
            machine,
            // MachineCrateSprite centers on a cell; offset so the crate
            // lands staggered up the bed from its far end
            position: [
              (bed.min[0] + bed.max[0]) / 2 - 0.5,
              bed.max[1] - 1.6 - i * 1.2,
            ],
          }}
        />
      ))}
      {gameState.truck.bed.map((material, i) => (
        <pixiContainer
          key={`bed-${material.id ?? i}`}
          x={bedCenterX}
          y={bedCenterY + ((i % 3) - 1) * 6}
          angle={90 + ((i * 7) % 21) - 10}
          filters={
            material === highlightedCargo
              ? TARGET_HIGHLIGHT_FILTERS
              : undefined
          }
        >
          <MaterialSprite material={material} />
        </pixiContainer>
      ))}
    </pixiContainer>
  );
};
