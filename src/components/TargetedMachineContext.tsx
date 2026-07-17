import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useCellMap } from "../game/CellMap";
import { Machine } from "../game/Machine";
import { useGameState } from "./useGameState";

interface TargetedMachineValue {
  /** The machine the keyboard actions (E/F/R/Q/Z) act on, if any. */
  machine: Machine | undefined;
  /** Every operable machine on the player's square, in render order. */
  machines: readonly Machine[];
  isTargeted: (machine: Machine) => boolean;
  cycleTarget: () => void;
}

const targetedMachineContext = createContext<TargetedMachineValue | undefined>(
  undefined,
);

const machineKey = (machine: Machine) =>
  `${machine.type.name}@${machine.position.join(",")}`;

/**
 * Tracks which machine on the player's square the keyboard acts on.
 *
 * The shop shortcuts used to hardcode `operableMachines[0]`, which made a
 * second machine on the same square unreachable from the keyboard entirely.
 * The target resets whenever the player moves, so stepping onto a square always
 * starts you on its first machine.
 */
export const TargetedMachineProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const gameState = useGameState();
  const cellMap = useCellMap();
  const [index, setIndex] = useState(0);

  const machines =
    cellMap.at(gameState.player.position)?.operableMachines ?? [];
  const positionKey = gameState.player.position.join(",");

  useEffect(() => setIndex(0), [positionKey]);

  // The machine list can shrink under us (a machine is moved away in the
  // layout editor), so never index past the end.
  const safeIndex = machines.length > 0 ? index % machines.length : 0;
  const machine = machines[safeIndex];

  const cycleTarget = useCallback(() => setIndex((i) => i + 1), []);

  const value = useMemo(
    () => ({
      machine,
      machines,
      cycleTarget,
      isTargeted: (candidate: Machine) =>
        machine != null && machineKey(candidate) === machineKey(machine),
    }),
    [machine, machines, cycleTarget],
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
