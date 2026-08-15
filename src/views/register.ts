import { registerView } from "../core/ViewRegistry";
import { Player } from "../sim/entities/Player";
import { PlayerView } from "./PlayerView";

/**
 * Pairs every sim class with its view. Imported once by the engine
 * shell before any entities are added; headless games never import it.
 */
export function registerAllViews(): void {
  registerView(Player, PlayerView);
}
