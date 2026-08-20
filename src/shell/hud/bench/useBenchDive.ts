import { BenchDive } from "../../scenes/bench/BenchDive";
import { useGame, useShellVersion } from "../../useShell";

/** Whether the player is leaned over a bench right now. */
export function useBenchDiveActive(): boolean {
  const game = useGame();
  useShellVersion();
  return game.entities.tryGetSingleton(BenchDive)?.openBenchKey != null;
}

/**
 * How the bench's floating chrome rides the lean-in: it settles in once
 * the camera lands and lifts away the moment the player starts standing
 * up. Spread onto each piece of chrome — `inert` travels with the fade,
 * since opacity alone would leave a ghosted button clickable.
 */
export function useBenchChrome(): { className: string; inert: boolean } {
  const game = useGame();
  useShellVersion();
  const settled = game.entities.tryGetSingleton(BenchDive)?.settled() ?? false;
  return {
    className: `transition-opacity ${
      settled ? "opacity-100 duration-300" : "opacity-0 duration-150"
    }`,
    inert: !settled,
  };
}
