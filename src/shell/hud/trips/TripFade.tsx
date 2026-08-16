import React from "react";
import { TripTheater } from "../../scenes/TripTheater";
import { useGame, useShellVersion } from "../../useShell";

/**
 * The black the trip's theater plays behind: the screen dips as the
 * truck leaves the lot and comes back up on the destination, and dips
 * again over the destination on the way home. The curtain itself is
 * owned by the TripTheater entity (it runs on the engine's clock, same
 * as the truck's roll); this is the pane it draws on.
 *
 * Above every overlay on purpose — what it covers is usually one.
 */
export const TripFade: React.FC = () => {
  const game = useGame();
  useShellVersion();
  const fade = game.entities.tryGetSingleton(TripTheater)?.fade() ?? 0;
  if (fade <= 0) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[70] bg-black"
      style={{ opacity: fade }}
      data-testid="trip-fade"
    />
  );
};

/** Whether the destination should be on screen yet. */
export function useTripStaged(): boolean {
  const game = useGame();
  useShellVersion();
  return game.entities.tryGetSingleton(TripTheater)?.stage() !== "departing";
}

/** Head home the way the theater wants: black first, then the return. */
export function useHeadHome(): (apply: () => void) => void {
  const game = useGame();
  return (apply) => {
    const theater = game.entities.tryGetSingleton(TripTheater);
    if (theater) {
      theater.headHome(apply);
    } else {
      apply();
    }
  };
}
