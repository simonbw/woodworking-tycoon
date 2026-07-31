import React, { useContext, useEffect, useState } from "react";
import {
  canLeaveShop,
  goToStoreAction,
} from "../../game/game-actions/door-actions";
import { completeCommissionAction } from "../../game/game-actions/store-actions";
import { deliverJobAction } from "../../game/game-actions/marketplace-actions";
import { startScavengingAction } from "../../game/game-actions/scavenge-actions";
import { readyHandoffs } from "../../game/delivery";
import { GameAction } from "../../game/GameState";
import {
  atTruckBed,
  atTruckCab,
  truckBedRect,
  truckCabRect,
} from "../../game/lot";
import { MACHINE_TYPES } from "../../game/Machine";
import { jobPayout } from "../../game/marketplace";
import { formatMoney } from "../../utils/formatNumber";
import { resolveInteract } from "../../game/interact";
import { ShortcutId } from "../../game/shortcuts";
import { classNames } from "../../utils/classNames";
import { mod } from "../../utils/mathUtils";
import { PIXELS_PER_CELL } from "../shop-view/shop-scale";
import { HintList, HintRow } from "../shortcuts/HintList";
import { Kbd, ShortcutKeys } from "../shortcuts/Kbd";
import { useShortcut } from "../shortcuts/ShortcutProvider";
import { useTargetedMachine } from "../TargetedMachineContext";
import { Tooltip } from "../Tooltip";
import { useApplyGameAction, useGameState } from "../useGameState";
import { useTruckStage } from "../shop-view/truckStageStore";
import { OverlayScaleContext } from "./ShopOverlayLayer";

