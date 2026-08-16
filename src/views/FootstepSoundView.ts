import { Persistence } from "../config/constants";
import { BaseEntity } from "../core/entity/BaseEntity";
import { Entity } from "../core/entity/Entity";
import { on } from "../core/entity/handler";
import {
  advanceFootstepCadence,
  distanceBetween,
  FootstepCadence,
  initialFootstepCadence,
} from "../game/footsteps";
import { Vector } from "../game/Vectors";
import { playSound, preloadSound } from "../utils/sfx";
import { Player } from "../sim/entities/Player";

/**
 * The sound of the woodworker walking: sample the body every tick and
 * play a footstep whenever it has covered another stride's worth of
 * floor (the cadence itself is `footsteps.ts`, shared).
 *
 * It watches the body rather than the cell underfoot for the same
 * reason the sprite does — walking is a continuous affair, and a
 * cell-crossing cue would fire at the wrong rhythm anyway: cells are a
 * foot across and a stride is nearly three.
 */

/** Steps are constant and frequent, so they sit well under the machines. */
const FOOTSTEP_GAIN = 0.28;

export class FootstepSoundView extends BaseEntity implements Entity {
  persistenceLevel: number = Persistence.Permanent;
  pausable = false;

  private cadence: FootstepCadence = initialFootstepCadence;
  private lastPosition: Vector | null = null;

  onAdd() {
    // The first step of a new game shouldn't wait on a fetch.
    preloadSound("footstep");
  }

  @on("tick")
  onTick() {
    const player = this.game.entities.tryGetSingleton(Player);
    if (!player || player.away !== null) {
      this.lastPosition = null;
      return;
    }
    const position: Vector = [player.position[0], player.position[1]];
    const last = this.lastPosition;
    this.lastPosition = position;
    if (!last) return;

    const [ix, iy] = player.moveInput;
    const sample = advanceFootstepCadence(
      this.cadence,
      distanceBetween(last, position),
      ix !== 0 || iy !== 0,
    );
    this.cadence = sample.cadence;
    if (sample.stepped) {
      playSound("footstep", FOOTSTEP_GAIN, "room");
    }
  }
}
