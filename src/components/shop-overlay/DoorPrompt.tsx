import React, { useContext } from "react";
import {
  canLeaveShop,
  goToStoreAction,
} from "../../game/game-actions/door-actions";
import { completeCommissionAction } from "../../game/game-actions/store-actions";
import { deliverJobAction } from "../../game/game-actions/marketplace-actions";
import { startScavengingAction } from "../../game/game-actions/scavenge-actions";
import { readyHandoffs } from "../../game/delivery";
import { GameAction } from "../../game/GameState";
import { MACHINE_TYPES } from "../../game/Machine";
import { jobPayout } from "../../game/marketplace";
import { isAtShopDoor } from "../../game/ShopInfo";
import { resolveInteract } from "../../game/interact";
import { ShortcutId } from "../../game/shortcuts";
import { PIXELS_PER_CELL } from "../shop-view/shop-scale";
import { HintList } from "../shortcuts/HintList";
import { Kbd, ShortcutKeys } from "../shortcuts/Kbd";
import { useShortcut } from "../shortcuts/ShortcutProvider";
import { useTargetedMachine } from "../TargetedMachineContext";
import { Tooltip } from "../Tooltip";
import { useApplyGameAction, useGameState } from "../useGameState";
import { OverlayScaleContext } from "./ShopOverlayLayer";

const DOOR_OPTION_SHORTCUTS: readonly ShortcutId[] = [
  "door-option-1",
  "door-option-2",
  "door-option-3",
  "door-option-4",
  "door-option-5",
  "door-option-6",
  "door-option-7",
  "door-option-8",
  "door-option-9",
];

/** One numbered row on the door card. */
interface DoorRow {
  readonly key: string;
  readonly group: "go" | "handoff";
  readonly name: string;
  readonly description: string;
  /** The row's button label — "Go" for a trip, "Hand Over" for work. */
  readonly verb: string;
  readonly action: () => GameAction;
}

/**
 * The garage door: standing at (or beside) the entrance it offers a small
 * hint chip, and the keypress spreads open the door card. Two kinds of row
 * live on it, each answering to its own number:
 *
 * - **Places to go** — the shopping trips and scavenging errands. Listed
 *   first so their numbers never move; Orange Box is always 1.
 * - **Work to hand over** — the active commission and any accepted job
 *   whose deliverables are in the player's hands right now. This is how
 *   finished work leaves the shop; there is no "mark complete" button
 *   anywhere, because a delivery is a thing that happens at a door.
 */
