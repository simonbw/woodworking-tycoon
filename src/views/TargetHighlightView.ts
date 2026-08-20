import { Container } from "pixi.js";
import { Persistence } from "../config/constants";
import { BaseEntity } from "../core/entity/BaseEntity";
import { Entity } from "../core/entity/Entity";
import { on } from "../core/entity/handler";
import { InteractAction, resolveInteract } from "../game/interact";
import { atTruckBed } from "../game/lot";
import { GameState } from "../game/GameState";
import { atStand, isSellable } from "../game/stand";
import { TargetingState } from "../shell/dispatch/TargetingState";
import { shopCellMap } from "../sim/commands/machine-commands";
import { TripTheater } from "../shell/scenes/TripTheater";
import { MaterialPileEntity } from "../sim/entities/MaterialPileEntity";
import { Player } from "../sim/entities/Player";
import { StandEntity } from "../sim/entities/StandEntity";
import { TruckEntity } from "../sim/entities/TruckEntity";
import { projectGameState } from "../sim/projection";
import { StandView } from "./StandView";
import {
  findChildView,
  TARGET_HIGHLIGHT_FILTERS,
  viewHighlightRoot,
} from "./targetHighlight";
import { TruckView } from "./TruckView";

/**
 * The in-world targeting treatment — the old targetHighlight.ts filters
 * applied by an entity instead of React props. Everything the keys are
 * about to act on wears the same white rim, so "this is the target"
 * reads the same for a station, a board on the floor, the for-sale
 * stand, and the truck.
 *
 * What each of those means is decided here rather than in the views: the
 * rim comes off the same resolver the keyboard uses (with R's rummage
 * offset applied), so the outline and the keypress can never disagree
 * about which piece leaves the floor, the bed, or the table.
 */
export class TargetHighlightView extends BaseEntity implements Entity {
  persistenceLevel: number = Persistence.Permanent;
  pausable = false;

  /** How to put back what was dressed last frame. */
  private undressers: Array<() => void> = [];

  @on("render")
  onRender() {
    // Undress last frame's targets…
    for (const undress of this.undressers) undress();
    this.undressers = [];

    const game = this.game;
    if (!game.entities.tryGetSingleton(Player)) return;
    const targeting = game.entities.tryGetSingleton(TargetingState);
    if (!targeting) return;
    const gs = projectGameState(game);
    if (gs.player.away) return;

    // …and dress this frame's: the targeted machine…
    const targeted = targeting.targeted();
    if (targeted) this.dress(viewHighlightRoot(targeted));

    const action = resolveInteract(
      gs,
      shopCellMap(this.game),
      targeted?.view(),
      targeting.pileOffset,
    );

    // …the pile E would pick up…
    if (action?.kind === "pick-up-floor") {
      for (const entity of game.entities.byConstructor(MaterialPileEntity)) {
        if (entity.material.id === action.target.material.id) {
          this.dress(viewHighlightRoot(entity));
          break;
        }
      }
    }

    this.dressStand(gs, action);
    this.dressTruck(gs, action);
  }

  /**
   * The stand: the table lights when F would set work out on it, and the
   * piece E would take back lights on its own the way a floor pile does.
   */
  private dressStand(gs: GameState, action: InteractAction | null): void {
    const stand = this.game.entities.tryGetSingleton(StandEntity);
    if (!stand) return;
    const atStandNow =
      gs.player.carriedMachine == null &&
      atStand(gs.shopInfo, gs.player.position);
    if (atStandNow && gs.player.inventory.some(isSellable)) {
      this.dress(viewHighlightRoot(stand));
    }
    if (action?.kind === "stand") {
      const view = findChildView(stand, StandView);
      this.dress(view?.pieceRoot(action.material) ?? null);
    }
  }

  /**
   * The truck, aimed at whatever the keys would actually move. Lifting a
   * piece back out is a pickup like any other, so the *piece* lights up,
   * not the truck. The cargo box itself only lights when the bed is the
   * thing being acted on — F loading what's in hand over the rail, or a
   * crate hoisting out of it — and the whole body lights when E would
   * open the cab.
   */
  private dressTruck(gs: GameState, action: InteractAction | null): void {
    const truck = this.game.entities.tryGetSingleton(TruckEntity);
    if (!truck) return;
    const view = findChildView(truck, TruckView);
    const parked =
      (this.game.entities.tryGetSingleton(TripTheater)?.stage() ?? "parked") ===
      "parked";
    const atBed =
      parked &&
      gs.player.carriedMachine == null &&
      atTruckBed(gs.shopInfo, gs.player.position);
    const bedIsTheTarget =
      atBed && (gs.player.inventory.length > 0 || gs.truck.crates.length > 0);

    if (bedIsTheTarget) {
      this.dressHidden(view?.bedRimRoot ?? null);
    } else if (parked && action?.kind === "truck-cab") {
      this.dress(viewHighlightRoot(truck));
    }
    if (atBed && action?.kind === "truck-bed") {
      this.dress(view?.cargoRoot(action.material) ?? null);
    }
  }

  private dress(container: Container | null): void {
    if (!container) return;
    container.filters = TARGET_HIGHLIGHT_FILTERS;
    this.undressers.push(() => {
      container.filters = [];
    });
  }

  /** A drawable that exists only to carry a rim — the truck's bed crop,
   * traced over the body art — so it shows exactly while it's dressed. */
  private dressHidden(container: Container | null): void {
    if (!container) return;
    container.visible = true;
    container.filters = TARGET_HIGHLIGHT_FILTERS;
    this.undressers.push(() => {
      container.visible = false;
      container.filters = [];
    });
  }
}
