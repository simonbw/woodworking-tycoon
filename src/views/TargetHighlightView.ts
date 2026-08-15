import { Container, Filter } from "pixi.js";
import { OutlineFilter } from "pixi-filters/outline";
import { Persistence } from "../config/constants";
import { BaseEntity } from "../core/entity/BaseEntity";
import { Entity } from "../core/entity/Entity";
import { on } from "../core/entity/handler";
import { resolveInteract } from "../game/interact";
import { TargetingState } from "../shell/dispatch/TargetingState";
import { MachineEntity } from "../sim/entities/MachineEntity";
import { MaterialPileEntity } from "../sim/entities/MaterialPileEntity";
import { Player } from "../sim/entities/Player";
import { projectGameState } from "../sim/projection";

/**
 * The in-world targeting treatment — the old targetHighlight.ts filters
 * applied by an entity instead of React props. The machine the player
 * stands at and the pile E would pick up wear the same white rim, so
 * "this is the target" reads the same for stations and stock.
 */
const TARGET_HIGHLIGHT_FILTERS: Filter[] = [
  new OutlineFilter({
    thickness: 2.5,
    color: 0xffffff,
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
    if (child.sprite) return child.sprite;
    if (child.sprites?.length) return child.sprites[0];
  }
  return null;
}

export class TargetHighlightView extends BaseEntity implements Entity {
  persistenceLevel: number = Persistence.Permanent;
  pausable = false;

  private dressed: Container[] = [];

  @on("render")
  onRender() {
    // Undress last frame's targets…
    for (const container of this.dressed) {
      container.filters = [];
    }
    this.dressed = [];

    const game = this.game;
    if (!game.entities.tryGetSingleton(Player)) return;
    const targeting = game.entities.tryGetSingleton(TargetingState);
    if (!targeting) return;
    const gs = projectGameState(game);
    if (gs.player.away) return;

    // …and dress this frame's: the targeted machine…
    const targeted = targeting.targeted();
    if (targeted) {
      const root = viewRoot(targeted);
      if (root) {
        root.filters = TARGET_HIGHLIGHT_FILTERS;
        this.dressed.push(root);
      }
    }

    // …and the pile E would pick up.
    const action = resolveInteract(gs, targeted?.view(), targeting.pileOffset);
    if (action?.kind === "pick-up-floor") {
      for (const entity of game.entities.byConstructor(MaterialPileEntity)) {
        if (entity.material.id === action.target.material.id) {
          const root = viewRoot(entity);
          if (root) {
            root.filters = TARGET_HIGHLIGHT_FILTERS;
            this.dressed.push(root);
          }
          break;
        }
      }
    }
  }
}
