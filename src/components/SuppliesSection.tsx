import React from "react";
import { CLAMP_NAME, clampsInUse } from "../game/Clamp";
import { CONSUMABLE_TYPES, ConsumableId } from "../game/Consumable";
import { formatCount } from "../utils/formatNumber";
import { ConsumableIcon } from "./ItemIcon";
import { useGameState } from "./useGameState";

/**
 * The supply cabinet's running tally, worn as a small HUD card in the
 * corner: every consumable with stock on hand, plus the clamp rack.
 * Hidden entirely while the cabinet is empty so the early game stays
 * quiet.
 */
export const SuppliesSection: React.FC = () => {
  const gameState = useGameState();

  const stocked = (Object.keys(CONSUMABLE_TYPES) as ConsumableId[]).filter(
    (id) => (gameState.consumables[id] ?? 0) > 0,
  );
  const clampsOwned = gameState.clamps;
  const clampsHeld = clampsInUse(gameState.machines);
  if (gameState.player.away) return null;
  if (stocked.length === 0 && clampsOwned === 0) return null;

  return (
    <section className="hud-chip w-56 px-3 py-2">
      <h2 className="pb-1 font-condensed text-[0.65rem] uppercase tracking-[0.2em] text-paper-manila/60">
        Supplies
      </h2>
      <ul className="space-y-1">
        {stocked.map((id) => {
          const type = CONSUMABLE_TYPES[id];
          const amount = gameState.consumables[id];
          return (
            <li key={id} className="flex items-baseline justify-between gap-4">
              <span className="flex items-center gap-2 font-condensed text-sm text-paper-manila">
                <ConsumableIcon
                  consumableId={id}
                  className="size-5 shrink-0 [image-rendering:pixelated]"
                />
                {type.name}
              </span>
              <span className="text-sm tabular-nums text-paper-manila/80">
                {/* "8" for nails (the name already says what they are),
                    "16 oz" for measured goods */}
                {type.unit === type.name.toLowerCase()
                  ? formatCount(amount)
                  : `${formatCount(amount)} ${type.unit}`}
              </span>
            </li>
          );
        })}
        {/* Clamps aren't spent, so the tally reads as a rack count:
            how many you own, and how many are holding a glue-up */}
        {clampsOwned > 0 && (
          <li className="flex items-baseline justify-between gap-4">
            <span className="font-condensed text-sm text-paper-manila">
              {CLAMP_NAME}s
            </span>
            <span className="text-sm tabular-nums text-paper-manila/80">
              {clampsHeld > 0
                ? `${formatCount(clampsOwned - clampsHeld)} of ${formatCount(clampsOwned)} free`
                : formatCount(clampsOwned)}
            </span>
          </li>
        )}
      </ul>
    </section>
  );
};
