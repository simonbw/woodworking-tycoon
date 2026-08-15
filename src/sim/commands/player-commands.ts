import { Game } from "../../core/Game";
import { Player } from "../entities/Player";
import { Vector } from "../../game/Vectors";

/**
 * Player input commands: the only way the dispatcher (and the driver)
 * touch the player's transient input state. Held-key state is physical —
 * pressed and released — so each command is a plain setter; the entity's
 * tick does the rest.
 */

function player(game: Game): Player {
  return game.entities.getSingleton(Player);
}

/** Steer the body. Cleared by passing [0, 0]. */
export function setMoveInput(game: Game, input: Vector): void {
  player(game).moveInput = [...input];
}

/** Press or release the operate key. */
export function setOperating(game: Game, operating: boolean): void {
  player(game).operating = operating;
}

/** Press or release the wait key. */
export function setWaiting(game: Game, waiting: boolean): void {
  player(game).waiting = waiting;
}

/** Aim the broom's swath, or null to fall back to the facing. */
export function setSweepAim(game: Game, aim: Vector | null): void {
  player(game).sweepAim = aim ? [...aim] : null;
}
