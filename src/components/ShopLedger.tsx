import React from "react";
import { CONSUMABLE_TYPES, ConsumableId } from "../game/Consumable";
import { useGameState } from "./useGameState";

/**
 * The shop's till: one machine-printed slip with the cash balance on top
 * and, once anything is stocked, the supply cabinet's stock below a
 * perforated rule. The supplies block stays hidden while the cabinet is
 * empty so the early game stays quiet.
 */
export const ShopLedger: React.FC = () => {
  const gameState = useGameState();

  const stocked = (Object.keys(CONSUMABLE_TYPES) as ConsumableId[]).filter(
    (id) => (gameState.consumables[id] ?? 0) > 0,
  );

  return (
    <div className="bg-paper-ivory text-ink-black rounded-sm shadow max-w-fit min-w-44">
      <section className="px-4 py-2">
        <div className="font-condensed uppercase tracking-[0.25em] text-xs text-ink-fade leading-none mb-1">
          Balance
        </div>
        <div className="font-mono text-3xl tabular-nums leading-none">
          ${gameState.money.toFixed(2)}
        </div>
      </section>

      {stocked.length > 0 && (
        <section className="px-4 py-2 border-t border-dashed border-ink-black/25">
          <h2 className="font-condensed uppercase tracking-[0.25em] text-xs text-ink-fade leading-none mb-1">
            Supplies
          </h2>
          <ul className="divide-y divide-ink-black/10 text-sm">
            {stocked.map((id) => {
              const type = CONSUMABLE_TYPES[id];
              const amount = gameState.consumables[id];
              return (
                <li
                  key={id}
                  className="flex items-baseline justify-between gap-4 py-1"
                >
                  <span>{type.name}</span>
                  <span className="font-mono tabular-nums text-ink-fade">
                    {/* "8" for nails (the name already says what they are),
                        "16 oz" for measured goods */}
                    {type.unit === type.name.toLowerCase()
                      ? amount
                      : `${amount} ${type.unit}`}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
};
