import React from "react";
import { getActiveCommission } from "../game/commissionSequence";
import { useClipboard } from "./clipboard/ClipboardProvider";
import { WorkOrder } from "./CommissionsSection";
import { Tooltip } from "./Tooltip";
import { useGameState } from "./useGameState";

/**
 * The always-on corner of the clipboard: the same sheet of paper the full
 * work order is printed on, cropped to the lines you glance at mid-cut —
 * the order's name, the checklist, and what it pays (or where to carry it,
 * once everything's checked off). Clicking it, or C, holds the whole thing
 * up, growing out of this corner. Gone entirely when there's no work order
 * left, and stood down while the full clipboard is up: there is only one
 * sheet, so it can't be in two places.
 */
export const CommissionTracker: React.FC = () => {
  const gameState = useGameState();
  const clipboard = useClipboard();
  const commission = getActiveCommission(gameState.progression);

  if (commission === null || gameState.player.away) return null;

  return (
    // The ref rides a wrapper, not the button: Tooltip clones its child and
    // re-spreads the child's own props over the ref it merges in.
    <div
      ref={clipboard.setAnchor}
      className="transition-opacity duration-150"
      style={{
        opacity: clipboard.isOpen ? 0 : 1,
        // The sheet is up: no clicking the hole it left behind
        pointerEvents: clipboard.isOpen ? "none" : undefined,
      }}
    >
      <Tooltip
        content="Your clipboard — the full work order"
        shortcut="open-clipboard"
      >
        <button
          className="block w-full text-left hover:brightness-105"
          onClick={clipboard.open}
          data-testid="commission-tracker"
        >
          <WorkOrder
            commission={commission}
            index={gameState.progression.commissionsCompleted}
            compact
          />
        </button>
      </Tooltip>
    </div>
  );
};
