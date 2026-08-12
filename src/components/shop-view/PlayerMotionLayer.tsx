import { useTick } from "@pixi/react";
import { Ticker } from "pixi.js";
import React, { useCallback, useRef } from "react";
import { collisionWorld } from "../../game/machine-collision";
import { setPlayerPositionAction } from "../../game/game-actions/player-actions";
import {
  motionCell,
  playerWalkSpeed,
  stepPlayerMotion,
  workStance,
} from "../../game/player-motion";
import { Direction, Vector } from "../../game/Vectors";
import { benchSceneSlot } from "../bench-view/benchSceneSlot";
import { useApplyGameAction, useGameState } from "../useGameState";
import { playerMotion } from "../world-view/playerMotionStore";
import { useWalkingBody } from "../world-view/useWalkingBody";

/**
 * Walks the player around the shop and its lot every render frame, and
 * stamps the cell underfoot back into GameState whenever it changes.
 * Renders nothing — it's the bridge between the 60fps world of the body
 * and the tick-rate world of the simulation.
 *
 * GameState remains the authority on *which cell* the player occupies;
 * this layer is the authority on *where in it* they are. The general
 * machinery — reading the keys, integrating, spotting a teleport — is
 * `useWalkingBody`, shared with the other places the player walks. What
 * lives here is what's particular to the shop: its solids, its walking
 * speed, and the bench stance below.
 */
export const PlayerMotionLayer: React.FC<{ paused: boolean }> = ({
  paused,
}) => {
  const gameState = useGameState();
  const applyAction = useApplyGameAction();

  const stateRef = useRef(gameState);
  stateRef.current = gameState;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  // The dive (benchKey) whose step-in the body gave up on — wedged
  // against something on the way to the stance. Remembered so a blocked
  // walk doesn't shove at the obstacle every frame; a fresh dive tries
  // again.
  const stanceBlocked = useRef<string | null>(null);

  const onCellChange = useCallback(
    (cell: Vector, direction: Direction) => {
      applyAction(setPlayerPositionAction(cell, direction));
    },
    [applyAction],
  );

  const { walk, syncCell } = useWalkingBody({
    cell: gameState.player.position,
    direction: gameState.player.direction,
    onCellChange,
  });

  useTick((ticker: Ticker) => {
    const gs = stateRef.current;
    if (gs.player.away || pausedRef.current || (gs.player.busyTicks ?? 0) > 0) {
      playerMotion.moving = false;
      return;
    }

    // Leaning over a bench pins the walk keys (ShopView), and the body
    // steps into the standard working stance instead: centered on the
    // bench's operation cell, squared up to the top, so the dive's
    // zoomed-in look always finds the woodworker standing at the bench
    // properly. Same collision step as walking — the body slides around
    // whatever is in the way, and gives up rather than shoving if the
    // way is truly blocked.
    const lean = benchSceneSlot();
    if (lean && lean.target === 1) {
      const stance = workStance(lean.bench);
      if (stance) {
        playerMotion.heading = stance.heading;
        const dx = stance.pos[0] - playerMotion.pos[0];
        const dy = stance.pos[1] - playerMotion.pos[1];
        const distance = Math.hypot(dx, dy);
        if (distance < 0.01) {
          playerMotion.pos = stance.pos;
          playerMotion.moving = false;
        } else if (stanceBlocked.current !== lean.benchKey) {
          const speed = playerWalkSpeed(gs);
          // Never overshoot: the last step is cut to land exactly on the
          // stance. Reduced motion takes the whole way in one step, the
          // same cut the dive's ramp takes.
          const dt = lean.instant
            ? distance / speed
            : Math.min(ticker.deltaMS / 1000, 0.1, distance / speed);
          const next = stepPlayerMotion(
            playerMotion.pos,
            [dx / distance, dy / distance],
            speed,
            dt,
            collisionWorld(gs),
          );
          const remaining = Math.hypot(
            stance.pos[0] - next[0],
            stance.pos[1] - next[1],
          );
          if (remaining >= distance - 1e-6) {
            stanceBlocked.current = lean.benchKey;
          }
          playerMotion.moving = remaining < distance - 1e-6;
          playerMotion.pos = next;
        } else {
          playerMotion.moving = false;
        }
        // Facing the bench is the stance too, wherever the walk got to.
        syncCell(motionCell(playerMotion.pos), stance.direction);
      } else {
        playerMotion.moving = false;
      }
      return;
    }

    walk(ticker.deltaMS, playerWalkSpeed(gs), collisionWorld(gs));
  });

  return null;
};
