import React from "react";
import { CONSUMABLE_TYPES, ConsumableId } from "../game/Consumable";
import { useGameState } from "./useGameState";

/**
 * The supply cabinet at a glance: a hand-kept tally of every consumable
 * with stock on hand. Hidden entirely while the cabinet is empty so the
 * early game stays quiet.
 */
export const SuppliesSection: React.FC = () => {
  const gameState = useGameState();

  const stocked = (Object.keys(CONSUMABLE_TYPES) as ConsumableId[]).filter(
    (id) => (gameState.consumables[id] ?? 0) > 0,
  );
  if (stocked.length === 0) {
    return null;
  }

  return (
    <section className="lined-sheet w-56">
      <h2 className="font-condensed uppercase tracking-[0.2em] text-[0.65rem] text-ink-black/60 leading-[2rem]">
        Supplies
      </h2>
      <ul>
        {stocked.map((id) => {
          const type = CONSUMABLE_TYPES[id];
          const amount = gameState.consumables[id];
          return (
            <li key={id} className="flex items-baseline justify-between gap-4">
              <span className="text-sm leading-[2rem]">{type.name}</span>
              <span className="font-ink text-lg leading-[2rem] text-ink-fade">
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
  );
};
