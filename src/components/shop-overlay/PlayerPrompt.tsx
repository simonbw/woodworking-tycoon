import React from "react";
import { useCellMap } from "../../game/CellMap";
import { canSweepAt } from "../../game/game-actions/dust-actions";
import { canPutDownCarriedMachine } from "../../game/game-actions/machine-actions";
import { canVacuumAt } from "../../game/game-actions/shop-vac-actions";
import { MACHINE_TYPES } from "../../game/Machine";
import { canisterFillFraction, carryingShopVac } from "../../game/ShopVac";
import { resolveInteract } from "../../game/interact";
import { vectorEquals } from "../../game/Vectors";
import { HintSurfaceContext, ShortcutKeys } from "../shortcuts/Kbd";
import { useTargetedMachine } from "../TargetedMachineContext";
import { useGameState } from "../useGameState";
import { CellAnchored } from "./ShopOverlayLayer";

/**
 * The small cluster of key hints that follows the player: verbs aimed at
 * the floor underfoot (pick up, sweep, the shop vac) and the carrying
 * controls while a machine rides the shoulders. Pure hints — the keys do
 * the work — so it never traps the mouse.
 */
export const PlayerPrompt: React.FC = () => {
  const gameState = useGameState();
  const cellMap = useCellMap();
  const { machine: targetedMachine } = useTargetedMachine();

  if (gameState.player.away) return null;

  const carried = gameState.player.carriedMachine ?? null;
  const cell = cellMap.at(gameState.player.position);
  const holding = gameState.player.inventory.length > 0;
  const draggingVac = carryingShopVac(gameState);
  const standingOnVac =
    gameState.shopVac?.position != null &&
    vectorEquals(gameState.shopVac.position, gameState.player.position);
  const crateUnderfoot =
    gameState.progression.shopLayoutUnlocked && !carried
      ? gameState.machineCrates.find((crate) =>
          vectorEquals(crate.position, gameState.player.position),
        )
      : undefined;

  const rows: React.ReactNode[] = [];

  if (carried) {
    rows.push(
      <li key="put-down-machine">
        <ShortcutKeys shortcut="carry-machine" /> put down{" "}
        {MACHINE_TYPES[carried.machineTypeId].name}
      </li>,
      <li key="rotate">
        <ShortcutKeys shortcut="carry-rotate" /> rotate
      </li>,
    );
    if (!canPutDownCarriedMachine(gameState)) {
      rows.push(
        <li key="no-room" className="text-store-orange/90">
          no room to set it down here
        </li>,
      );
    }
  } else {
    if (crateUnderfoot) {
      rows.push(
        <li key="unpack">
          <ShortcutKeys shortcut="carry-machine" /> unpack{" "}
          {MACHINE_TYPES[crateUnderfoot.machine.machineTypeId].name}
        </li>,
      );
    }
    // The E chip belongs to whatever the interact key resolved to —
    // floor pickups render here; machine and door interactions render
    // at the machine and the door.
    if (resolveInteract(gameState, targetedMachine)?.kind === "pick-up-floor") {
      rows.push(
        <li key="pick-up">
          <ShortcutKeys shortcut="pick-up" /> pick up
        </li>,
      );
    }
    if (holding && !targetedMachine) {
      rows.push(
        <li key="drop">
          <ShortcutKeys shortcut="put-down" /> put down
        </li>,
      );
    }
    if (
      gameState.progression.sweepingUnlocked &&
      !draggingVac &&
      canSweepAt(gameState)
    ) {
      rows.push(
        <li key="sweep">
          <ShortcutKeys shortcut="sweep" /> sweep sawdust
        </li>,
      );
    }
    if (draggingVac && canVacuumAt(gameState)) {
      rows.push(
        <li key="vacuum">
          <ShortcutKeys shortcut="sweep" /> vacuum
        </li>,
      );
    }
    if (standingOnVac && !draggingVac) {
      rows.push(
        <li key="grab-vac">
          <ShortcutKeys shortcut="vac-toggle" /> grab shop vac
        </li>,
      );
    }
    if (draggingVac) {
      const fill = canisterFillFraction(gameState.shopVac!);
      rows.push(
        <li key="set-vac">
          <ShortcutKeys shortcut="vac-toggle" /> set down vac ·{" "}
          {Math.round(fill * 100)}%
          {fill >= 1 && " — empty it at the garbage can"}
        </li>,
      );
    }
  }

  if (rows.length === 0) return null;

  return (
    <CellAnchored cell={gameState.player.position}>
      <HintSurfaceContext.Provider value="chrome">
        <ul className="flex flex-col items-center gap-0.5 rounded bg-ink-black/70 px-2 py-1 text-center font-condensed text-[0.65rem] uppercase tracking-[0.1em] text-paper-manila/90 whitespace-nowrap">
          {rows}
        </ul>
      </HintSurfaceContext.Provider>
    </CellAnchored>
  );
};
