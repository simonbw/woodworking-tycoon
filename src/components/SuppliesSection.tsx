import React from "react";
import { CONSUMABLE_TYPES, ConsumableId } from "../game/Consumable";
import { ConsumableIcon } from "./ItemIcon";
import { SheetLabel } from "./HandsStrip";
import { useGameState } from "./useGameState";

/**
 * The supply cabinet's sheet in the shop manifest: a hand-kept ruled tally
 * of every consumable with stock on hand. Hidden entirely while the
 * cabinet is empty so the early game stays quiet.
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
      <SheetLabel title="Supplies" />
      <div className="lined-sheet">
        <ul>
          {stocked.map((id) => {
            const type = CONSUMABLE_TYPES[id];
            const amount = gameState.consumables[id];
            return (
              <li
                key={id}
                className="flex items-baseline justify-between gap-4"
              >
                <span className="flex items-center gap-2 text-sm leading-[2rem]">
                  <ConsumableIcon
                    consumableId={id}
                    className="size-6 shrink-0 [image-rendering:pixelated]"
                  />
                  {type.name}
                </span>
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
      </div>
    </section>
  );
};
