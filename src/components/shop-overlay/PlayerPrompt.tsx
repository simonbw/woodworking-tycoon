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
import { MACHINE_TYPES } from "../../game/Machine";
import { canisterFillFraction, carryingShopVac } from "../../game/ShopVac";
import { MaterialPile } from "../../game/GameState";
import { getMaterialFullName } from "../../game/material-helpers";
import { liveSettingParameter } from "../../game/machine-helpers";
import { materialSources, resolveInteract } from "../../game/interact";
import { chebyshevDistance } from "../../game/Vectors";
import { HintList, HintRow } from "../shortcuts/HintList";
import { ShortcutKeys } from "../shortcuts/Kbd";
import { useTargetedMachine } from "../TargetedMachineContext";
import { useGameState } from "../useGameState";
import { CellAnchored, PointAnchored } from "./ShopOverlayLayer";

/**
 * The small cluster of key hints that follows the player: verbs aimed at
 * the floor underfoot (pick up, sweep, the shop vac) and the carrying
 * controls while a machine rides the shoulders. Pure hints — the keys do
 * the work — so it never traps the mouse.
 */
export const PlayerPrompt: React.FC = () => {
  const gameState = useGameState();
  const cellMap = useCellMap();
  const { machine: targetedMachine, pileOffset } = useTargetedMachine();

  if (gameState.player.away) return null;

  const carried = gameState.player.carriedMachine ?? null;
  const cell = cellMap.at(gameState.player.position);
  const draggingVac = carryingShopVac(gameState);
  const standingOnVac =
    gameState.shopVac?.position != null &&
    chebyshevDistance(gameState.shopVac.position, gameState.player.position) <=
      1;
  const crateUnderfoot = !carried
    ? gameState.machineCrates.find(
        (crate) =>
          chebyshevDistance(crate.position, gameState.player.position) <= 1,
      )
    : undefined;

  // The E chip belongs to whatever the interact key resolved to — the
  // resting broom renders here at the player; floor pickups render at the
  // pile itself (below); machine and door interactions render at the
  // machine and the door.
  const interact = carried
    ? null
    : resolveInteract(gameState, targetedMachine, pileOffset);

  // Whether R belongs to the targeted machine's rotate setting — the same
  // test the keyboard bindings split the key on, so the rummage hint only
  // shows when R would actually rummage.
  const rotateSettingLive =
    targetedMachine != null &&
    liveSettingParameter(targetedMachine, gameState.progression, "rotate") !=
      null;

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
    // The truck's bed wears its own chips, pinned over the tailgate
    // (TruckBedPrompt) — nothing for the player's cluster to carry there.
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
      {interact?.kind === "pick-up-floor" && (
        <PickupChip
          piles={interact.piles}
          target={interact.target}
          sourceCount={materialSources(gameState, targetedMachine).length}
          rotateSettingLive={rotateSettingLive}
        />
      )}
      {rows.length > 0 && (
        <CellAnchored cell={gameState.player.position}>
          <HintList>{rows}</HintList>
        </CellAnchored>
      )}
    </>
  );
};

/**
 * The pickup chip sits on the pile it would grab — the same piece wearing
 * the targeting outline on the canvas, wherever it lies (long stock is
 * grabbable along its whole length; the piece underfoot may rest well off
 * to the side). It names the piece, and with more of them within reach
 * offers R to rummage — unless a machine's rotate setting claims the key
 * (the binding steps aside the same way).
 */
const PickupChip: React.FC<{
  piles: ReadonlyArray<MaterialPile>;
  target: MaterialPile;
  /** Every material source in reach — the floor's pieces plus a loaded
   * machine's stock — since R steps through them as one ring. */
  sourceCount: number;
  rotateSettingLive: boolean;
}> = ({ piles, target, sourceCount, rotateSettingLive }) => {
  const place =
    piles.length > 1
      ? ` · ${piles.indexOf(target) + 1} of ${piles.length}`
      : "";
  return (
    <PointAnchored point={target.position} placement="above">
      <HintList>
        <HintRow keys={<ShortcutKeys shortcut="pick-up" />}>
          pick up · {getMaterialFullName(target.material)}
          {place}
        </HintRow>
        {sourceCount > 1 && !rotateSettingLive && (
          <HintRow keys={<ShortcutKeys shortcut="cycle-pile" />}>
            next piece
          </HintRow>
        )}
      </HintList>
    </PointAnchored>
  );
};
