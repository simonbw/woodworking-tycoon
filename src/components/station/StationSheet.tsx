import React, { useState } from "react";
import { createPortal } from "react-dom";
import { Machine, Operation } from "../../game/Machine";
import { availableOperations } from "../../game/skill-helpers";
import { Tooltip } from "../Tooltip";
import { useTargetedMachine } from "../TargetedMachineContext";
import { useGameState } from "../useGameState";
import { BenchSheet } from "./BenchSheet";
import { BenchWorkSurface } from "../bench-view/BenchWorkSurface";
import { ContentsSheet } from "./ContentsSheet";
import { ToolSheet } from "./ToolSheet";
import { StatusText } from "./StatusText";

/**
 * The station sheet: the paperwork behind a bench or a container, spread
 * out in the middle of the shop when the player steps up to it (Tab, or
 * clicking the station). Deliberately *not* a modal — the world keeps
 * ticking, the home-screen keys keep working on the station, and walking
 * away folds the sheet back up.
 *
 * A direct-feed machine keeps only its tool rack (ToolSheet): a jointer,
 * planer, table saw or miter saw is a switch, a scale or two, and stock
 * you set down, and every one of those is a key on the floor. Fitting a
 * jig is the one thing left that needs a page. Benches keep the full
 * paperwork (BenchSheet); containers list their contents (ContentsSheet)
 * — a garbage can has an operation but no plan to pick, so what its sheet
 * owes you is what's in it.
 */
export const StationSheet: React.FC = () => {
  const { sheetMachine, closeSheet } = useTargetedMachine();
  const gameState = useGameState();

  if (
    !sheetMachine ||
    gameState.player.away ||
    gameState.player.carriedMachine != null
  ) {
    return null;
  }

  // Portaled to the body: the shop-overlay layer this renders from is
  // pinned to the shop floor's box (and rides the camera transform), but
  // the sheet wants the whole window — a bench top is the entire
  // interface while it's spread out. Still deliberately not a modal.
  return createPortal(
    <div
      // Below the top bar (z-40) on purpose: the sheet is not a modal,
      // so the phone, journal, and menu stay clickable over it
      className="fixed inset-0 z-[35] flex items-center justify-center bg-ink-black/30 p-3 pt-24 pointer-events-auto"
      onClick={closeSheet}
      data-testid="station-sheet"
    >
      <div
        className={`max-h-full w-full overflow-y-auto ${
          // Benches spread wide: the bench top itself is the interface,
          // and it wants nearly the whole window
          !sheetMachine.type.directFeed && !sheetMachine.type.container
            ? "max-w-[min(72rem,95vw)]"
            : "max-w-md"
        }`}
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
}> = ({ machine, onClose }) => {
  const gameState = useGameState();
  const operations = availableOperations(machine, gameState.progression);

  return (
    <SheetFrame machine={machine} onClose={onClose}>
      {machine.type.directFeed ? (
        <ToolSheet machine={machine} />
      ) : machine.type.container || operations.length === 0 ? (
        <ContentsSheet machine={machine} />
      ) : (
        <>
          {/* The bench top itself: hand work happens here, over the
              station's actual staged stock (docs/bench-minigames.md) */}
          <BenchWorkSurface machine={machine} />
          <BenchPaperwork machine={machine} operations={operations} />
        </>
      )}
    </SheetFrame>
  );
};

/**
 * The bench's paperwork — plan picker, supplies, racks — folded under
 * the bench top. It starts closed when a pallet is on the bench (a
 * teardown needs no paperwork at all) and open otherwise, and holds
 * whichever way the player last flipped it while the sheet stays up.
 */
const BenchPaperwork: React.FC<{
  machine: Machine;
  operations: ReadonlyArray<Operation>;
}> = ({ machine, operations }) => {
  const [open, setOpen] = useState(
    () => !machine.inputMaterials.some((m) => m.type === "pallet"),
  );
  return (
    <details
      open={open}
      onToggle={(event) => setOpen((event.target as HTMLDetailsElement).open)}
      data-testid="bench-paperwork"
    >
      <summary className="cursor-pointer select-none font-condensed uppercase tracking-[0.15em] text-[0.7rem] text-ink-fade hover:text-ink-black">
        Plans &amp; paperwork
      </summary>
      <div className="space-y-3 pt-2">
        <BenchSheet machine={machine} operations={operations} />
      </div>
    </details>
  );
};
