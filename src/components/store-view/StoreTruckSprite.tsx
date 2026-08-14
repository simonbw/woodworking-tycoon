import { useTick } from "@pixi/react";
import { Container } from "pixi.js";
import React, { useRef } from "react";
import { StoreLayout } from "../../game/store-layout";
import { TARGET_HIGHLIGHT_FILTERS } from "../shop-view/targetHighlight";
import { MachineCrateSprite } from "../shop-view/MachineCrateSprite";
import { MaterialSprite } from "../material-sprites/MaterialSprite";
import { cellToPixel, inchesToPixels } from "../shop-view/shop-scale";
import { useTexture } from "../../utils/useTexture";
import { useGameState } from "../useGameState";

/**
 * The truck in its stall out front, nose along +x: the same art the
 * driveway uses, turned a quarter, with whatever rides in the bed drawn
 * lying in it — cargo hauled from home, and the register's purchases the
 * moment they're rung up. When the trip ends at the register, this is
 * the sprite that pulls out of the stall while the screen heads home.
 */

/** The canvas maps 144" across the art's width, the same figure
 * TruckSprite documents. */
const CANVAS_WIDTH = inchesToPixels(144);
const CANVAS_HEIGHT = CANVAS_WIDTH * (600 / 400);

/** The art's source frame, for mapping the bed into the stall. */
const SRC_WIDTH = 400;
const SRC_HEIGHT = 600;
/** The cargo box's source pixels — rail to rail, tailgate to cab wall —
 * matching TruckSprite's BED_FRAME. */
const BED_SRC = { x: 124, y: 344, width: 276 - 124, height: 561 - 344 };

/** How long the pull-out takes, and how far it rolls (off the east edge
 * of anything the camera frames). */
export const STORE_DEPART_MS = 1600;
const DEPART_TRAVEL_PX = 1400;

export const StoreTruckSprite: React.FC<{
  layout: StoreLayout;
  /** performance.now() when the register rang the cart up, or null while
   * the truck just sits parked. */
  departingSince: number | null;
  /** Whether the shopper stands at the cab — the way home lights up. */
  targeted: boolean;
}> = ({ layout, departingSince, targeted }) => {
  const truckTexture = useTexture("/images/pickup-truck.png");
  const gameState = useGameState();
  const rollRef = useRef<Container>(null);

  useTick(() => {
    const container = rollRef.current;
    if (!container) return;
    if (departingSince === null) {
      container.x = 0;
      return;
    }
    // Ease in like the driveway roll: idle settle, then away.
    const p = Math.min(
      1,
      (performance.now() - departingSince) / STORE_DEPART_MS,
    );
    container.x = p * p * DEPART_TRAVEL_PX;
  });

  const stall = layout.truck;
  const centerX = cellToPixel((stall.min[0] + stall.max[0]) / 2);
  const centerY = cellToPixel((stall.min[1] + stall.max[1]) / 2);

  // The art turned nose-+x: a source offset from the canvas center
  // (ox, oy) lands at (-oy, ox) in the world.
  const srcToWorld = CANVAS_WIDTH / SRC_WIDTH;
  const bedCenterX =
    centerX - (BED_SRC.y + BED_SRC.height / 2 - SRC_HEIGHT / 2) * srcToWorld;
  const bedCenterY =
    centerY + (BED_SRC.x + BED_SRC.width / 2 - SRC_WIDTH / 2) * srcToWorld;
  const bedCenterCell: [number, number] = [
    bedCenterX / cellToPixel(1),
    bedCenterY / cellToPixel(1),
  ];

  return (
    <pixiContainer ref={rollRef}>
      <pixiSprite
        texture={truckTexture}
        anchor={{ x: 0.5, y: 0.5 }}
        x={centerX}
        y={centerY}
        rotation={Math.PI / 2}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        filters={targeted ? TARGET_HIGHLIGHT_FILTERS : undefined}
      />
      {/* Cargo lies lengthwise in the bed, crates behind the cab, the
          same fan the driveway's TruckSprite deals — turned with the
          truck. */}
      {gameState.truck.crates.map((machine, i) => (
        <MachineCrateSprite
          key={`stall-crate-${i}`}
          crate={{
            machine,
            position: [
              bedCenterCell[0] + 1.1 - 0.5 - i * 1.2,
              bedCenterCell[1] - 0.5,
            ],
          }}
        />
      ))}
      {gameState.truck.bed.map((material, i) => (
        <pixiContainer
          key={`stall-bed-${material.id ?? i}`}
          x={bedCenterX}
          y={bedCenterY + ((i % 3) - 1) * 6}
          angle={90 + ((i * 7) % 21) - 10}
        >
          <MaterialSprite material={material} />
        </pixiContainer>
      ))}
    </pixiContainer>
  );
};
