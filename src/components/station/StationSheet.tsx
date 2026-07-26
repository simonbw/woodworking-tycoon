import React from "react";
import { Machine } from "../../game/Machine";
import { availableOperations } from "../../game/skill-helpers";
import { Tooltip } from "../Tooltip";
import { useTargetedMachine } from "../TargetedMachineContext";
import { useGameState } from "../useGameState";
import { BenchSheet } from "./BenchSheet";
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

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-ink-black/30 pointer-events-auto"
      onClick={closeSheet}
      data-testid="station-sheet"
    >
      <div
        className="max-h-full w-full max-w-md overflow-y-auto"
        onClick={(event) => event.stopPropagation()}
      >
        <StationSheetBody machine={sheetMachine} onClose={closeSheet} />
      </div>
    </div>
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
        <BenchSheet machine={machine} operations={operations} />
      )}
    </SheetFrame>
  );
};
