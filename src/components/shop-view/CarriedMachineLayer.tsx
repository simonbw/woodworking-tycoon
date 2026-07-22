import { useTick } from "@pixi/react";
import { Container } from "pixi.js";
import React, { useRef } from "react";
import { useCellMap } from "../../game/CellMap";
import { carriedMachinePlacement } from "../../game/game-actions/machine-actions";
import { Machine } from "../../game/Machine";
import { useGameState } from "../useGameState";
import { MachineGhostPreview } from "./MachineGhostPreview";
import { MachineSprite } from "./MachineSprite";
import { PIXELS_PER_CELL, cellToPixel } from "./shop-scale";
import { playerMotion } from "./playerMotionStore";

/**
 * Everything drawn while the player is lugging a machine: the machine
 * riding over their shoulders, and a ghost of where it would land — the
 * player stands at the operator cell and sets it down in front of them
 * (see carriedMachinePlacement). Green means it fits, red means no room.
 */
export const CarriedMachineLayer: React.FC = () => {
  const gameState = useGameState();
  const cellMap = useCellMap();
  const carried = gameState.player.carriedMachine;
  const placement = carriedMachinePlacement(gameState);
  const containerRef = useRef<Container>(null);

  // Ride the continuous body directly — the load tracks the shoulders
  // it's on, frame by frame.
  useTick(() => {
    const container = containerRef.current;
    if (!container) return;
    container.x = cellToPixel(playerMotion.pos[0]);
    container.y = cellToPixel(playerMotion.pos[1]);
  });

  if (!carried || !placement || gameState.player.away) {
    return null;
  }

  // Re-anchored to the origin so the overhead container controls position
  const overhead = new Machine({ ...carried, position: [0, 0] });

  return (
    <>
      <MachineGhostPreview
        machineTypeId={carried.machineTypeId}
        position={placement.position}
        rotation={placement.rotation}
        cellMap={cellMap}
      />
      <pixiContainer
        ref={containerRef}
        x={cellToPixel(playerMotion.pos[0])}
        y={cellToPixel(playerMotion.pos[1])}
      >
        <pixiContainer scale={0.45} y={-PIXELS_PER_CELL * 0.3}>
          {/* MachineSprite centers itself a half-cell in; pull it back to
              the container origin so it hovers centered on the player */}
          <pixiContainer x={-PIXELS_PER_CELL / 2} y={-PIXELS_PER_CELL / 2}>
            <MachineSprite machine={overhead} />
          </pixiContainer>
        </pixiContainer>
      </pixiContainer>
    </>
  );
};
