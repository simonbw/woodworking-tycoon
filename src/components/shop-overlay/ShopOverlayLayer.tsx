import React, { createContext, useContext } from "react";
import { useCellMap } from "../useCellMap";
import { Machine, machineKey } from "../../game/Machine";
import { Vector, rotateVec, translateVec } from "../../game/Vectors";
import { PIXELS_PER_CELL } from "../shop-view/shop-scale";
import { MachineChips, OutfeedChips } from "../station/MachineChips";
import { StationSheet } from "../station/StationSheet";
import { useTargetedMachine } from "../TargetedMachineContext";
import { useGameState } from "../useGameState";
import { StandPrompt } from "./StandPrompt";
import { TruckBedPrompt, TruckPrompt } from "./TruckPrompt";
import { PlayerPrompt } from "./PlayerPrompt";
import { FloorSheet } from "./FloorSheet";

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
    machines: reachableMachines,
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
              key={`outfeed-${machineKey(machine.state)}`}
              machine={machine}
              canvasWidth={width}
              canvasHeight={height}
            >
              <OutfeedChips machine={machine} />
            </MachineAnchored>
          ))}

        <TruckPrompt canvasWidth={width} canvasHeight={height} />
        <TruckBedPrompt canvasWidth={width} />
        <StandPrompt canvasWidth={width} />
        {/* A handle on each machine the body can reach, for the same
            reason the floor's pieces have one — see PointMarker */}
        {!carrying &&
          reachableMachines.map((machine) => (
            <MachineMarker
              key={`anchor-${machineKey(machine.state)}`}
              machine={machine}
            />
          ))}

        <PlayerPrompt />
        <StationSheet />
        <FloorSheet />
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

/**
 * Positions a small hint cluster against a cell of the shop floor: hanging
 * below it by default, or floating over its top edge with
 * `placement="above"` (flipped back below when the cell hugs the canvas
 * top, mirroring MachineAnchored).
 */
export const CellAnchored: React.FC<{
  cell: Vector;
  children: React.ReactNode;
  className?: string;
  placement?: "above" | "below";
}> = ({ cell, children, className, placement = "below" }) => {
  const scale = useContext(OverlayScaleContext);
  const cellPx = PIXELS_PER_CELL * scale;
  const above = placement === "above" && cell[1] * cellPx >= 64;
  return (
    <div
      className={"absolute z-10 " + (className ?? "")}
      style={{
        left: (cell[0] + 0.5) * cellPx,
        top: above ? cell[1] * cellPx - 4 : (cell[1] + 1) * cellPx + 4,
        transform: above ? "translate(-50%, -100%)" : "translate(-50%, 0)",
      }}
    >
      {children}
    </div>
  );
};

/** PointMarker's machine twin: a 1px handle at the machine's center. */
const MachineMarker: React.FC<{ machine: Machine }> = ({ machine }) => {
  const scale = useContext(OverlayScaleContext);
  const bbox = machineBBoxPx(machine, scale);
  return (
    <span
      data-testid="machine-anchor"
      data-machine-type={machine.type.id}
      className="absolute block size-px"
      style={{
        left: bbox.left + bbox.width / 2,
        top: bbox.top + bbox.height / 2,
      }}
    />
  );
};

/**
 * A 1px handle sitting exactly on a world point, rather than clear of it
 * like the anchors above. Nothing to look at — it exists so a spec can
 * find where a specific piece is on screen. The canvas is a single
 * element with no per-piece handles of its own, and this rides the same
 * camera transform the world does, so its box is the real point.
 */
export const PointMarker: React.FC<{
  point: Vector;
  testId: string;
  materialId: string;
}> = ({ point, testId, materialId }) => {
  const scale = useContext(OverlayScaleContext);
  const cellPx = PIXELS_PER_CELL * scale;
  return (
    <span
      data-testid={testId}
      data-material-id={materialId}
      className="absolute block size-px"
      style={{ left: point[0] * cellPx, top: point[1] * cellPx }}
    />
  );
};

/**
 * CellAnchored's free-floating twin: positions a hint cluster against a
 * continuous world point (a pile's resting spot), half a cell above or
 * below it — the same visual gap CellAnchored leaves around its cell.
 */
export const PointAnchored: React.FC<{
  point: Vector;
  children: React.ReactNode;
  className?: string;
  placement?: "above" | "below";
  testId?: string;
}> = ({ point, children, className, placement = "below", testId }) => {
  const scale = useContext(OverlayScaleContext);
  const cellPx = PIXELS_PER_CELL * scale;
  const above = placement === "above" && (point[1] - 0.5) * cellPx >= 64;
  return (
    <div
      data-testid={testId}
      className={"absolute z-10 " + (className ?? "")}
      style={{
        left: point[0] * cellPx,
        top: above
          ? (point[1] - 0.5) * cellPx - 4
          : (point[1] + 0.5) * cellPx + 4,
        transform: above ? "translate(-50%, -100%)" : "translate(-50%, 0)",
      }}
    >
      {children}
    </div>
  );
};
