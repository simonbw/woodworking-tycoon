import React from "react";
import { getActiveCommission } from "../game/commissionSequence";
import { describeMaterialRequirement } from "../game/material-helpers";
import { formatMoney } from "../utils/formatNumber";
import { useClipboard } from "./clipboard/ClipboardProvider";
import { commissionLineItems } from "./CommissionsSection";
import { Tooltip } from "./Tooltip";
import { useGameState } from "./useGameState";

/**
 * The always-on corner of the clipboard: just the lines you glance at
 * mid-cut — the order's name, the checklist, and what it pays (or where
 * to carry it, once everything's checked off). Clicking it, or C, holds
 * the full clipboard up. Gone entirely when there's no work order left.
 */
export const CommissionTracker: React.FC = () => {
  const gameState = useGameState();
  const clipboard = useClipboard();
  const commission = getActiveCommission(gameState.progression);

  if (commission === null || gameState.player.away) return null;

  const lineItems = commissionLineItems(gameState, commission);
  const canComplete = lineItems.every((item) => item.have >= item.need);

  return (
    <Tooltip
      content="Your clipboard — the full work order"
      shortcut="open-clipboard"
    >
      <button
        className="hud-chip block w-full px-3 py-2 text-left"
        onClick={clipboard.open}
        data-testid="commission-tracker"
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-condensed text-[0.65rem] uppercase tracking-[0.2em] text-paper-manila/60">
            Work order
          </span>
          <span className="text-xs tabular-nums text-paper-manila/50">
            #
            {String(1000 + gameState.progression.commissionsCompleted).padStart(
              4,
              "0",
            )}
          </span>
        </div>
        <div className="font-condensed font-semibold text-sm uppercase tracking-[0.1em] text-paper-manila">
          {commission.name}
        </div>
        <ul className="mt-1 space-y-0.5">
          {lineItems.map((item, i) => (
            <li
              key={i}
              className="flex items-center gap-2 font-condensed text-sm text-paper-manila/80"
            >
              <span className="text-base leading-none">
                {item.have >= item.need ? "☑" : "☐"}
              </span>
              <span className="text-xs tabular-nums">
                {item.have}/{item.need}
              </span>
              <span className="leading-tight">
                {describeMaterialRequirement(item.req)}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-1.5 border-t border-workshop-edge pt-1.5 font-condensed text-xs">
          {canComplete ? (
            <span className="uppercase tracking-[0.15em] text-gold-light">
              Ready — carry it to the garage door
            </span>
          ) : (
            <span className="text-paper-manila/60">
              Pays{" "}
              <span className="text-sm tabular-nums text-gold">
                {formatMoney(commission.rewardMoney)}
              </span>
            </span>
          )}
        </div>
      </button>
    </Tooltip>
  );
};
