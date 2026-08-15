import { registerView } from "../core/ViewRegistry";
import { CustomerEntity } from "../sim/entities/CustomerEntity";
import { Player } from "../sim/entities/Player";
import { StandEntity } from "../sim/entities/StandEntity";
import { TruckEntity } from "../sim/entities/TruckEntity";
import { DustLayer } from "../sim/singletons/DustLayer";
import { CustomerView } from "./CustomerView";
import { DustView } from "./DustView";
import { PlayerView } from "./PlayerView";
import { StandView } from "./StandView";
import { TruckView } from "./TruckView";

/**
 * Pairs every sim class with its view. Imported once by the engine
 * shell before any entities are added; headless games never import it.
 */
export function registerAllViews(): void {
  registerView(Player, PlayerView);
  registerView(DustLayer, DustView);
  registerView(TruckEntity, TruckView);
  registerView(StandEntity, StandView);
  registerView(CustomerEntity, CustomerView);
}
