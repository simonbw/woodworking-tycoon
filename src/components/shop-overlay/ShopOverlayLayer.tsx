import React, { createContext, useContext } from "react";
import { useCellMap } from "../../game/CellMap";
import { Machine } from "../../game/Machine";
import { Vector, rotateVec, translateVec } from "../../game/Vectors";
import { PIXELS_PER_CELL } from "../shop-view/shop-scale";
import { MachineChips, OutfeedChips } from "../station/MachineChips";
import { StationSheet } from "../station/StationSheet";
import { useTargetedMachine } from "../TargetedMachineContext";
import { useGameState } from "../useGameState";
import { DoorPrompt } from "./DoorPrompt";
import { PlayerPrompt } from "./PlayerPrompt";

/**
 * How many screen pixels one world pixel occupies — the canvas scales to
 * fill the center column, and the overlay's anchors scale with it.
 */
export const OverlayScaleContext = createContext(1);

/**
 * The DOM layer floating over the shop canvas: everything you can do is
 * shown at the thing you'd do it to, as small key-hint chips — the same
 * weight as the player's own "[F] put down" hint. The targeted machine
 * wears its chips, outfeed stock is offered at the machine it came off
 * of, and the garage door offers "[E] head out" (its full destination
 * card opens on the keypress). The station sheet is the one big surface,
 * and only on request.
 */
export const ShopOverlayLayer: React.FC<{
  width: number;
  height: number;
  scale: number;
}> = ({ width, height, scale }) => {
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
      // own chips already offer the stock.
      !isTargeted(machine),
  );

  return (
    <OverlayScaleContext.Provider value={scale}>
      <div className="absolute inset-0 pointer-events-none">
        {/* The chips fold away while the station sheet is spread out */}
        {!carrying && targetedMachine && sheetMachine == null && (
          <MachineAnchored
            machine={targetedMachine}
            canvasWidth={width}
            canvasHeight={height}
          >
            <MachineChips machine={targetedMachine} />
          </MachineAnchored>
        )}

        {!carrying &&
          sheetMachine == null &&
          outfeedMachines.map((machine) => (
            <MachineAnchored
              key={`outfeed-${machine.type.name}@${machine.position.join(",")}`}
              machine={machine}
              canvasWidth={width}
              canvasHeight={height}
            >
              <OutfeedChips machine={machine} />
            </MachineAnchored>
          ))}

        <DoorPrompt canvasWidth={width} canvasHeight={height} />
        <PlayerPrompt />
        <StationSheet />
      </div>
    </OverlayScaleContext.Provider>
  );
};

/** A machine's occupied cells as a screen-pixel bounding box. */
function machineBBoxPx(
  machine: Machine,
  scale: number,
): {
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
  const cellPx = PIXELS_PER_CELL * scale;
  return {
    left: minX * cellPx,
    top: minY * cellPx,
    width: (maxX - minX + 1) * cellPx,
    height: (maxY - minY + 1) * cellPx,
  };
}

/**
 * Positions a hint cluster against a machine: above it by default (the
 * player usually stands at the operator cell below or beside), flipped
 * underneath when the machine hugs the canvas top.
 */
export const MachineAnchored: React.FC<{
  machine: Machine;
  canvasWidth: number;
  canvasHeight: number;
  children: React.ReactNode;
}> = ({ machine, canvasWidth, canvasHeight, children }) => {
  const scale = useContext(OverlayScaleContext);
  const bbox = machineBBoxPx(machine, scale);
  const centerX = bbox.left + bbox.width / 2;
  const above = bbox.top >= 64;

  const halfHint = 100;
  const left = Math.min(
    Math.max(centerX, Math.min(halfHint, canvasWidth / 2)),
    Math.max(canvasWidth - halfHint, canvasWidth / 2),
  );

  return (
    <div
      className="absolute z-20"
      style={{
        left,
        top: above ? bbox.top - 4 : bbox.top + bbox.height + 4,
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
}> = ({ cell, children, className }) => {
  const scale = useContext(OverlayScaleContext);
  const cellPx = PIXELS_PER_CELL * scale;
  return (
    <div
      className={"absolute z-10 " + (className ?? "")}
      style={{
        left: (cell[0] + 0.5) * cellPx,
        top: (cell[1] + 1) * cellPx + 4,
        transform: "translate(-50%, 0)",
      }}
    >
      {children}
    </div>
  );
};
