import React from "react";
import { ShortcutKeys } from "../../components/shortcuts/Kbd";
import { Thumbtack } from "../../components/Thumbtack";
import { isNight } from "../../game/time-flow";
import { useShopState } from "../useShell";

/**
 * The nudge home at close: pinned up when the day's hours are spent and
 * the player is still on the lot, taken down by the drive home. While it
 * shows, the truck wears the coach outline in the world (see ShopView) —
 * the same pairing the guided opening uses, a card naming the thing and
 * the thing lit up.
 *
 * The engine-shell port of `src/components/NightfallCard.tsx`: reads
 * only, so the only change is the state hook.
 */
export const NightfallCard: React.FC = () => {
  const gameState = useShopState();

  if (!isNight(gameState) || gameState.player.away !== null) {
    return null;
  }

  return (
    <section
      className="paper-card relative space-y-2"
      data-testid="nightfall-card"
    >
      <Thumbtack />
      <header className="border-b-2 border-ink-black/40 pb-1">
        <h3 className="font-condensed font-bold text-lg uppercase tracking-wide">
          Closed for the Night
        </h3>
      </header>
      <p className="text-sm leading-snug">
        The day's working hours are spent. Head out to the truck, press{" "}
        <ShortcutKeys shortcut="pick-up" /> at the cab, and drive home. Anything
        still curing is dry by morning.
      </p>
    </section>
  );
};
