import React, {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { canLeaveShop } from "../../../sim/commands/trip-commands";
import { startScavenging } from "../../../sim/commands/trip-commands";
import { driveToStore } from "../../scenes/venue";
import { goHome } from "../../../sim/commands/day-commands";
import { isNight } from "../../../game/time-flow";
import {
  atTruckBed,
  atTruckCab,
  truckBedRect,
  truckCabRect,
} from "../../../game/lot";
import { MACHINE_TYPES } from "../../../game/Machine";
import { explainUnpackRefusal } from "../../../sim/commands/machine-commands";
import {
  interactLabel,
  resolveInteract,
  takeBlockedReason,
} from "../../../game/interact";
import { ShortcutId } from "../../../game/shortcuts";
import { classNames } from "../../../utils/classNames";
import { mod } from "../../../utils/mathUtils";
import { PIXELS_PER_CELL } from "../../../views/shop-scale";
import {
  HintList,
  HintRow,
  ReasonRow,
} from "../../../components/shortcuts/HintList";
import { Kbd, ShortcutKeys } from "../../../components/shortcuts/Kbd";
import { useShortcut } from "../../../components/shortcuts/ShortcutProvider";
import { Tooltip } from "../../../components/Tooltip";
import { useGame, useShopState } from "../../useShell";
import { useShellModalOpen, useTargeting } from "../useTargeting";
import { OverlayFrameContext } from "./OverlayLayer";

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

/** How much air the trip card keeps between itself and the window edge. */
const CARD_MARGIN = 8;

/** One numbered row on the cab's card. */
interface TruckRow {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly verb: string;
  readonly go: () => void;
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
  const gameState = useShopState();
  const { machine: targetedMachine } = useTargeting();
  const frame = useContext(OverlayFrameContext);

  if (
    gameState.player.away ||
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
      // Named by the shared resolver, so the chip and the outlined piece
      // in the bed always agree about what E lifts out.
      <HintRow key="take" keys={<ShortcutKeys shortcut="pick-up" />}>
        {interactLabel(interact)}
        {interact.count > 1 && ` (${interact.count})`}
      </HintRow>,
    );
  } else if (gameState.truck.bed.length > 0) {
    // Cargo in the bed but the hands can't lift it out — say why
    // instead of letting the chip go quiet about it.
    const takeBlocked = takeBlockedReason(gameState);
    if (takeBlocked) {
      rows.push(<ReasonRow key="take-blocked">{takeBlocked}</ReasonRow>);
    }
  }
  if (holding) {
    rows.push(
      // Just the verb: the hands strip already names what's in hand, and
      // the chip's own title says where it's going.
      <HintRow key="place" keys={<ShortcutKeys shortcut="put-down" />}>
        load
      </HintRow>,
    );
  }
  if (gameState.truck.crates.length > 0) {
    // Same bar as the shop-floor crate: unpacking wants completely empty
    // hands, and the chip says so rather than dropping the row.
    const unpackRefusal = explainUnpackRefusal(gameState);
    rows.push(
      unpackRefusal ? (
        <ReasonRow key="unpack">{unpackRefusal}</ReasonRow>
      ) : (
        <HintRow key="unpack" keys={<ShortcutKeys shortcut="carry-machine" />}>
          unpack {MACHINE_TYPES[gameState.truck.crates[0].machineTypeId].name}
        </HintRow>
      ),
    );
  }
  if (rows.length === 0) {
    return null;
  }

  const bed = truckBedRect(gameState.shopInfo);
  const cellPx = PIXELS_PER_CELL * frame.scale;
  const centerX = frame.origin[0] + ((bed.min[0] + bed.max[0]) / 2) * cellPx;
  return (
    <div
      className="absolute z-10"
      style={{
        left: Math.min(Math.max(centerX, 70), canvasWidth - 70),
        top: frame.origin[1] + bed.min[1] * cellPx - 4,
        transform: "translate(-50%, -100%)",
      }}
    >
      <HintList testId="truck-bed-chips">
        <HintRow className="text-paper-manila/60">Truck Bed</HintRow>
        {rows}
      </HintList>
    </div>
  );
};

/**
 * The truck's cab: standing at it offers a small hint chip, and the
 * keypress spreads open the trip card — the places to go, one row per
 * destination, each answering to its own number. Orange Box is always 1.
 *
 * The rows fire the trip commands directly (the store legs' drive
 * minutes and the away-side venues are phase 6 — see MIGRATION.md).
 */
