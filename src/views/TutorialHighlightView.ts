import { Container, Filter } from "pixi.js";
import { OutlineFilter } from "pixi-filters/outline";
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
import { projectGameState } from "../sim/projection";
import { MachineView } from "./MachineView";
import { TruckView } from "./TruckView";

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
const TUTORIAL_HIGHLIGHT_FILTERS: Filter[] = [
  new OutlineFilter({
    thickness: 2.5,
    color: 0xf59e0b,
    alpha: 0.9,
    quality: 0.5,
  }),
  new OutlineFilter({
    thickness: 2,
    color: 0x1c1917,
    alpha: 0.35,
    quality: 0.5,
  }),
];

/** A view's outermost drawable, wherever the view class parks it. */
function viewRoot(entity: Entity): Container | null {
  for (const child of entity.children ?? []) {
    if (child instanceof MachineView || child instanceof TruckView) {
      return child.highlightRoot;
    }
    if (child.sprite) return child.sprite;
    if (child.sprites?.length) return child.sprites[0];
  }
  return null;
}

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
    const gs = projectGameState(game);
    if (gs.player.away) return;

    const coach = tutorialTargets(gs);

    // At close the corner card points home (see NightfallCard), and the
    // truck wears the same coach outline so the card and the world agree.
    const homewardNudge = isNight(gs) && !gs.player.away ? "truck" : null;

    // The stations the coach is sending the player to.
    for (const machine of game.entities.byConstructor(MachineEntity)) {
      if (coach.machineTypeIds.has(machine.state.machineTypeId)) {
        this.dress(viewRoot(machine));
      }
    }

    // The truck: the tutorial only ever points at the cab, so the whole
    // body wears the rim (the old TruckSprite's "truck" treatment; no
    // step targets the bed).
    if (coach.truck !== null || homewardNudge !== null) {
      const truck = game.entities.tryGetSingleton(TruckEntity);
      if (truck) this.dress(viewRoot(truck));
    }

    if (coach.stand) {
      const stand = game.entities.tryGetSingleton(StandEntity);
      if (stand) this.dress(viewRoot(stand));
    }

    if (coach.broom) {
      const broom = game.entities.tryGetSingleton(Broom);
      if (broom) this.dress(viewRoot(broom));
    }

    if (coach.matchesPile) {
      for (const pile of game.entities.byConstructor(MaterialPileEntity)) {
        if (coach.matchesPile(pile.material)) {
          this.dress(viewRoot(pile));
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
