import React from "react";
import { useCellMap } from "../../game/CellMap";
import { Machine } from "../../game/Machine";
import { Vector, rotateVec, translateVec } from "../../game/Vectors";
import { PIXELS_PER_CELL } from "../shop-view/shop-scale";
import { MachinePlacard, OutfeedPlacard } from "../station/MachinePlacard";
import { StationSheet } from "../station/StationSheet";
import { useTargetedMachine } from "../TargetedMachineContext";
import { useGameState } from "../useGameState";
import { DoorPrompt } from "./DoorPrompt";
import { PlayerPrompt } from "./PlayerPrompt";

/**
 * The DOM layer floating over the shop canvas: everything you can do is
 * shown at the thing you'd do it to. The targeted machine wears its
 * placard, outfeed stock is offered at the machine it came off of, the
 * garage door lists its destinations on its own header, and the player
 * carries a small cluster of hints for verbs aimed at the floor
 * underfoot. Positions are in canvas pixels — the canvas renders 1:1, so
 * a cell's screen position is just `cell * PIXELS_PER_CELL`.
 */
export const ShopOverlayLayer: React.FC<{
  width: number;
  height: number;
}> = ({ width, height }) => {
  const gameState = useGameState();
  const cellMap = useCellMap();
  const {
    machine: targetedMachine,
    isTargeted,
    sheetMachine,
  } = useTargetedMachine();

  if (gameState.player.away) {
    return null;
  }

  const carrying = gameState.player.carriedMachine != null;
  const cell = cellMap.at(gameState.player.position);
  const outfeedMachines = (cell?.outputMachines ?? []).filter(
    (machine) =>
      machine.outputMaterials.length > 0 &&
      // If the outfeed cell doubles as the operator cell, the machine's
      // own placard already offers the stock.
      !isTargeted(machine),
  );

  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* The placard folds away while a station sheet is spread out —
          the sheet covers the same ground and more */}
      {!carrying && targetedMachine && sheetMachine == null && (
        <MachineAnchored
          machine={targetedMachine}
          canvasWidth={width}
          canvasHeight={height}
        >
          <MachinePlacard machine={targetedMachine} />
        </MachineAnchored>
      )}

      {!carrying &&
        outfeedMachines.map((machine) => (
          <MachineAnchored
            key={`outfeed-${machine.type.name}@${machine.position.join(",")}`}
            machine={machine}
            canvasWidth={width}
            canvasHeight={height}
          >
            <OutfeedPlacard machine={machine} />
          </MachineAnchored>
        ))}

      <DoorPrompt canvasWidth={width} canvasHeight={height} />
      <PlayerPrompt />
      <StationSheet />
    </div>
  );
};

/** A machine's occupied cells as a pixel bounding box on the canvas. */
function machineBBoxPx(machine: Machine): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  const cells = machine.type.cellsOccupied.map((cell) =>
    translateVec(rotateVec(cell, machine.rotation), machine.position),
  );
  const xs = cells.map(([x]) => x);
  const ys = cells.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    left: minX * PIXELS_PER_CELL,
    top: minY * PIXELS_PER_CELL,
    width: (maxX - minX + 1) * PIXELS_PER_CELL,
    height: (maxY - minY + 1) * PIXELS_PER_CELL,
  };
}

/**
 * Positions a card against a machine: above it when there's more head
 * room, below otherwise, horizontally clamped so it stays over the
 * canvas. The card may overhang the canvas edge vertically — the placard
 * matters more than the floor it covers.
 */
export const MachineAnchored: React.FC<{
  machine: Machine;
  canvasWidth: number;
  canvasHeight: number;
  children: React.ReactNode;
}> = ({ machine, canvasWidth, canvasHeight, children }) => {
  const bbox = machineBBoxPx(machine);
  const centerX = bbox.left + bbox.width / 2;
  const roomAbove = bbox.top;
  const roomBelow = canvasHeight - (bbox.top + bbox.height);
  const above = roomAbove >= roomBelow;

  const halfCard = 168; // placard max-width 336px
  const left = Math.min(
    Math.max(centerX, Math.min(halfCard, canvasWidth / 2)),
    Math.max(canvasWidth - halfCard, canvasWidth / 2),
  );

  return (
    <div
      className="absolute z-20 w-[336px] pointer-events-auto"
      style={{
        left,
        top: above ? bbox.top - 8 : bbox.top + bbox.height + 8,
        transform: above ? "translate(-50%, -100%)" : "translate(-50%, 0)",
      }}
    >
      {children}
    </div>
  );
};

/** Positions a small hint cluster against a cell of the shop floor. */
export const CellAnchored: React.FC<{
  cell: Vector;
  children: React.ReactNode;
  className?: string;
}> = ({ cell, children, className }) => (
  <div
    className={"absolute z-10 " + (className ?? "")}
    style={{
      left: (cell[0] + 0.5) * PIXELS_PER_CELL,
      top: (cell[1] + 1) * PIXELS_PER_CELL + 4,
      transform: "translate(-50%, 0)",
    }}
  >
    {children}
  </div>
);
