import React, { useState } from "react";
import { Commission } from "../game/GameState";
import { getActiveCommission } from "../game/commissionSequence";
import { completeCommissionAction } from "../game/game-actions/store-actions";
import {
  describeMaterialRequirement,
  materialMeetsInput,
} from "../game/material-helpers";
import { useShortcut } from "./shortcuts/ShortcutProvider";
import { Thumbtack } from "./Thumbtack";
import { Tooltip } from "./Tooltip";
import { useApplyGameAction, useGameState } from "./useGameState";

/** The active commission's work order, pinned to the job board. */
export const CommissionsSection: React.FC = () => {
  const gameState = useGameState();
  const commission = getActiveCommission(gameState.progression);

  if (commission === null) {
    // Chalk scrawl straight on the cork
    return (
      <p className="font-ink text-lg text-paper-manila/70 text-center py-4 -rotate-1">
        No more work orders (yet)
      </p>
    );
  }

  return (
    <WorkOrder
      commission={commission}
      index={gameState.progression.commissionsCompleted}
    />
  );
};

const WorkOrder: React.FC<{
  commission: Commission;
  index: number;
}> = ({ commission, index }) => {
  const applyAction = useApplyGameAction();
  const gameState = useGameState();
  const [folded, setFolded] = useState(false);

  // Check inventory against each required material
  const lineItems = commission.requiredMaterials.map((req) => {
    const matching = gameState.player.inventory.filter((m) =>
      materialMeetsInput(m, req),
    );
    return {
      req,
      have: Math.min(matching.length, req.quantity),
      need: req.quantity,
    };
  });

  const canComplete = lineItems.every((item) => item.have >= item.need);

  useShortcut(
    "complete-commission",
    () => applyAction(completeCommissionAction()),
    canComplete,
  );

  // Slight alternating rotation for that pinned-paper feel
  const rotation = index % 2 === 0 ? "-rotate-[0.5deg]" : "rotate-[0.6deg]";
  const orderNumber = String(1000 + index).padStart(4, "0");

  return (
    <article
      className={`relative bg-paper-legal text-ink-black p-4 pt-5 rounded-sm shadow-md ${rotation}`}
    >
      <Thumbtack />

      {/* The header doubles as the fold toggle — the paper folds up to a stub */}
      <header
        className="flex items-baseline justify-between gap-2 border-b border-ink-black/30 pb-1.5 mb-2 cursor-pointer select-none"
        onClick={() => setFolded((f) => !f)}
        aria-expanded={!folded}
      >
        <h3 className="font-typewriter font-bold text-base uppercase tracking-widest">
          {commission.name}
        </h3>
        <span className="font-mono text-xs text-ink-fade">
          #{orderNumber} {folded ? "▸" : "▾"}
        </span>
      </header>

      {folded ? (
        <FoldedSummary commission={commission} lineItems={lineItems} />
      ) : (
        <div className="font-typewriter text-sm space-y-2">
          <p className="font-ink text-base leading-snug text-ink-blue">
            {commission.description}
          </p>
          <div>
            <div className="font-condensed uppercase tracking-[0.15em] text-[0.65rem] text-ink-fade">
              Required
            </div>
            <ul className="mt-1 space-y-0.5">
              {lineItems.map((item, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="font-mono text-base leading-none">
                    {item.have >= item.need ? "☑" : "☐"}
                  </span>
                  <span className="tabular-nums">
                    {item.have}/{item.need}
                  </span>
                  <span>{describeMaterialRequirement(item.req)}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-baseline justify-between border-t border-ink-black/20 pt-2">
            <div className="flex gap-4">
              <div>
                <span className="font-condensed uppercase tracking-[0.15em] text-[0.65rem] text-ink-fade">
                  Pays
                </span>{" "}
                <span className="font-mono">
                  ${commission.rewardMoney.toFixed(2)}
                </span>
              </div>
              <div>
                <span className="font-condensed uppercase tracking-[0.15em] text-[0.65rem] text-ink-fade">
                  Rep
                </span>{" "}
                <span className="text-gold-dark">
                  {"★".repeat(commission.rewardReputation)}
                </span>
              </div>
            </div>
            <Tooltip
              content="Mark complete"
              shortcut={canComplete ? "complete-commission" : undefined}
            >
              <button
                disabled={!canComplete}
                className="button-paper text-xs"
                onClick={() => applyAction(completeCommissionAction())}
              >
                Mark Complete
              </button>
            </Tooltip>
          </div>
        </div>
      )}
    </article>
  );
};

/** The folded-up order: just enough to see progress and what it pays. */
const FoldedSummary: React.FC<{
  commission: Commission;
  lineItems: ReadonlyArray<{ have: number; need: number }>;
}> = ({ commission, lineItems }) => {
  const have = lineItems.reduce((sum, item) => sum + item.have, 0);
  const need = lineItems.reduce((sum, item) => sum + item.need, 0);
  return (
    <div className="font-typewriter text-sm flex items-baseline justify-between">
      <span className="tabular-nums">
        {have}/{need} materials
      </span>
      <span className="font-mono">${commission.rewardMoney.toFixed(2)}</span>
    </div>
  );
};