const TRUCK_OPTION_SHORTCUTS: readonly ShortcutId[] = [
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

/** One numbered row on the cab's card. */
interface TruckRow {
  readonly key: string;
  readonly group: "go" | "handoff";
  readonly name: string;
  readonly description: string;
  /** The row's button label — "Go" for a trip, "Deliver" for work. */
  readonly verb: string;
  readonly action: () => GameAction;
}

/**
 * The bed's own hint chips, pinned over the tailgate end of the truck
 * the way a machine wears its chips — they stay put while the player
 * works along the rails. Stock lifts out with E, what's in hand goes in
 * with F, and a crated machine hoists onto the shoulders like any
 * shop-floor crate.
 */
export const TruckBedPrompt: React.FC<{ canvasWidth: number }> = ({
  canvasWidth,
}) => {
  const gameState = useGameState();
  const { machine: targetedMachine } = useTargetedMachine();
  const scale = useContext(OverlayScaleContext);
  const truckStage = useTruckStage();

  if (
    gameState.player.away ||
    truckStage !== "parked" ||
    gameState.player.carriedMachine != null ||
    !atTruckBed(gameState.shopInfo, gameState.player.position)
  ) {
    return null;
  }

  const interact = resolveInteract(gameState, targetedMachine);
  const holding = gameState.player.inventory.length > 0;

  const rows: React.ReactNode[] = [];
  if (interact?.kind === "truck-bed") {
    rows.push(
      <HintRow key="take" keys={<ShortcutKeys shortcut="pick-up" />}>
        take from bed ({interact.count})
      </HintRow>,
    );
  }
  if (holding) {
    rows.push(
      <HintRow key="place" keys={<ShortcutKeys shortcut="put-down" />}>
        place in bed
      </HintRow>,
    );
  }
  if (gameState.truck.crates.length > 0 && !holding) {
    rows.push(
      <HintRow key="unpack" keys={<ShortcutKeys shortcut="carry-machine" />}>
        unpack {MACHINE_TYPES[gameState.truck.crates[0].machineTypeId].name}
      </HintRow>,
    );
  }
  if (rows.length === 0) {
    return null;
  }

  const bed = truckBedRect(gameState.shopInfo);
  const cellPx = PIXELS_PER_CELL * scale;
  const centerX = ((bed.min[0] + bed.max[0]) / 2) * cellPx;
  return (
    <div
      className="absolute z-10"
      style={{
        left: Math.min(Math.max(centerX, 70), canvasWidth - 70),
        top: bed.min[1] * cellPx - 4,
        transform: "translate(-50%, -100%)",
      }}
    >
      <HintList>
        <HintRow className="text-paper-manila/60">The bed</HintRow>
        {rows}
      </HintList>
    </div>
  );
};

/**
 * The truck's cab: standing at it offers a small hint chip, and the
 * keypress spreads open the trip card. Two kinds of row live on it, each
 * answering to its own number:
 *
 * - **Places to go** — the shopping trips and scavenging errands. Listed
 *   first so their numbers never move; Orange Box is always 1.
 * - **Work to deliver** — the active commission and any accepted job
 *   whose deliverables are loaded in the bed right now. This is how
 *   finished work leaves the shop; there is no "mark complete" button
 *   anywhere, because a delivery is a drive somebody takes.
 */
export const TruckPrompt: React.FC<{
  canvasWidth: number;
  canvasHeight: number;
}> = ({ canvasWidth }) => {
  const gameState = useGameState();
  const applyAction = useApplyGameAction();
  const {
    machine: targetedMachine,
    truckMenuOpen,
    closeTruckMenu,
  } = useTargetedMachine();
  const scale = useContext(OverlayScaleContext);

  const { storeUnlocked, lumberyardUnlocked } = gameState.progression;
  const carried = gameState.player.carriedMachine ?? null;
  // No chip, no card until the truck is actually sitting there — during
  // the arrival roll the player is still inside it.
  const truckStage = useTruckStage();
  const atCab =
    !gameState.player.away &&
    truckStage === "parked" &&
    atTruckCab(gameState.shopInfo, gameState.player.position);
  const handsFree = canLeaveShop(gameState);

  const rows: TruckRow[] = [];
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
  // Scavenging is on offer from day one — it's how the first pallet
  // gets into the shop.
  rows.push({
    key: "scavenge",
    group: "go",
    name: "Scavenge for pallets",
    description:
      "A couple of hours poking around loading docks. Come back with 1-2 pallets in whatever shape you find them.",
    verb: "Go",
    action: () => startScavengingAction(),
  });

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
        description: `For ${commission.client}. Pays ${formatMoney(commission.rewardMoney)}.`,
        verb: "Deliver",
        action: () => completeCommissionAction(),
      });
    } else {
      const { job } = handoff;
      const payout = jobPayout(job, gameState.tick);
      rows.push({
        key: `job-${job.id}`,
        group: "handoff",
        name: job.name,
        description: `Pays ${formatMoney(payout.money)}, tip included.`,
        verb: "Deliver",
        action: () => deliverJobAction(job.id),
      });
    }
  }

  // The digits answer to the rows the open card shows. Registered
  // unconditionally (hooks), enabled per row while the card is open.
  for (const [index, shortcutId] of TRUCK_OPTION_SHORTCUTS.entries()) {
    const row = rows[index];
    // eslint-disable-next-line react-hooks/rules-of-hooks -- fixed-length list
    useShortcut(
      shortcutId,
      () => row && applyAction(row.action()),
      truckMenuOpen && handsFree && row != null,
    );
  }

  // The card's row cursor: W/S walk it, E takes the row it's on. The raw
  // index is unbounded and `mod` folds it onto whatever rows the card
  // currently shows, so the cursor survives the list changing under it
  // (a delivery leaving the card). Starts back at the top each time the
  // card spreads open.
  const [cursor, setCursor] = useState(0);
  useEffect(() => {
    if (truckMenuOpen) setCursor(0);
  }, [truckMenuOpen]);
  const selectedIndex = rows.length > 0 ? mod(cursor, rows.length) : 0;
  useShortcut(
    "panel-up",
    () => setCursor(selectedIndex - 1),
    truckMenuOpen && rows.length > 0,
  );
  useShortcut(
    "panel-down",
    () => setCursor(selectedIndex + 1),
    truckMenuOpen && rows.length > 0,
  );
  // With full hands nothing on the card can run, so the binding steps
  // aside and E falls through to the interact key, which folds the card.
  useShortcut(
    "panel-accept",
    () => {
      const row = rows[selectedIndex];
      if (row) applyAction(row.action());
    },
    truckMenuOpen && handsFree && rows.length > 0,
  );

  if (!atCab || rows.length === 0) {
    return null;
  }

  const cab = truckCabRect(gameState.shopInfo);
  const cellPx = PIXELS_PER_CELL * scale;
  const centerX = ((cab.min[0] + cab.max[0]) / 2) * cellPx;
  const cabTop = cab.min[1] * cellPx;
  const handoffCount = rows.filter((row) => row.group === "handoff").length;
  const mixed = handoffCount > 0 && handoffCount < rows.length;

  // Closed: just the chip, the same weight as every other hint — and
  // only when E would actually open the cab (something else in reach
  // may claim the key first).
  if (!truckMenuOpen) {
    const interact = resolveInteract(gameState, targetedMachine);
    if (interact?.kind !== "truck-cab") {
      return null;
    }
    return (
      <div
        className="absolute z-10"
        style={{
          left: Math.min(Math.max(centerX, 70), canvasWidth - 70),
          top: cabTop - 4,
          transform: "translate(-50%, -100%)",
        }}
      >
        <HintList>
          <HintRow className="text-paper-manila/60">The truck</HintRow>
          <HintRow keys={<ShortcutKeys shortcut="pick-up" />}>
            {handoffCount > 0 ? "deliver work" : "head out"}
          </HintRow>
        </HintList>
      </div>
    );
  }

  const halfCard = 168;
  const left = Math.min(
    Math.max(centerX, Math.min(halfCard, canvasWidth / 2)),
    Math.max(canvasWidth - halfCard, canvasWidth / 2),
  );

  return (
    <div
      className="absolute z-20 w-[336px] pointer-events-auto"
      style={{
        left,
        // The cab sits at the bottom of the scrolled view, so the card
        // always hangs above it
        top: cabTop - 8,
        transform: "translate(-50%, -100%)",
      }}
    >
      <section className="paper-card space-y-2" data-testid="truck-panel">
        <header className="flex items-baseline justify-between border-b-2 border-ink-black/40 pb-1">
          <h3 className="font-condensed font-bold text-lg uppercase tracking-wide">
            The Truck
          </h3>
          <span className="flex items-center gap-3">
            <span className="font-condensed uppercase tracking-[0.2em] text-[0.65rem] text-ink-fade">
              {handoffCount > 0 ? "Someone's waiting" : "Places to go"}
            </span>
            <Tooltip content="Stay in the shop" shortcut="close-sheet">
              <button
                className="button-paper text-xs leading-none"
                onClick={closeTruckMenu}
                aria-label="Close truck card"
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
                  {row.group === "go" ? "Places to go" : "Work to deliver"}
                </li>
              )}
              <li
                className={classNames(
                  "flex items-center gap-3 py-2 pl-1.5 border-l-2",
                  index === selectedIndex
                    ? "border-ink-blue bg-ink-blue/10"
                    : "border-transparent",
                )}
                data-selected={index === selectedIndex || undefined}
                onMouseEnter={() => setCursor(index)}
              >
                <Kbd>{index + 1}</Kbd>
                <div className="grow">
                  <div className="font-condensed font-semibold text-sm uppercase tracking-wide">
                    {row.name}
                  </div>
                  <div className="text-xs text-ink-fade">{row.description}</div>
                </div>
                <Tooltip
                  content={`${row.verb}: ${row.name}`}
                  shortcut={TRUCK_OPTION_SHORTCUTS[index]}
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
        <p className="flex items-center gap-1.5 border-t border-ink-black/15 pt-1.5 font-condensed uppercase tracking-[0.2em] text-[0.6rem] text-ink-fade">
          <Kbd>W</Kbd>
          <Kbd>S</Kbd> choose
          <span className="px-0.5">·</span>
          <Kbd>E</Kbd> {rows[selectedIndex].verb.toLowerCase()}
        </p>
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
