import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useCellMap } from "./useCellMap";
import { Machine, machineKey as machineStateKey } from "../game/Machine";
import { atTruckCab } from "../game/lot";
import { pileWithinReach } from "../game/pile-helpers";
import {
  Direction,
  Vector,
  rotateVec,
  translateVec,
  vectorKey,
} from "../game/Vectors";
import { useGameState } from "./useGameState";

interface TargetedMachineValue {
  /** The machine the keyboard actions (E/F/R/Q/Z) act on, if any. */
  machine: Machine | undefined;
  /** Every operable machine on the player's square, in render order. */
  machines: readonly Machine[];
  isTargeted: (machine: Machine) => boolean;
  cycleTarget: () => void;
  /** Aim the keyboard at a specific machine on this square (mouse path). */
  setTarget: (machine: Machine) => void;
  /**
   * How far R has rummaged from the top of the pile underfoot. Applied to
   * an interact's `piles` via `targetedPile`; resets when the player moves
   * or the pile changes (a piece picked up or dropped).
   */
  pileOffset: number;
  cyclePile: (step: 1 | -1) => void;
  /**
   * The station whose full sheet is spread open (benches and other
   * recipe-driven stations). Cleared automatically when the player walks
   * away — the sheet belongs to the cell, not the screen.
   */
  sheetMachine: Machine | undefined;
  openSheet: (machine: Machine) => void;
  closeSheet: () => void;
  /** Open the targeted machine's sheet, or close it if already open. */
  toggleSheet: () => void;
  /**
   * Whether the garage door's destination card is spread open (E at the
   * door). Cleared automatically when the player walks off the door.
   */
  truckMenuOpen: boolean;
  openTruckMenu: () => void;
  closeTruckMenu: () => void;
}

const targetedMachineContext = createContext<TargetedMachineValue | undefined>(
  undefined,
);

const machineKey = (machine: Machine) => machineStateKey(machine.state);

const DIRECTION_VECTORS: Record<Direction, Vector> = {
  0: [1, 0],
  1: [0, -1],
  2: [-1, 0],
  3: [0, 1],
};

/** The center of a machine's occupied cells, in world cell coordinates. */
function machineCenter(machine: Machine): Vector {
  const cells = machine.type.cellsOccupied.map((cell) =>
    translateVec(rotateVec(cell, machine.rotation), machine.position),
  );
  const sum = cells.reduce((acc, c) => [acc[0] + c[0], acc[1] + c[1]]);
  return [sum[0] / cells.length, sum[1] / cells.length];
}

/**
 * The machine the player is most facing: highest alignment between the
 * facing direction and the offset toward each machine's center. Machines
 * sharing the player's own cell (a bench underfoot) score as straight
 * ahead, so they never lose to something behind the player.
 */
function facingIndex(
  machines: readonly Machine[],
  playerCell: Vector,
  direction: Direction,
): number {
  if (machines.length < 2) return 0;
  const facing = DIRECTION_VECTORS[direction];
  let best = 0;
  let bestScore = -Infinity;
  machines.forEach((machine, index) => {
    const [cx, cy] = machineCenter(machine);
    const [dx, dy] = [cx - playerCell[0], cy - playerCell[1]];
    const length = Math.hypot(dx, dy);
    const score = length === 0 ? 1 : (dx * facing[0] + dy * facing[1]) / length;
    if (score > bestScore) {
      bestScore = score;
      best = index;
    }
  });
  return best;
}

/**
 * Tracks which machine on the player's square the keyboard acts on, and
 * which station's full sheet is open.
 *
 * The default target follows the player's facing — turning toward a
 * machine is selecting it, and the in-world highlight shows the choice.
 * X (`cycleTarget`) still steps through the square's machines for the
 * stacked cases facing can't split (a benchtop machine on its table);
 * the manual choice lasts until the player moves or turns.
 */
