import { Container } from "pixi.js";
import { Persistence } from "../config/constants";
import { BaseEntity } from "../core/entity/BaseEntity";
import { Entity } from "../core/entity/Entity";
import { on } from "../core/entity/handler";
import { isNight } from "../game/time-flow";
import { tutorialTargets } from "../shell/hud/tutorial/tutorialTargets";
import { MachineEntity } from "../sim/entities/MachineEntity";
import { MaterialPileEntity } from "../sim/entities/MaterialPileEntity";
import { Player } from "../sim/entities/Player";
import { StandEntity } from "../sim/entities/StandEntity";
import { TruckEntity } from "../sim/entities/TruckEntity";
import { Broom } from "../sim/singletons/Broom";
import { projectTutorialFacts } from "../sim/projection";
import { Clock } from "../sim/singletons/Clock";
import {
  TUTORIAL_HIGHLIGHT_FILTERS,
  viewHighlightRoot,
} from "./targetHighlight";

/**
 * What the guided opening points at in the world (see game/tutorial.ts) —
 * the old shell's coach outlines (`targetHighlight.ts`'s tutorial
 * filters, threaded through ShopView's sprite props) applied by an
 * entity instead, the way TargetHighlightView applies the white rim.
 *
 * Deliberately a different color from the white targeting rim: white
 * means "the keys act on this, here, now", and orange means "go to this
 * next" — a thing you usually aren't standing at yet. When both apply
 * the white rim wins, because by then the tutorial's arrow has done its
 * job: this entity renders after TargetHighlightView (added later in
 * engine-main) and skips anything already dressed this frame.
 *
 * The homeward nudge rides along exactly as it did in ShopView: at
 * close the corner card points home, and the truck wears the same coach
 * outline so the card and the world agree.
 */
export class TutorialHighlightView extends BaseEntity implements Entity {
  persistenceLevel: number = Persistence.Permanent;
  pausable = false;

  private dressed: Container[] = [];

  @on("render")
  onRender() {
    // Undress last frame's targets — but only where the orange is still
    // ours, so a white rim that took the container over stays put.
    for (const container of this.dressed) {
      if (container.filters === TUTORIAL_HIGHLIGHT_FILTERS) {
        container.filters = [];
      }
    }
    this.dressed = [];

    const game = this.game;
    if (!game.entities.tryGetSingleton(Player)) return;
    const gs = projectTutorialFacts(game);
    if (gs.player.away) return;

    const coach = tutorialTargets(gs);

    // At close the corner card points home (see NightfallCard), and the
    // truck wears the same coach outline so the card and the world agree.
    const homewardNudge =
      isNight(game.entities.getSingleton(Clock)) && !gs.player.away
        ? "truck"
        : null;

    // The stations the coach is sending the player to.
    for (const machine of game.entities.byConstructor(MachineEntity)) {
      if (coach.machineTypeIds.has(machine.state.machineTypeId)) {
        this.dress(viewHighlightRoot(machine));
      }
    }

    // The truck: the tutorial only ever points at the cab, so the whole
    // body wears the rim (the old TruckSprite's "truck" treatment; no
    // step targets the bed).
    if (coach.truck !== null || homewardNudge !== null) {
      const truck = game.entities.tryGetSingleton(TruckEntity);
      if (truck) this.dress(viewHighlightRoot(truck));
    }

    if (coach.stand) {
      const stand = game.entities.tryGetSingleton(StandEntity);
      if (stand) this.dress(viewHighlightRoot(stand));
    }

    if (coach.broom) {
      const broom = game.entities.tryGetSingleton(Broom);
      if (broom) this.dress(viewHighlightRoot(broom));
    }

    if (coach.matchesPile) {
      for (const pile of game.entities.byConstructor(MaterialPileEntity)) {
        if (coach.matchesPile(pile.material)) {
          this.dress(viewHighlightRoot(pile));
        }
      }
    }
  }

  /** Rim a container in the coach's orange — unless the white targeting
   * rim already dressed it this frame (white wins). */
  private dress(container: Container | null): void {
    if (!container) return;
    const existing = container.filters;
    if (existing && (!Array.isArray(existing) || existing.length > 0)) return;
    container.filters = TUTORIAL_HIGHLIGHT_FILTERS;
    this.dressed.push(container);
  }
}
