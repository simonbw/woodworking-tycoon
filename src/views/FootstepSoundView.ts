import { Persistence } from "../config/constants";
import { BaseEntity } from "../core/entity/BaseEntity";
import { Entity } from "../core/entity/Entity";
import { Game } from "../core/Game";
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
 * The sound of a body walking: sample it every tick and play a footstep
 * whenever it has covered another stride's worth of floor (the cadence
 * itself is `footsteps.ts`, shared).
 *
 * It watches the body rather than the cell underfoot for the same
 * reason the sprite does — walking is a continuous affair, and a
 * cell-crossing cue would fire at the wrong rhythm anyway: cells are a
 * foot across and a stride is nearly three.
 *
 * One of these per walkable body: the woodworker on the shop's lot
 * (`walkingPlayer`, stood up in `engine-main`), and the shopper on the
 * store's floor (`StoreSceneRoot`). Add it after the thing that moves the
 * body so each tick's sample sees the position that tick just integrated.
 */

/** Steps are constant and frequent, so they sit well under the machines. */
const FOOTSTEP_GAIN = 0.28;

/** A body that can be heard walking, sampled fresh each tick. */
export interface WalkingBody {
  /** Where the body stands right now, in cells. */
  readonly position: Vector;
  /** Whether input is carrying it anywhere. */
  readonly moving: boolean;
}

/** The woodworker's own body, walking the shop and its lot. */
export function walkingPlayer(game: Game): WalkingBody | null {
  const player = game.entities.tryGetSingleton(Player);
  // Away on a trip, the body on screen belongs to the trip's scene.
  if (!player || player.away !== null) return null;
  const [ix, iy] = player.moveInput;
  return {
    position: [player.position[0], player.position[1]],
    moving: ix !== 0 || iy !== 0,
  };
}

export class FootstepSoundView extends BaseEntity implements Entity {
  persistenceLevel: number = Persistence.Permanent;
  pausable = false;

  private cadence: FootstepCadence = initialFootstepCadence;
  private lastPosition: Vector | null = null;

  constructor(
    private readonly sampleBody: (game: Game) => WalkingBody | null,
    persistenceLevel: number = Persistence.Permanent,
  ) {
    super();
    this.persistenceLevel = persistenceLevel;
  }

  onAdd() {
    // The first step of a new game shouldn't wait on a fetch.
    preloadSound("footstep");
  }

  @on("tick")
  onTick() {
    const body = this.sampleBody(this.game);
    if (!body) {
      this.lastPosition = null;
      return;
    }
    const position = body.position;
    const last = this.lastPosition;
    this.lastPosition = position;
    if (!last) return;

    const sample = advanceFootstepCadence(
      this.cadence,
      distanceBetween(last, position),
      body.moving,
    );
    this.cadence = sample.cadence;
    if (sample.stepped) {
      playSound("footstep", FOOTSTEP_GAIN, "room");
    }
  }
}