export const TruckPrompt: React.FC<{
  canvasWidth: number;
  canvasHeight: number;
}> = ({ canvasWidth, canvasHeight }) => {
  const game = useGame();
  const gameState = useShopState();
  const {
    machine: targetedMachine,
    truckMenuOpen,
    closeTruckMenu,
  } = useTargeting();
  const frame = useContext(OverlayFrameContext);
  // A DOM modal owns the keyboard: the card's own bindings stand down
  // (this root's ShortcutProvider never hosts the modals, so the modal
  // scope is mirrored through the ShellStore instead).
  const modalOpen = useShellModalOpen();

  const { storeUnlocked, lumberyardUnlocked } = gameState.progression;
  const carried = gameState.player.carriedMachine ?? null;
  const atCab =
    !gameState.player.away &&
    atTruckCab(gameState.shopInfo, gameState.player.position);
  const handsFree = canLeaveShop(gameState);

  // After close the errands are done for the day — the only place left
  // to go is home, so the other destinations step off the card.
  const night = isNight(gameState);

  const rows: TruckRow[] = [];
  if (storeUnlocked && !night) {
    rows.push({
      key: "orangeBox",
      name: "Orange Box",
      description:
        "The big-box store: lumber, tools, machines, and supplies. Takes as long as you spend in the aisles.",
      verb: "Go",
      go: () => driveToStore(game, "orangeBox"),
    });
  }
  if (lumberyardUnlocked && !night) {
    rows.push({
      key: "lumberyard",
      name: "Sawyer & Sons",
      description:
        "The hardwood lumberyard: rough and S2S stock, priced for people who mill their own. Takes as long as you spend in the racks.",
      verb: "Go",
      go: () => driveToStore(game, "lumberyard"),
    });
  }
  // Scavenging is on offer from day one — it's how the first pallet
  // gets into the shop.
  if (!night) {
    rows.push({
      key: "scavenge",
      name: "Scavenge for pallets",
      description:
        "The loading-dock circuit, half an hour a stop. Head back whenever the bed looks good enough.",
      verb: "Go",
      go: () => startScavenging(game),
    });
  }
  // Home closes out the card the way it closes out the day. Anything
  // still curing finishes overnight; the day's unspent hours don't
  // carry over.
  rows.push({
    key: "home",
    name: "Home",
    description: night
      ? "Call it a night. Anything still curing is dry by morning."
      : "Call it a day early. Anything still curing is dry by morning.",
    verb: "Go",
    go: () => goHome(game),
  });

  // The digits answer to the rows the open card shows. Registered
  // unconditionally (hooks), enabled per row while the card is open.
  for (const [index, shortcutId] of TRUCK_OPTION_SHORTCUTS.entries()) {
    const row = rows[index];
    // eslint-disable-next-line react-hooks/rules-of-hooks -- fixed-length list
    useShortcut(
      shortcutId,
      () => row?.go(),
      truckMenuOpen && handsFree && !modalOpen && row != null,
    );
  }

  // The card hangs above the cab, and with every destination unlocked
  // it's taller than the room the camera leaves above the truck — so it
  // slides down off its anchor by however much of it is off-screen.
  // Written straight to the node (React styles the anchor, this wrapper
  // is only ever the nudge) and re-checked each frame, since the camera
  // keeps moving under an open card.
  const nudgeRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!truckMenuOpen) return;
    let nudge = 0;
    let animationFrame = 0;
    const clamp = () => {
      const card = nudgeRef.current;
      if (card) {
        // The measured top already includes the current nudge, so the
        // correction is exact and settles in a single frame.
        const next = Math.max(
          0,
          nudge + (CARD_MARGIN - card.getBoundingClientRect().top),
        );
        if (next !== nudge) {
          nudge = next;
          card.style.transform = `translateY(${nudge}px)`;
        }
      }
      animationFrame = requestAnimationFrame(clamp);
    };
    clamp();
    return () => cancelAnimationFrame(animationFrame);
  }, [truckMenuOpen]);

  // The card's row cursor: W/S walk it, E takes the row it's on. The raw
  // index is unbounded and `mod` folds it onto whatever rows the card
  // currently shows, so the cursor survives the list changing under it
  // (a destination stepping off at close). Starts back at the top each
  // time the card spreads open.
  const [cursor, setCursor] = useState(0);
  useEffect(() => {
    if (truckMenuOpen) setCursor(0);
  }, [truckMenuOpen]);
  const selectedIndex = rows.length > 0 ? mod(cursor, rows.length) : 0;
  useShortcut(
    "panel-up",
    () => setCursor(selectedIndex - 1),
    truckMenuOpen && !modalOpen && rows.length > 0,
  );
  useShortcut(
    "panel-down",
    () => setCursor(selectedIndex + 1),
    truckMenuOpen && !modalOpen && rows.length > 0,
  );
  // With full hands nothing on the card can run, so the binding steps
  // aside and E falls through to the interact key, which folds the card
  // (the engine dispatcher's pick-up handles that side).
  useShortcut(
    "panel-accept",
    () => rows[selectedIndex]?.go(),
    truckMenuOpen && handsFree && !modalOpen && rows.length > 0,
  );

  if (!atCab || rows.length === 0) {
    return null;
  }

  const cab = truckCabRect(gameState.shopInfo);
  const cellPx = PIXELS_PER_CELL * frame.scale;
  const centerX = frame.origin[0] + ((cab.min[0] + cab.max[0]) / 2) * cellPx;
  const cabTop = frame.origin[1] + cab.min[1] * cellPx;
  // Closed: just the chip, the same weight as every other hint — and
  // only when E would actually open the cab (something else in reach
  // may claim the key first). With a machine on the shoulders nothing
  // resolves at all, so the chip carries the reason instead: the card's
  // own "set it down first" advice, brought out where it can be read.
  if (!truckMenuOpen) {
    const interact = resolveInteract(gameState, targetedMachine);
    if (interact?.kind !== "truck-cab" && !carried) {
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
        <HintList testId="truck-cab-chips">
          <HintRow className="text-paper-manila/60">The truck</HintRow>
          {carried ? (
            <ReasonRow>
              set the {MACHINE_TYPES[carried.machineTypeId].name} down to head
              out
            </ReasonRow>
          ) : (
            <HintRow keys={<ShortcutKeys shortcut="pick-up" />}>
              head out
            </HintRow>
          )}
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
        top: cabTop - CARD_MARGIN,
        transform: "translate(-50%, -100%)",
      }}
    >
      <div ref={nudgeRef}>
        <section
          className="paper-card flex flex-col gap-2 overflow-hidden"
          style={{ maxHeight: canvasHeight - CARD_MARGIN * 2 }}
          data-testid="truck-panel"
        >
          <header className="flex shrink-0 items-baseline justify-between border-b-2 border-ink-black/40 pb-1">
            <h3 className="font-condensed font-bold text-lg uppercase tracking-wide">
              The Truck
            </h3>
            <span className="flex items-center gap-3">
              <span className="font-condensed uppercase tracking-[0.2em] text-[0.65rem] text-ink-fade">
                Places to go
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
          {/* The whole row is the button — a row you can walk a cursor onto
            and press E on is already a control, so a second "Go" button
            beside it was only ever restating the row. */}
          <ul className="min-h-0 space-y-0.5 overflow-y-auto">
            {rows.map((row, index) => (
              <React.Fragment key={row.key}>
                <li
                  data-selected={index === selectedIndex || undefined}
                  // Pointing at a row selects it even when the button under
                  // the cursor is dead (hands full), so the card still
                  // answers the mouse while it can't act on it.
                  onMouseEnter={() => setCursor(index)}
                >
                  <button
                    type="button"
                    className={classNames(
                      "flex w-full items-start gap-2.5 rounded-sm py-2 pl-2 pr-2.5 text-left",
                      "border-l-2 transition-colors",
                      index === selectedIndex
                        ? "border-ink-blue bg-ink-blue/10"
                        : "border-transparent hover:bg-ink-black/[0.06]",
                      !handsFree && "opacity-50",
                    )}
                    aria-label={`${row.verb}: ${row.name}`}
                    disabled={!handsFree}
                    onClick={() => row.go()}
                  >
                    <Kbd className="mt-px shrink-0">{index + 1}</Kbd>
                    <span className="grow">
                      <span className="block font-condensed font-semibold text-sm uppercase tracking-wide">
                        {row.name}
                      </span>
                      <span className="block text-xs text-ink-fade">
                        {row.description}
                      </span>
                    </span>
                    {/* The affordance the button used to spell out: a
                      quiet chevron that lights up on the selected row. */}
                    <span
                      aria-hidden
                      className={classNames(
                        "shrink-0 self-center text-base leading-none",
                        index === selectedIndex
                          ? "text-ink-blue"
                          : "text-ink-fade/50",
                      )}
                    >
                      ›
                    </span>
                  </button>
                </li>
              </React.Fragment>
            ))}
          </ul>
          <p className="flex shrink-0 items-center gap-1.5 border-t border-ink-black/15 pt-1.5 font-condensed uppercase tracking-[0.2em] text-[0.6rem] text-ink-fade">
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
    </div>
  );
};
