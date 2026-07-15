import React from "react";
import { Commission } from "../game/GameState";
import { getActiveCommission } from "../game/commissionSequence";
import { InputMaterialWithQuantity } from "../game/Machine";
import { completeCommissionAction } from "../game/game-actions/store-actions";
import { materialMeetsInput } from "../game/material-helpers";
import { humanizeString } from "../utils/humanizeString";
import { useApplyGameAction, useGameState } from "./useGameState";

export const CommissionsSection: React.FC = () => {
  const gameState = useGameState();
  const commission = getActiveCommission(gameState.progression);

  return (
    <section className="space-y-3">
      <h2 className="section-heading">Commissions</h2>
      <div className="bg-corkboard-dark rounded-md p-4 shadow-inner border border-black/40 corkboard-bg space-y-4">
        {commission === null ? (
          <p className="text-paper-manila/60 italic font-typewriter text-center py-6">
            No more work orders (yet)
          </p>
        ) : (
          <WorkOrder
            commission={commission}
            index={gameState.progression.commissionsCompleted}
          />
        )}
      </div>
    </section>
  );
};

const WorkOrder: React.FC<{
  commission: Commission;
  index: number;
}> = ({ commission, index }) => {
  const applyAction = useApplyGameAction();
  const gameState = useGameState();

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

  // Slight alternating rotation for that pinned-paper feel
  const rotation = index % 2 === 0 ? "-rotate-[0.5deg]" : "rotate-[0.6deg]";
  const orderNumber = String(1000 + index).padStart(4, "0");

  return (
    <article
      className={`relative bg-paper-legal text-ink-black p-4 pt-5 rounded-sm shadow-md ${rotation}`}
    >
      {/* Thumbtack */}
      <span
        className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-ink-red shadow-md ring-1 ring-ink-red/50"
        aria-hidden
      />

      <header className="flex items-baseline justify-between border-b border-ink-black/30 pb-1.5 mb-2">
        <h3 className="font-stencil text-base uppercase tracking-widest">
          {commission.name}
        </h3>
        <span className="font-mono text-xs text-ink-fade">#{orderNumber}</span>
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
                <span>{describeRequirement(item.req)}</span>
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
          <button
            disabled={!canComplete}
            className="button-paper text-xs"
            onClick={() => applyAction(completeCommissionAction())}
          >
            Mark Complete
          </button>
        </div>
      </div>
    </article>
  );
};

function describeRequirement(req: InputMaterialWithQuantity): string {
  const types = req.type?.map(humanizeString).join(" / ") ?? "Material";
  const speciesArr = (req as { species?: ReadonlyArray<string> }).species;
  const species = speciesArr?.length
    ? ` (${speciesArr.map(humanizeString).join(" / ")})`
    : "";
  return `${types}${species}`;
}
