import React from "react";
import { useCellMap } from "../useCellMap";
import {
  canSweepAt,
  dustpanFillFraction,
  nextToGarbageCan,
} from "../../game/game-actions/dust-actions";
import { canPutDownCarriedMachine } from "../../game/game-actions/machine-actions";
import { canVacuumAt } from "../../game/game-actions/shop-vac-actions";
import { holdingBroom } from "../../game/HeldTool";
import { atTruckBed } from "../../game/lot";
import { MACHINE_TYPES } from "../../game/Machine";
import { canisterFillFraction, carryingShopVac } from "../../game/ShopVac";
import { resolveInteract } from "../../game/interact";
import { chebyshevDistance } from "../../game/Vectors";
import { HintList, HintRow } from "../shortcuts/HintList";
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

  // The E chip belongs to whatever the interact key resolved to — the
  // resting broom renders here at the player; floor pickups render at the
  // pile itself (below); machine and door interactions render at the
  // machine and the door.
  const interact = carried ? null : resolveInteract(gameState, targetedMachine);

  const rows: React.ReactNode[] = [];

  if (carried) {
    rows.push(
      <HintRow
        key="put-down-machine"
        keys={<ShortcutKeys shortcut="carry-machine" />}
      >
        put down {MACHINE_TYPES[carried.machineTypeId].name}
      </HintRow>,
      <HintRow key="rotate" keys={<ShortcutKeys shortcut="carry-rotate" />}>
        rotate
      </HintRow>,
    );
    if (!canPutDownCarriedMachine(gameState)) {
      rows.push(
        <HintRow key="no-room" className="text-store-orange/90">
          no room to set it down here
        </HintRow>,
      );
    }
  } else {
    if (crateUnderfoot) {
      rows.push(
        <HintRow key="unpack" keys={<ShortcutKeys shortcut="carry-machine" />}>
          unpack {MACHINE_TYPES[crateUnderfoot.machine.machineTypeId].name}
        </HintRow>,
      );
    }
    // The truck's bed offers its verbs to whoever stands at the rail:
    // stock lifts out with E, what's in hand loads with F, and a crated
    // machine hoists onto the shoulders like any shop-floor crate.
    const atBed = atTruckBed(gameState.shopInfo, gameState.player.position);
    if (atBed && interact?.kind === "truck-bed") {
      rows.push(
        <HintRow key="unload-bed" keys={<ShortcutKeys shortcut="pick-up" />}>
          unload bed ({interact.count})
        </HintRow>,
      );
    }
    if (atBed && holding) {
      rows.push(
        <HintRow key="load-bed" keys={<ShortcutKeys shortcut="put-down" />}>
          load into bed
        </HintRow>,
      );
    }
    if (
      atBed &&
      gameState.progression.shopLayoutUnlocked &&
      gameState.truck.crates.length > 0 &&
      !holding
    ) {
      rows.push(
        <HintRow
          key="unpack-bed-crate"
          keys={<ShortcutKeys shortcut="carry-machine" />}
        >
          unpack {MACHINE_TYPES[gameState.truck.crates[0].machineTypeId].name}
        </HintRow>,
      );
    }
    if (interact?.kind === "pick-up-broom") {
      rows.push(
        <HintRow key="pick-up-broom" keys={<ShortcutKeys shortcut="pick-up" />}>
          pick up broom
        </HintRow>,
      );
    }
    // No chip for putting things down: it followed the player to every
    // cell, which read as a strobe. The hands strip carries the F hint
    // in its slot tooltips, and machines offer their own staging chip.
    if (holdingBroom(gameState)) {
      const panFill = dustpanFillFraction(gameState);
      const atTheCan = nextToGarbageCan(gameState, gameState.player.position);
      if (atTheCan && panFill > 0) {
        rows.push(
          <HintRow
            key="empty-pan"
            keys={<ShortcutKeys shortcut="operate-machine" />}
          >
            hold to empty
          </HintRow>,
        );
      } else if (panFill >= 1) {
        rows.push(
          <HintRow key="pan-full" className="text-store-orange/90">
            dustpan full — empty it at the garbage can
          </HintRow>,
        );
      } else if (canSweepAt(gameState)) {
        rows.push(
          <HintRow
            key="sweep"
            keys={<ShortcutKeys shortcut="operate-machine" />}
          >
            hold to sweep
          </HintRow>,
        );
      }
    }
    if (draggingVac) {
      const fill = canisterFillFraction(gameState.shopVac!);
      const atTheCan = nextToGarbageCan(gameState, gameState.player.position);
      if (atTheCan && fill > 0) {
        rows.push(
          <HintRow
            key="empty-vac"
            keys={<ShortcutKeys shortcut="operate-machine" />}
          >
            hold to empty
          </HintRow>,
        );
      } else if (fill >= 1) {
        rows.push(
          <HintRow key="vac-full" className="text-store-orange/90">
            canister full — empty it at the garbage can
          </HintRow>,
        );
      } else if (canVacuumAt(gameState)) {
        rows.push(
          <HintRow
            key="vacuum"
            keys={<ShortcutKeys shortcut="operate-machine" />}
          >
            hold to vacuum
          </HintRow>,
        );
      }
      rows.push(
        <HintRow key="set-vac" keys={<ShortcutKeys shortcut="vac-toggle" />}>
          set down vac · {Math.round(fill * 100)}%
        </HintRow>,
      );
    }
    if (standingOnVac && !draggingVac) {
      rows.push(
        <HintRow key="grab-vac" keys={<ShortcutKeys shortcut="vac-toggle" />}>
          grab shop vac
        </HintRow>,
      );
    }
  }

  return (
    <>
      {/* The pickup chip sits on the pile it would grab — the same piece
          wearing the targeting outline on the canvas, wherever its anchor
          cell is (long stock overhangs; the piece underfoot may live on a
          neighbor cell). */}
      {interact?.kind === "pick-up-floor" && (
        <CellAnchored cell={interact.piles[0].position} placement="above">
          <HintList>
            <HintRow keys={<ShortcutKeys shortcut="pick-up" />}>
              pick up
            </HintRow>
          </HintList>
        </CellAnchored>
      )}
      {rows.length > 0 && (
        <CellAnchored cell={gameState.player.position}>
          <HintList>{rows}</HintList>
        </CellAnchored>
      )}
    </>
  );
};
