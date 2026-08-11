import React, { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { isBenchType, Machine, machineKey } from "../../game/Machine";
import { ProgressionState } from "../../game/GameState";
import { availableOperations } from "../../game/skill-helpers";
import { Tooltip } from "../Tooltip";
import { useTargetedMachine } from "../TargetedMachineContext";
import { useGameState, useMachines } from "../useGameState";
import { BenchWorkSurface } from "../bench-view/BenchWorkSurface";
import { ContentsSheet } from "./ContentsSheet";
import { AccessorySheet } from "./AccessorySheet";
import { StatusText } from "./StatusText";

/**
 * The station sheet: the paperwork behind a bench or a container, spread
 * out in the middle of the shop when the player steps up to it (Tab, or
 * clicking the station). Deliberately *not* a modal — the world keeps
 * ticking, the home-screen keys keep working on the station, and walking
 * away folds the sheet back up.
 *
 * A direct-feed machine keeps only its accessory rack (AccessorySheet): a jointer,
 * planer, table saw or miter saw is a switch, a scale or two, and stock
 * you set down, and every one of those is a key on the floor. Fitting a
 * jig is the one thing left that needs a page. Benches have no card at
 * all — the bench view carries its own chrome (the tool rail on top, the
 * blueprint pile in the corner: BlueprintCorner). Containers list their
 * contents (ContentsSheet) — a garbage can has an operation but no plan
 * to pick, so what its sheet owes you is what's in it.
 */
/**
 * Whether this station's sheet is the full-window bench view: the player
 * leans over the bench top rather than reading a card. ShopView pins the
 * body while this is open — hands on the bench, no walking away.
 */
export function sheetIsBenchView(
  machine: Machine,
  progression: ProgressionState,
): boolean {
  return (
    isBenchType(machine.type) &&
    !machine.type.container &&
    availableOperations(machine, progression).length > 0
  );
}

export const StationSheet: React.FC = () => {
  const { sheetMachine, closeSheet } = useTargetedMachine();
  const gameState = useGameState();
  const machines = useMachines();

  // The bench view zooms out rather than cutting away, so a closed
  // bench sheet lingers here as pure theater: the departing machine
  // keeps the surface mounted (input off, chrome fading) until the
  // camera lands back at shop framing and the surface says it's done.
  // Re-opening the same bench mid-pull-back hands the very same mounted
  // surface its target back, and the camera just leans in again.
  const activeBench =
    sheetMachine && sheetIsBenchView(sheetMachine, gameState.progression)
      ? sheetMachine
      : null;
  const [departing, setDeparting] = useState<Machine | null>(null);
  const lastBench = useRef<Machine | null>(null);
  // Derived during render, not in an effect: an effect runs after the
  // commit, and that commit would have already unmounted the surface —
  // the shop would pop back and the pull-back would play invisibly.
  // Setting state mid-render re-renders before anything commits, so the
  // mounted surface flows straight from open to closing.
  if (activeBench) {
    lastBench.current = activeBench;
    if (departing) setDeparting(null);
  } else if (lastBench.current) {
    setDeparting(lastBench.current);
    lastBench.current = null;
  } else if (departing && sheetMachine) {
    // Another station's sheet went up mid-pull-back: the card wins, the
    // rest of the theater is dropped.
    setDeparting(null);
  }

  if (gameState.player.away || gameState.player.carriedMachine != null) {
    return null;
  }

  const bench = activeBench ?? departing;

  // Portaled to the body: the shop-overlay layer this renders from is
  // pinned to the shop floor's box (and rides the camera transform), but
  // the sheet wants the whole window. Still deliberately not a modal —
  // below the top bar (z-40) on purpose, so the journal and menu
  // stay clickable over it.
  if (bench) {
    // The departing machine object is a snapshot; the world keeps
    // ticking through the pull-back, so draw the live machine while it
    // still exists (it always does — feet were pinned at it).
    const live =
      machines.find((m) => machineKey(m.state) === machineKey(bench.state)) ??
      bench;
    // A bench IS the whole window: the bench view fills it edge to
    // edge, with the tool rail on top and the blueprint pile in the
    // corner — no paperwork card at all. A <section> so the test
    // helpers' heading-anchored card locator still works.
    return createPortal(
      // A pulling-back sheet is closed as far as anything else is
      // concerned — no station-sheet testid, no pointer targets — so
      // walking straight to another station and opening ITS sheet never
      // sees a phantom one still open.
      <section
        className={`fixed inset-0 z-[35] ${
          activeBench ? "pointer-events-auto" : "pointer-events-none"
        }`}
        data-testid={activeBench ? "station-sheet" : undefined}
      >
        <BenchWorkSurface
          key={machineKey(live.state)}
          machine={live}
          onClose={closeSheet}
          closing={!activeBench}
          onExited={() => setDeparting(null)}
        />
      </section>,
      document.body,
    );
  }

  if (!sheetMachine) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[35] flex items-center justify-center bg-ink-black/30 p-3 pt-24 pointer-events-auto"
      onClick={closeSheet}
      data-testid="station-sheet"
    >
      <div
        className="max-h-full w-full max-w-md overflow-y-auto"
        onClick={(event) => event.stopPropagation()}
      >
        <StationSheetBody machine={sheetMachine} onClose={closeSheet} />
      </div>
    </div>,
    document.body,
  );
};

const SheetFrame: React.FC<{
  machine: Machine;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ machine, onClose, children }) => (
  <section className="paper-card space-y-3 shadow-xl">
    <header className="flex items-baseline justify-between border-b-2 border-ink-black/40 pb-1">
      <h3 className="font-condensed font-bold text-lg uppercase tracking-wide">
        {machine.type.name}
      </h3>
      <span className="flex items-center gap-3">
        <span className="font-condensed uppercase tracking-[0.15em] text-[0.65rem] text-ink-fade">
          <StatusText machine={machine} />
        </span>
        <Tooltip content="Put the sheet away" shortcut="close-sheet">
          <button
            className="button-paper text-xs leading-none"
            onClick={onClose}
            aria-label="Close station sheet"
          >
            ✕
          </button>
        </Tooltip>
      </span>
    </header>
    {children}
  </section>
);

const StationSheetBody: React.FC<{
  machine: Machine;
  onClose: () => void;
}> = ({ machine, onClose }) => (
  <SheetFrame machine={machine} onClose={onClose}>
    {machine.type.directFeed ? (
      <AccessorySheet machine={machine} />
    ) : (
      <ContentsSheet machine={machine} />
    )}
  </SheetFrame>
);
