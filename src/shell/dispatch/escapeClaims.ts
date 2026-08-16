import { Game } from "../../core/Game";
import { BenchDive } from "../scenes/bench/BenchDive";
import { StoreSceneRoot } from "../scenes/StoreSceneRoot";
import { TargetingState } from "./TargetingState";

/**
 * Whether something in the world already means something by Escape.
 *
 * The old shell had one dispatcher, and registry order decided who got
 * the key: a station sheet or a trip card answered before the pause
 * menu did. The engine shell has two — the engine's ShortcutDispatcher
 * for the floor and the DOM's ShortcutProvider for the chrome — and
 * neither can preventDefault the other, so the chrome asks this first
 * and stands down when the world has a use for the key.
 *
 * Everything here closes on Escape somewhere in the engine's
 * dispatcher: the station sheet, the floor card, the trip card at the
 * cab, the register's receipt, and standing up from a bench.
 */
export function escapeClaimedByWorld(game: Game): boolean {
  const dive = game.entities.tryGetSingleton(BenchDive);
  if (dive?.openBenchKey != null) return true;

  const store = game.entities.tryGetSingleton(StoreSceneRoot);
  if (store && (store.checkoutOpen || store.armedLeave)) return true;

  const targeting = game.entities.tryGetSingleton(TargetingState);
  if (!targeting) return false;
  return (
    targeting.sheetMachine() != null ||
    targeting.truckMenuOpen ||
    targeting.floorSheetOpen
  );
}
