import React from "react";
import { Machine } from "../../../game/Machine";
import { ProgressionState } from "../../../game/GameState";
import { divesToBench } from "../../../components/station/station-helpers";
import { Tooltip } from "../../../components/Tooltip";
import { useShopState } from "../../useShell";
import { useTargeting } from "../useTargeting";
import { ContentsSheet } from "./ContentsSheet";
import { AccessorySheet } from "./AccessorySheet";
import { StatusText } from "./StatusText";

/**
 * The station sheet: the paperwork behind a bench or a container, spread
 * out in the middle of the shop when the player steps up to it (Tab, or
 * right-clicking the station). Deliberately *not* a modal — the world
 * keeps ticking, the home-screen keys keep working on the station, and
 * walking away folds the sheet back up (TargetingState's tick).
 *
 * A direct-feed machine keeps only its accessory rack (AccessorySheet):
 * a jointer, planer, table saw or miter saw is a switch, a scale or two,
 * and stock you set down, and every one of those is a key on the floor.
 * Fitting a jig is the one thing left that needs a page. Containers list
 * their contents (ContentsSheet).
 *
 * Benches have no card at all — their sheet is the full-window bench
 * view, which is phase 7 of the migration: until it lands, Tab at a
 * bench opens no surface here (the open/close state still tracks, so
 * the keys behave; see MIGRATION.md).
 *
 * The old component portaled to the body because it rendered from the
 * camera-pinned overlay; here it renders in the HUD root, which is
 * already a fixed whole-window layer — same box, same z ordering (the
 * sheet's z-[35] sits under the top bar's z-40 on purpose, so the
 * journal and menu stay clickable over it).
 */
export function sheetIsBenchView(
  machine: Machine,
  progression: ProgressionState,
): boolean {
  return divesToBench(machine, progression);
}

export const StationSheet: React.FC = () => {
  const { sheetMachine, closeSheet } = useTargeting();
  const gameState = useShopState();

  if (gameState.player.away || gameState.player.carriedMachine != null) {
    return null;
  }

  if (!sheetMachine) {
    return null;
  }

  // The bench view (the full-window work surface) is phase 7.
  if (sheetIsBenchView(sheetMachine, gameState.progression)) {
    return null;
  }

  return (
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
}> = ({ machine, onClose }) => (
  <SheetFrame machine={machine} onClose={onClose}>
    {machine.type.directFeed ? (
      <AccessorySheet machine={machine} />
    ) : (
      <ContentsSheet machine={machine} />
    )}
  </SheetFrame>
);
