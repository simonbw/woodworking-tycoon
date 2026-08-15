import { Machine, machineKey } from "../../game/Machine";
import { MaterialPile } from "../../game/GameState";
import { TargetingState } from "../dispatch/TargetingState";
import { ShellStore } from "../ShellStore";
import { useGame, useShellVersion } from "../useShell";

/**
 * The DOM layer's window onto the TargetingState entity — the successor
 * of the old `useTargetedMachine()` hook, shaped the same so the ported
 * overlay components read it verbatim. Reads come straight off the
 * entity each render (the version subscription keeps renders flowing);
 * the setters bump the ShellStore directly so a click answers on the
 * very next frame instead of waiting for the tick's signature pass.
 */
export interface TargetingValue {
  /** The machine the keyboard actions (E/F/R/Z/X) act on, if any. */
  machine: Machine | undefined;
  /** Every operable machine on the player's square, in render order. */
  machines: readonly Machine[];
  isTargeted: (machine: Machine) => boolean;
  /** How far R has rummaged from the top of the material-source ring. */
  pileOffset: number;
  /** Aim the rummage cursor at one specific piece (mouse path). */
  setPileTarget: (pile: MaterialPile) => void;
  /** The station whose full sheet is spread open, if it's still at hand. */
  sheetMachine: Machine | undefined;
  closeSheet: () => void;
  /** Whether the truck's trip card is spread open (E at the cab). */
  truckMenuOpen: boolean;
  closeTruckMenu: () => void;
  /** Whether the card listing every piece within reach is spread open. */
  floorSheetOpen: boolean;
  closeFloorSheet: () => void;
}

export function useTargeting(): TargetingValue {
  const game = useGame();
  useShellVersion();
  const store = game.entities.getSingleton(ShellStore);
  const targeting = game.entities.getSingleton(TargetingState);

  const machines = targeting.machines();
  const machine = targeting.targeted()?.view();
  const sheetMachine = targeting.sheetMachine()?.view();

  return {
    machine,
    machines,
    isTargeted: (candidate: Machine) =>
      machine != null &&
      machineKey(candidate.state) === machineKey(machine.state),
    pileOffset: targeting.pileOffset,
    setPileTarget: (pile) => {
      targeting.setPileTarget(pile);
      store.bump();
    },
    sheetMachine,
    closeSheet: () => {
      targeting.closeSheet();
      store.bump();
    },
    truckMenuOpen: targeting.truckMenuOpen,
    closeTruckMenu: () => {
      targeting.closeTruckMenu();
      store.bump();
    },
    floorSheetOpen: targeting.floorSheetOpen,
    closeFloorSheet: () => {
      targeting.closeFloorSheet();
      store.bump();
    },
  };
}

/** Whether a DOM modal claims the keyboard (mirrors the modal scope). */
export function useShellModalOpen(): boolean {
  const game = useGame();
  useShellVersion();
  return game.entities.getSingleton(ShellStore).modalOpen;
}
