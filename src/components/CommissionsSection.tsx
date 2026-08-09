import React from "react";
import { Commission, GameState } from "../game/GameState";
import { getActiveCommission } from "../game/commissionSequence";
import { hasRequiredMaterials } from "../game/delivery";
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
  // A piece counts whether it's still in hand or already loaded in the
  // truck's bed — loading for delivery mustn't make the order look short.
  const pool = [...gameState.player.inventory, ...gameState.truck.bed];
  return commission.requiredMaterials.map((req) => {
    const matching = pool.filter((m) => materialMeetsInput(m, req));
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
    // A blank sheet with one line scrawled across it
    return (
      <article className="relative bg-paper-legal text-ink-black rounded-sm shadow-md p-4">
        <p className="font-ink text-lg text-ink-fade text-center py-4 -rotate-1">
          No open work orders
        </p>
      </article>
    );
  }

  return (
    <WorkOrder
      commission={commission}
      index={gameState.progression.commissionsCompleted}
    />
  );
};

export const WorkOrder: React.FC<{
  commission: Commission;
  index: number;
  /**
   * The corner-of-the-eye version: the same sheet, cropped to the lines
   * you glance at mid-cut — no client note, no rep, no delivery line. It
   * is the same paper either way, which is the point: the tracker in the
   * HUD's corner and the clipboard it opens into are one object.
   */
  compact?: boolean;
}> = ({ commission, index, compact = false }) => {
  const gameState = useGameState();

  const lineItems = commissionLineItems(gameState, commission);
  const canComplete = lineItems.every((item) => item.have >= item.need);
  const bedReady = hasRequiredMaterials(
    gameState.truck.bed,
    commission.requiredMaterials,
  );
  const orderNumber = String(1000 + index).padStart(4, "0");

  return (
    <article
      className={`relative bg-paper-legal text-ink-black rounded-sm shadow-md ${
        compact ? "px-3 py-2.5" : "p-4 pt-5"
      }`}
    >
      <header
        className={`flex items-baseline justify-between gap-2 border-b border-ink-black/30 ${
          compact ? "pb-1 mb-1.5" : "pb-1.5 mb-2"
        }`}
      >
        <h3 className={`font-ink font-bold ${compact ? "text-lg" : "text-xl"}`}>
          {commission.name}
        </h3>
        <span className="font-ink text-base text-ink-fade">#{orderNumber}</span>
      </header>

      <div
        className={`font-ink text-lg leading-snug ${compact ? "space-y-1.5" : "space-y-2"}`}
      >
        {!compact && (
          <>
            <p className="text-ink-blue">{commission.description}</p>
            {/* The plan, scribbled under the note after hanging up —
                smaller, fainter, a little crooked: added later. */}
            {commission.plan && (
              <p className="text-base text-ink-fade -rotate-[0.4deg]">
                {commission.plan}
              </p>
            )}
          </>
        )}
        <div>
          {!compact && (
            <div className="font-ink text-base text-ink-fade">Required</div>
          )}
          <ul className={compact ? "space-y-0.5" : "mt-1 space-y-0.5"}>
            {lineItems.map((item, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="text-base leading-none">
                  {item.have >= item.need ? "☑" : "☐"}
                </span>
                <span>
                  {item.have}/{item.need}
                </span>
                <span className="leading-tight">
                  {describeMaterialRequirement(item.req)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {compact ? (
          // One line at the foot: what it pays until it's done, then
          // where to carry it.
          <div className="border-t border-ink-black/20 pt-1.5 font-ink text-base leading-snug">
            {canComplete ? (
              <span className="text-ink-red">
                {bedReady
                  ? "Loaded — drive it over from the cab"
                  : "All built — into the truck's bed"}
              </span>
            ) : (
              <span className="text-ink-fade">
                Pays{" "}
                <span className="text-ink-black">
                  {formatMoney(commission.rewardMoney)}
                </span>
              </span>
            )}
          </div>
        ) : (
          <div className="border-t border-ink-black/20 pt-2 space-y-1.5">
            <div className="flex gap-4">
              <div>
                <span className="text-ink-fade">Pays</span>{" "}
                <span>{formatMoney(commission.rewardMoney)}</span>
              </div>
              <div>
                <span className="text-ink-fade">Rep</span>{" "}
                <span
                  className="inline-flex gap-0.5 text-gold-dark"
                  role="img"
                  aria-label={`${commission.rewardReputation} reputation`}
                >
                  {Array.from(
                    { length: commission.rewardReputation },
                    (_, i) => (
                      <StarIcon key={i} />
                    ),
                  )}
                </span>
              </div>
            </div>
            {/* Delivery is a drive — the order slip only says who it's for
                and where it goes. */}
            <p className="text-ink-blue" data-testid="commission-delivery-note">
              {bedReady
                ? `Loaded up for ${commission.client} — drive it over from the truck's cab.`
                : canComplete
                  ? `All built. Into the truck's bed, then over to ${commission.client}.`
                  : `For ${commission.client}. Goes out on the truck.`}
            </p>
          </div>
        )}
      </div>
    </article>
  );
};
