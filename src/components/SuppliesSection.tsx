import React from "react";
import { CONSUMABLE_TYPES, ConsumableId } from "../game/Consumable";
import { useGameState } from "./useGameState";

/**
 * The supply cabinet at a glance: every consumable with stock on hand.
 * Hidden entirely while the cabinet is empty so the early game stays quiet.
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
    <section>
      <h2 className="section-heading">Supplies</h2>
      <ul className="paper-card divide-y divide-ink-black/15 text-sm">
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
  );
};
