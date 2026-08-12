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
import { explainUnpackRefusal } from "../../game/game-actions/machine-actions";
import {
  broomWithinReach,
  materialSources,
  resolveInteract,
  takeBlockedReason,
} from "../../game/interact";
import { timeSpeed } from "../../game/time-flow";
import { chebyshevDistance } from "../../game/Vectors";
import { HintList, HintRow, ReasonRow } from "../shortcuts/HintList";
import { ShortcutKeys } from "../shortcuts/Kbd";
import { useTargetedMachine } from "../TargetedMachineContext";
import { useGameState } from "../useGameState";
import { CellAnchored, PointAnchored, PointMarker } from "./ShopOverlayLayer";

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

  // Where the pickup chip would land if the hands were free: the top of
  // the reachable ring's floor pieces. The chip still shows there, naming
  // the piece — its verb row just becomes the reason the verb is off.
  const takeBlocked = carried ? null : takeBlockedReason(gameState);
  const blockedPile =
    takeBlocked != null
      ? (materialSources(gameState, targetedMachine, true).find(
          (source) => source.kind === "floor-pile",
        )?.pile ?? null)
      : null;

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
        {/* No name: the machine is on your shoulders, drawn there. */}
        put down
      </HintRow>,
      <HintRow key="rotate" keys={<ShortcutKeys shortcut="carry-rotate" />}>
        rotate
      </HintRow>,
    );
    if (!canPutDownCarriedMachine(gameState)) {
      rows.push(
        <HintRow key="no-room" className="text-store-orange/90">
          no room here
        </HintRow>,
      );
    }
  } else {
    if (crateUnderfoot) {
      // The unpack key wants completely empty hands — offered only when
      // it would work, and the chip says why when it wouldn't.
      const unpackRefusal = explainUnpackRefusal(gameState);
      rows.push(
        unpackRefusal ? (
          <ReasonRow key="unpack">{unpackRefusal}</ReasonRow>
        ) : (
          <HintRow
            key="unpack"
            keys={<ShortcutKeys shortcut="carry-machine" />}
          >
            unpack {MACHINE_TYPES[crateUnderfoot.machine.machineTypeId].name}
          </HintRow>
        ),
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
    } else if (broomWithinReach(gameState)) {
      // The broom wants completely empty hands, a stricter bar than the
      // pickup verbs' — carrying even one board hides the offer, so say
      // why instead of going quiet.
      const broomRefusal = carryingShopVac(gameState)
        ? "set the vac down to take the broom"
        : gameState.player.inventory.length > 0
          ? "empty your hands to take the broom"
          : null;
      if (broomRefusal) {
        rows.push(<ReasonRow key="broom-blocked">{broomRefusal}</ReasonRow>);
      }
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
            hold
          >
            empty
          </HintRow>,
        );
      } else if (panFill >= 1) {
        rows.push(
          <HintRow key="pan-full" className="text-store-orange/90">
            dustpan full — empty at the can
          </HintRow>,
        );
      } else if (canSweepAt(gameState)) {
        rows.push(
          <HintRow
            key="sweep"
            keys={<ShortcutKeys shortcut="operate-machine" />}
            hold
          >
            sweep
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
            hold
          >
            empty
          </HintRow>,
        );
      } else if (fill >= 1) {
        rows.push(
          <HintRow key="vac-full" className="text-store-orange/90">
            canister full — empty at the can
          </HintRow>,
        );
      } else if (canVacuumAt(gameState)) {
        rows.push(
          <HintRow
            key="vacuum"
            keys={<ShortcutKeys shortcut="operate-machine" />}
            hold
          >
            vacuum
          </HintRow>,
        );
      }
      rows.push(
        <HintRow key="set-vac" keys={<ShortcutKeys shortcut="vac-toggle" />}>
          set down · {Math.round(fill * 100)}%
        </HintRow>,
      );
    }
    if (standingOnVac && !draggingVac) {
      // The hose takes a hand — the toggle refuses while the broom's in
      // it, so the chip explains instead of offering a dead key.
      rows.push(
        holdingBroom(gameState) ? (
          <ReasonRow key="grab-vac">
            put the broom down to grab the vac
          </ReasonRow>
        ) : (
          <HintRow key="grab-vac" keys={<ShortcutKeys shortcut="vac-toggle" />}>
            grab vac
          </HintRow>
        ),
      );
    }
    // The wait key earns its chip when there's something to wait *for*:
    // work running (a cure drying) while nobody spends time. Kept up
    // while the key is held, or it would vanish mid-wait.
    const speed = timeSpeed(gameState);
    if (
      (speed === "idle" || speed === "waiting") &&
      gameState.machines.some(
        (m) => m.operationProgress.status === "inProgress",
      )
    ) {
      rows.push(
        <HintRow key="wait" keys={<ShortcutKeys shortcut="wait" />} hold>
          pass time
        </HintRow>,
      );
    }
  }

  return (
    <>
      {/* One handle per in-reach piece, sitting on it — see PointMarker */}
      {interact?.kind === "pick-up-floor" &&
        interact.piles.map((pile) => (
          <PointMarker
            key={`anchor-${pile.material.id}`}
            point={pile.position}
            testId="pile-anchor"
            materialId={pile.material.id}
          />
        ))}
      {interact?.kind === "pick-up-floor" && (
        <PickupChip
          piles={interact.piles}
          target={interact.target}
          sourceCount={materialSources(gameState, targetedMachine).length}
          rotateSettingLive={rotateSettingLive}
        />
      )}
      {/* Blocked hands: the chip still sits on the piece it would take,
          named as usual, with the reason where the verb would be */}
      {blockedPile && takeBlocked && (
        <PointAnchored
          point={blockedPile.position}
          placement="above"
          testId="blocked-pickup-chip"
        >
          <HintList>
            <HintRow className="text-paper-manila/60">
              {getMaterialFullName(blockedPile.material)}
            </HintRow>
            <ReasonRow>{takeBlocked}</ReasonRow>
          </HintList>
        </PointAnchored>
      )}
      {rows.length > 0 && (
        <CellAnchored cell={gameState.player.position}>
          <HintList testId="player-hints">{rows}</HintList>
        </CellAnchored>
      )}
    </>
  );
};

/**
 * The pickup chip sits on the pile it would grab — the same piece wearing
 * the targeting outline on the canvas, wherever it lies (long stock is
 * grabbable along its whole length; the piece underfoot may rest well off
 * to the side). The piece's name titles the chip the way a machine's name
 * titles its own (see MachineChips), leaving the key rows to be verbs; with
 * more pieces within reach it offers R to rummage — unless a machine's
 * rotate setting claims the key (the binding steps aside the same way).
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
    <PointAnchored
      point={target.position}
      placement="above"
      testId="pickup-chip"
    >
      <HintList>
        <HintRow className="text-paper-manila/60">
          {getMaterialFullName(target.material)}
          {place}
        </HintRow>
        <HintRow keys={<ShortcutKeys shortcut="pick-up" />}>pick up</HintRow>
        {sourceCount > 1 && !rotateSettingLive && (
          <HintRow keys={<ShortcutKeys shortcut="cycle-pile" />}>
            next piece
          </HintRow>
        )}
        {/* Right-clicking the pile lays all of it out on a card, but this
            cluster is the keyboard's hints — the mouse verb is taught in
            the `?` sheet, not on a cap floating over the floor. */}
      </HintList>
    </PointAnchored>
  );
};