export const TargetedMachineProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const gameState = useGameState();
  const cellMap = useCellMap();
  const [offset, setOffset] = useState(0);
  const [pileOffset, setPileOffset] = useState(0);
  const [sheetKey, setSheetKey] = useState<string | undefined>(undefined);
  const [truckMenuOpenRaw, setTruckMenuOpen] = useState(false);

  const machines =
    cellMap.at(gameState.player.position)?.operableMachines ?? [];
  const positionKey = vectorKey(gameState.player.position);
  const direction = gameState.player.direction;

  useEffect(() => setOffset(0), [positionKey, direction]);

  // Rummaging starts over from the top of the pile when the set of pieces
  // within reach changes — one grabbed, dropped, or walked away from. Keyed
  // on the pieces themselves rather than the player's cell: reach is
  // continuous now, so crossing a cell line with the same pieces at hand
  // keeps the cursor. Turning in place keeps it too — the pile doesn't
  // care which way the player faces.
  const reachableKey = gameState.materialPiles
    .filter((pile) => pileWithinReach(pile, gameState.player.position))
    .map((pile) => pile.material.id)
    .join("|");
  useEffect(() => setPileOffset(0), [reachableKey]);

  const cyclePile = useCallback(
    (step: 1 | -1) => setPileOffset((i) => i + step),
    [],
  );

  // Climbing in folds the trip card for good — otherwise the stale open
  // flag would spread it again the moment the player steps back out
  // beside the cab after the trip.
  const away = gameState.player.away != null;
  useEffect(() => {
    if (away) setTruckMenuOpen(false);
  }, [away]);

  const defaultIndex = facingIndex(
    machines,
    gameState.player.position,
    direction,
  );
  const machine =
    machines.length > 0
      ? machines[(defaultIndex + offset) % machines.length]
      : undefined;

  const cycleTarget = useCallback(() => setOffset((i) => i + 1), []);

  // The sheet stays open only while its station is still at hand; walking
  // away (or carrying the station off) folds it up.
  const sheetMachine = sheetKey
    ? machines.find((candidate) => machineKey(candidate) === sheetKey)
    : undefined;

  // Folding it up is for good. Once the station is out of reach the key
  // goes with it, so stepping back up to the bench leaves the paperwork
  // where the player left it — closed — until they ask for it again.
  const sheetOutOfReach =
    sheetKey != null &&
    (sheetMachine == null || away || gameState.player.carriedMachine != null);
  useEffect(() => {
    if (sheetOutOfReach) setSheetKey(undefined);
  }, [sheetOutOfReach]);

  const openSheet = useCallback(
    (target: Machine) => setSheetKey(machineKey(target)),
    [],
  );
  const closeSheet = useCallback(() => setSheetKey(undefined), []);

  // The trip card belongs to the cab: walking away from the truck (or
  // leaving the shop) folds it up.
  const atCab =
    !gameState.player.away &&
    atTruckCab(gameState.shopInfo, gameState.player.position);
  const truckMenuOpen = truckMenuOpenRaw && atCab;
  const openTruckMenu = useCallback(() => setTruckMenuOpen(true), []);
  const closeTruckMenu = useCallback(() => setTruckMenuOpen(false), []);

  const value = useMemo(
    () => ({
      machine,
      machines,
      cycleTarget,
      setTarget: (candidate: Machine) => {
        const index = machines.findIndex(
          (m) => machineKey(m) === machineKey(candidate),
        );
        if (index === -1) return;
        const len = machines.length;
        setOffset((((index - defaultIndex) % len) + len) % len);
      },
      isTargeted: (candidate: Machine) =>
        machine != null && machineKey(candidate) === machineKey(machine),
      pileOffset,
      cyclePile,
      sheetMachine,
      openSheet,
      closeSheet,
      toggleSheet: () => {
        if (sheetMachine) {
          setSheetKey(undefined);
        } else if (machine) {
          setSheetKey(machineKey(machine));
        }
      },
      truckMenuOpen,
      openTruckMenu,
      closeTruckMenu,
    }),
    [
      machine,
      machines,
      defaultIndex,
      cycleTarget,
      pileOffset,
      cyclePile,
      sheetMachine,
      openSheet,
      closeSheet,
      truckMenuOpen,
      openTruckMenu,
      closeTruckMenu,
    ],
  );

  return (
    <targetedMachineContext.Provider value={value}>
      {children}
    </targetedMachineContext.Provider>
  );
};

export function useTargetedMachine(): TargetedMachineValue {
  const value = useContext(targetedMachineContext);
  if (!value) {
    throw new Error(
      "useTargetedMachine must be used within a TargetedMachineProvider",
    );
  }
  return value;
}