export const DoorPrompt: React.FC<{
  canvasWidth: number;
  canvasHeight: number;
}> = ({ canvasWidth, canvasHeight }) => {
  const gameState = useGameState();
  const applyAction = useApplyGameAction();
  const {
    machine: targetedMachine,
    doorOpen,
    closeDoor,
  } = useTargetedMachine();
  const scale = useContext(OverlayScaleContext);

  const { storeUnlocked, lumberyardUnlocked, marketplaceUnlocked } =
    gameState.progression;
  const carried = gameState.player.carriedMachine ?? null;
  const atDoor =
    !gameState.player.away &&
    isAtShopDoor(gameState.shopInfo, gameState.player.position);
  const handsFree = canLeaveShop(gameState);

  const rows: DoorRow[] = [];
  if (storeUnlocked) {
    rows.push({
      key: "orangeBox",
      group: "go",
      name: "Orange Box",
      description:
        "The big-box store: lumber, tools, machines, and supplies. Takes as long as you spend in the aisles.",
      verb: "Go",
      action: () => goToStoreAction("orangeBox"),
    });
  }
  if (lumberyardUnlocked) {
    rows.push({
      key: "lumberyard",
      group: "go",
      name: "Sawyer & Sons",
      description:
        "The hardwood lumberyard: rough and S2S stock, priced for people who mill their own. Takes as long as you spend in the racks.",
      verb: "Go",
      action: () => goToStoreAction("lumberyard"),
    });
  }
  if (marketplaceUnlocked) {
    rows.push({
      key: "scavenge",
      group: "go",
      name: "Scavenge for pallets",
      description:
        "A couple of hours poking around loading docks. Come back with 1-2 pallets in whatever shape you find them.",
      verb: "Go",
      action: () => startScavengingAction(),
    });
  }

  for (const handoff of readyHandoffs(gameState)) {
    if (handoff.kind === "commission") {
      const { commission } = handoff;
      rows.push({
        key: `commission-${commission.id}`,
        group: "handoff",
        name: commission.name,
        // "For <client>." rather than "<client> is waiting": the client
        // strings are appositives ("Marguerite, two doors down") and read
        // badly with a verb hung straight off them.
        description: `For ${commission.client}. Pays $${commission.rewardMoney.toFixed(2)}.`,
        verb: "Hand Over",
        action: () => completeCommissionAction(),
      });
    } else {
      const { job } = handoff;
      const payout = jobPayout(job, gameState.tick);
      rows.push({
        key: `job-${job.id}`,
        group: "handoff",
        name: job.name,
        description: `Pays $${payout.money.toFixed(2)}, tip included.`,
        verb: "Hand Over",
        action: () => deliverJobAction(job.id),
      });
    }
  }

  // The digits answer to the rows the open card shows. Registered
  // unconditionally (hooks), enabled per row while the card is open.
  for (const [index, shortcutId] of DOOR_OPTION_SHORTCUTS.entries()) {
    const row = rows[index];
    // eslint-disable-next-line react-hooks/rules-of-hooks -- fixed-length list
    useShortcut(
      shortcutId,
      () => row && applyAction(row.action()),
      doorOpen && handsFree && row != null,
    );
  }

  if (!atDoor || rows.length === 0) {
    return null;
  }

  const [doorX, doorY] = gameState.shopInfo.entrancePosition;
  const cellPx = PIXELS_PER_CELL * scale;
  const centerX = (doorX + 0.5) * cellPx;
  const handoffCount = rows.filter((row) => row.group === "handoff").length;
  const mixed = handoffCount > 0 && handoffCount < rows.length;

  // Closed: just the chip, the same weight as every other hint — and
  // only when E would actually open the door (something else in reach
  // may claim the key first).
  if (!doorOpen) {
    const interact = resolveInteract(gameState, targetedMachine);
    if (interact?.kind !== "open-door") {
      return null;
    }
    return (
      <div
        className="absolute z-10"
        style={{
          left: Math.min(Math.max(centerX, 70), canvasWidth - 70),
          top: doorY * cellPx - 4,
          transform: "translate(-50%, -100%)",
        }}
      >
        <HintList>
          <li className="text-paper-manila/60">Garage door</li>
          <li>
            <ShortcutKeys shortcut="pick-up" />{" "}
            {handoffCount > 0 ? "hand off work" : "head out"}
          </li>
        </HintList>
      </div>
    );
  }

  const halfCard = 168;
  const left = Math.min(
    Math.max(centerX, Math.min(halfCard, canvasWidth / 2)),
    Math.max(canvasWidth - halfCard, canvasWidth / 2),
  );
  const roomAbove = doorY * cellPx;
  const above = roomAbove >= canvasHeight - (doorY + 1) * cellPx;

  return (
    <div
      className="absolute z-20 w-[336px] pointer-events-auto"
      style={{
        left,
        top: above ? doorY * cellPx - 8 : (doorY + 1) * cellPx + 8,
        transform: above ? "translate(-50%, -100%)" : "translate(-50%, 0)",
      }}
    >
      <section className="paper-card space-y-2" data-testid="door-panel">
        <header className="flex items-baseline justify-between border-b-2 border-ink-black/40 pb-1">
          <h3 className="font-condensed font-bold text-lg uppercase tracking-wide">
            Garage Door
          </h3>
          <span className="flex items-center gap-3">
            <span className="font-condensed uppercase tracking-[0.2em] text-[0.65rem] text-ink-fade">
              {handoffCount > 0 ? "Someone's waiting" : "Places to go"}
            </span>
            <Tooltip content="Stay in the shop" shortcut="close-sheet">
              <button
                className="button-paper text-xs leading-none"
                onClick={closeDoor}
                aria-label="Close door card"
              >
                ✕
              </button>
            </Tooltip>
          </span>
        </header>
        <ul className="divide-y divide-ink-black/15">
          {rows.map((row, index) => (
            <React.Fragment key={row.key}>
              {/* Subheadings only earn their space when the card is
                  actually mixed — with one kind of row the card header
                  has already said what these are. */}
              {mixed && (index === 0 || rows[index - 1].group !== row.group) && (
                <li className="pt-1.5 font-condensed uppercase tracking-[0.2em] text-[0.6rem] text-ink-fade">
                  {row.group === "go" ? "Places to go" : "Work to hand over"}
                </li>
              )}
              <li className="flex items-center gap-3 py-2">
                <Kbd>{index + 1}</Kbd>
                <div className="grow">
                  <div className="font-condensed font-semibold text-sm uppercase tracking-wide">
                    {row.name}
                  </div>
                  <div className="text-xs text-ink-fade">{row.description}</div>
                </div>
                <Tooltip
                  content={`${row.verb}: ${row.name}`}
                  shortcut={DOOR_OPTION_SHORTCUTS[index]}
                >
                  <button
                    className="button-paper text-xs whitespace-nowrap"
                    disabled={!handsFree}
                    onClick={() => applyAction(row.action())}
                  >
                    {row.verb}
                  </button>
                </Tooltip>
              </li>
            </React.Fragment>
          ))}
        </ul>
        {carried && (
          <p className="font-condensed text-xs text-ink-fade">
            Set the {MACHINE_TYPES[carried.machineTypeId].name} down before
            heading out.
          </p>
        )}
      </section>
    </div>
  );
};
