import { useTick } from "@pixi/react";
import React, { useEffect, useRef } from "react";
import {
  advanceFootstepCadence,
  distanceBetween,
  FootstepCadence,
  initialFootstepCadence,
} from "../../game/footsteps";
import { Vector } from "../../game/Vectors";
import { playSound, preloadSound } from "../../utils/sfx";
import { playerMotion } from "../world-view/playerMotionStore";

/**
 * The sound of the woodworker walking. Samples the continuous body every
 * frame and plays a footstep whenever it has covered another stride's worth
 * of floor (see `footsteps.ts` for the cadence).
 *
 * It reads the body directly rather than game state for the same reason
 * `PersonSprite` does: walking is a 60fps affair that deliberately causes no
 * React renders, and a cell-crossing cue would fire at the wrong rhythm
 * anyway — cells are a foot across and a stride is nearly three.
 *
 * Renders nothing. Mounted after `PlayerMotionLayer` in `ShopView` so each
 * frame's sample sees the position that frame just integrated.
 */

/** Steps are constant and frequent, so they sit well under the machines. */
const FOOTSTEP_GAIN = 0.28;

export const FootstepSoundLayer: React.FC = () => {
  const cadence = useRef<FootstepCadence>(initialFootstepCadence);
  const lastPos = useRef<Vector>(playerMotion.pos);

  useEffect(() => {
    // The first step of a new game shouldn't wait on a fetch.
    preloadSound("footstep");
  }, []);

  useTick(() => {
    const pos = playerMotion.pos;
    const distance = distanceBetween(lastPos.current, pos);
    lastPos.current = pos;

    // `moving` is false whenever the body isn't being carried anywhere by
    // input — paused, away on a trip, busy sweeping — so those go quiet
    // without this layer knowing about any of them.
    const sample = advanceFootstepCadence(
      cadence.current,
      distance,
      playerMotion.moving,
    );
    cadence.current = sample.cadence;
    if (sample.stepped) {
      playSound("footstep", FOOTSTEP_GAIN, "room");
    }
  });

  return null;
};
