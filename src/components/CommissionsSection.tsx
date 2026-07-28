import React from "react";
import { Commission, GameState } from "../game/GameState";
import { getActiveCommission } from "../game/commissionSequence";
import {
  describeMaterialRequirement,
  materialMeetsInput,
} from "../game/material-helpers";
import { formatMoney } from "../utils/formatNumber";
import { StarIcon } from "./StarIcon";
import { useGameState } from "./useGameState";

/**
 * A commission's checklist measured against what's in the player's hands:
 * one line per required material, with how many of them are already held.
 * Shared by the full work order and the tracker chip so the two never
 * disagree.
 */
export function commissionLineItems(
  gameState: GameState,
  commission: Commission,
) {
  return commission.requiredMaterials.map((req) => {
    const matching = gameState.player.inventory.filter((m) =>
      materialMeetsInput(m, req),
    );
    return {
      req,
      have: Math.min(matching.length, req.quantity),
      need: req.quantity,
    };
  });
}

/** The active commission's work order, clipped to the clipboard. */
export const CommissionsSection: React.FC = () => {
  const gameState = useGameState();
  const commission = getActiveCommission(gameState.progression);

  if (commission === null) {
    // Ink scrawl straight on the hardboard
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
  const gameState = useGameState();

  const lineItems = commissionLineItems(gameState, commission);
  const canComplete = lineItems.every((item) => item.have >= item.need);
  const orderNumber = String(1000 + index).padStart(4, "0");

  return (
    <article className="relative bg-paper-legal text-ink-black p-4 pt-5 rounded-sm shadow-md">
      <header className="flex items-baseline justify-between gap-2 border-b border-ink-black/30 pb-1.5 mb-2">
        <h3 className="font-typewriter font-bold text-base uppercase tracking-widest">
          {commission.name}
        </h3>
        <span className="font-mono text-xs tabular-nums text-ink-fade">
          #{orderNumber}
        </span>
      </header>

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

        <div className="border-t border-ink-black/20 pt-2 space-y-1.5">
          <div className="flex gap-4">
            <div>
              <span className="font-condensed uppercase tracking-[0.15em] text-[0.65rem] text-ink-fade">
                Pays
              </span>{" "}
              <span className="font-mono tabular-nums">
                {formatMoney(commission.rewardMoney)}
              </span>
            </div>
            <div>
              <span className="font-condensed uppercase tracking-[0.15em] text-[0.65rem] text-ink-fade">
                Rep
              </span>{" "}
              <span
                className="inline-flex gap-0.5 text-gold-dark"
                role="img"
                aria-label={`${commission.rewardReputation} reputation`}
              >
                {Array.from({ length: commission.rewardReputation }, (_, i) => (
                  <StarIcon key={i} />
                ))}
              </span>
            </div>
          </div>
          {/* Delivery happens at the door, in the player's hands — the
              order slip only says who it's for and where it goes. */}
          <p
            className="font-ink text-base leading-snug text-ink-blue"
            data-testid="commission-delivery-note"
          >
            {canComplete
              ? `Ready for ${commission.client}. Carry it to the garage door.`
              : `For ${commission.client}. Hand it over at the garage door.`}
          </p>
        </div>
      </div>
    </article>
  );
};
