import React from "react";
import { useCellMap } from "../useCellMap";
import { canSweepAt } from "../../game/game-actions/dust-actions";
import { canPutDownCarriedMachine } from "../../game/game-actions/machine-actions";
import { canVacuumAt } from "../../game/game-actions/shop-vac-actions";
import { holdingBroom } from "../../game/HeldTool";
import { MACHINE_TYPES } from "../../game/Machine";
import { canisterFillFraction, carryingShopVac } from "../../game/ShopVac";
import { resolveInteract } from "../../game/interact";
import { chebyshevDistance } from "../../game/Vectors";
import { HintList } from "../shortcuts/HintList";
import { ShortcutKeys } from "../shortcuts/Kbd";
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
    chebyshevDistance(gameState.shopVac.position, gameState.player.position) <=
      1;
  const crateUnderfoot =
    gameState.progression.shopLayoutUnlocked && !carried
      ? gameState.machineCrates.find(
          (crate) =>
            chebyshevDistance(crate.position, gameState.player.position) <= 1,
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
    // floor pickups and the resting broom render here; machine and door
    // interactions render at the machine and the door.
    const interact = resolveInteract(gameState, targetedMachine);
    if (interact?.kind === "pick-up-floor") {
      rows.push(
        <li key="pick-up">
          <ShortcutKeys shortcut="pick-up" /> pick up
        </li>,
      );
    }
    if (interact?.kind === "pick-up-broom") {
      rows.push(
        <li key="pick-up-broom">
          <ShortcutKeys shortcut="pick-up" /> pick up broom
        </li>,
      );
    }
    // No chip for putting things down: it followed the player to every
    // cell, which read as a strobe. The hands strip carries the F hint
    // in its slot tooltips, and machines offer their own staging chip.
    if (holdingBroom(gameState) && canSweepAt(gameState)) {
      rows.push(
        <li key="sweep">
          <ShortcutKeys shortcut="operate-machine" /> hold to sweep
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
      <HintList>{rows}</HintList>
    </CellAnchored>
  );
};
