import { BenchDive } from "../../scenes/bench/BenchDive";
import { useGame, useShellVersion } from "../../useShell";

/** Whether the player is leaned over a bench right now. */
export function useBenchDiveActive(): boolean {
  const game = useGame();
  useShellVersion();
  return game.entities.tryGetSingleton(BenchDive)?.openBenchKey != null;
}
