import { cellCenter } from "../../game/player-motion";
import { Vector } from "../../game/Vectors";

/**
 * The player's continuous body, mutated in place at render rate and read
 * imperatively by sprites (PersonSprite, CarriedMachineLayer, ShopVacSprite)
 * inside `useTick` — never through React state, so walking costs zero
 * re-renders. GameState only ever sees the cell underfoot, synced by
 * PlayerMotionLayer when it changes.
 *
 * A module singleton, like the game's other render-side buses
 * (dustStampBus): there is one player, and both the DOM tree and the PIXI
 * tree need to reach this without threading props across the Application
 * boundary.
 */
export interface PlayerMotionState {
  /** Center of the body, in continuous cell coordinates. */
  pos: Vector;
  /** Facing, in radians, screen coordinates (0 = +x, π/2 = down). */
  heading: number;
  /** True while movement input is actually carrying the body somewhere. */
  moving: boolean;
}

export const playerMotion: PlayerMotionState = {
  pos: [0.5, 0.5],
  heading: 0,
  moving: false,
};

/** Teleport the body to a cell's center (game load, fixtures, respawn). */
export function snapPlayerMotionToCell(cell: Vector): void {
  playerMotion.pos = cellCenter(cell);
  playerMotion.moving = false;
}
