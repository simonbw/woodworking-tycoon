import { registerView } from "../core/ViewRegistry";
import { CustomerEntity } from "../sim/entities/CustomerEntity";
import { MachineCrateEntity } from "../sim/entities/MachineCrateEntity";
import { MachineEntity } from "../sim/entities/MachineEntity";
import { MaterialPileEntity } from "../sim/entities/MaterialPileEntity";
import { Player } from "../sim/entities/Player";
import { ShopVacEntity } from "../sim/entities/ShopVacEntity";
import { StandEntity } from "../sim/entities/StandEntity";
import { TruckEntity } from "../sim/entities/TruckEntity";
import { Broom } from "../sim/singletons/Broom";
import { DustLayer } from "../sim/singletons/DustLayer";
import { BroomView } from "./BroomView";
import { CustomerView } from "./CustomerView";
import { DustView } from "./DustView";
import { MachineCrateView } from "./MachineCrateView";
import { MachineView } from "./MachineView";
import { MaterialPileView } from "./MaterialPileView";
import { PlayerView } from "./PlayerView";
import { ShopVacView } from "./ShopVacView";
import { StandView } from "./StandView";
import { TruckView } from "./TruckView";
import { enableViewZOrdering } from "./z-order";

/**
 * Pairs every sim class with its view. Imported once by the engine
 * shell before any entities are added; headless games never import it.
 */
export function registerAllViews(): void {
  enableViewZOrdering();
  registerView(Player, PlayerView);
  registerView(DustLayer, DustView);
  registerView(TruckEntity, TruckView);
  registerView(StandEntity, StandView);
  registerView(CustomerEntity, CustomerView);
  registerView(MaterialPileEntity, MaterialPileView);
  registerView(Broom, BroomView);
  registerView(ShopVacEntity, ShopVacView);
  registerView(MachineEntity, MachineView);
  registerView(MachineCrateEntity, MachineCrateView);
}
