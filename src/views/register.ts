import { registerView } from "../core/ViewRegistry";
import { MaterialPileEntity } from "../sim/entities/MaterialPileEntity";
import { Player } from "../sim/entities/Player";
import { ShopVacEntity } from "../sim/entities/ShopVacEntity";
import { Broom } from "../sim/singletons/Broom";
import { BroomView } from "./BroomView";
import { MaterialPileView } from "./MaterialPileView";
import { PlayerView } from "./PlayerView";
import { ShopVacView } from "./ShopVacView";
import { enableViewZOrdering } from "./z-order";

/**
 * Pairs every sim class with its view. Imported once by the engine
 * shell before any entities are added; headless games never import it.
 */
export function registerAllViews(): void {
  enableViewZOrdering();
  registerView(Player, PlayerView);
  registerView(MaterialPileEntity, MaterialPileView);
  registerView(Broom, BroomView);
  registerView(ShopVacEntity, ShopVacView);
}
