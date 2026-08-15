import { registerView } from "../core/ViewRegistry";
import { MachineCrateEntity } from "../sim/entities/MachineCrateEntity";
import { MachineEntity } from "../sim/entities/MachineEntity";
import { Player } from "../sim/entities/Player";
import { MachineCrateView } from "./MachineCrateView";
import { MachineView } from "./MachineView";
import { PlayerView } from "./PlayerView";

/**
 * Pairs every sim class with its view. Imported once by the engine
 * shell before any entities are added; headless games never import it.
 */
export function registerAllViews(): void {
  registerView(Player, PlayerView);
  registerView(MachineEntity, MachineView);
  registerView(MachineCrateEntity, MachineCrateView);
}
