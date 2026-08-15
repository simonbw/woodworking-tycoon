import { Game } from "../Game";
import { V2d } from "../Vector";
import { Entity } from "./Entity";

export type BaseGameEvents = {
  /**
   * Called when added to the game, during the early phase of entity setup.
   *
   * At this point:
   * - `this.game` is set and accessible
   * - The entity is NOT yet in the EntityList
   * - Sprites are NOT yet in the renderer
   * - Children have NOT been added yet
   *
   * Use `onAdd` when you need access to `this.game` to complete initialization
   * but don't depend on children being set up.
   *
   * If the entity is destroyed during onAdd (e.g., via `this.destroy()`),
   * the entity will not be fully added to the game.
   *
   * @see onAfterAdded - Called after all setup is complete
   */
  add: { game: Game; parent?: Entity };
  /**
   * Called after the entity is fully added to the game.
   *
   * At this point:
   * - `this.game` is set and accessible
   * - The entity IS in the EntityList (can be found via tags, id, filters)
   * - Sprites ARE in the renderer
   * - All children HAVE been added
   * - `onResize` has been called if the entity has that handler
   *
   * Use `onAfterAdded` when you need to interact with the fully initialized
   * entity, such as querying other entities or relying on children being
   * present.
   *
   * @see onAdd - Called during early setup before children
   */
  afterAdded: { game: Game };
  /** Called before the tick happens */
  beforeTick: number;
  /** Called during the update tick, layer by layer (see config/tickLayers) */
  tick: number;
  /** Called after all tick layers have run, before rendering */
  afterTick: void;
  /** Called once per frame (not per tick) */
  slowTick: number;
  /** Called before rendering */
  render: number;
  /** Called _right_ before rendering. This is for special cases only */
  lateRender: number;
  /** Called when the game is paused */
  pause: void;
  /** Called when the game is unpaused */
  unpause: void;
  /** Called after being destroyed */
  destroy: { game: Game };
  /** Called when the renderer is resized or recreated for some reason */
  resize: { size: V2d };
  /** Called when the slow motion factor changes */
  slowMoChanged: { slowMo: number };
};
