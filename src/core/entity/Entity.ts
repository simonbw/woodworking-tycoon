import { CustomEvents } from "../../config/CustomEvent";
import { TickLayerName } from "../../config/tickLayers";
import { Game } from "../Game";
import { BaseGameEvents } from "./BaseGameEvents";
import { EventHandler, EventHandlerName } from "./EventHandler";
import { GameSprite } from "./GameSprite";
import { IoEvents } from "./IoEvents";

export type GameEventMap = BaseGameEvents & IoEvents & CustomEvents;

export type GameEventName = keyof GameEventMap;
export type GameEventHandlerFn<Key extends GameEventName> = (
  data: GameEventMap[Key],
) => void;
export type GameEventHandler<Key extends GameEventName> = Record<
  EventHandlerName<Key>,
  GameEventHandlerFn<Key>
>;

/** A thing that responds to game events. */
export interface Entity extends EventHandler<GameEventMap> {
  /** The game this entity belongs to. This should only be set by the Game. */
  game: Game;

  /** Whether this entity has been added to a game. */
  readonly isAdded: boolean;

  /**
   * Optional unique identifier for this entity within the game.
   *
   * When set, the entity can be retrieved via `game.entities.getById(id)`.
   * IDs must be unique per Game instance - adding an entity with a duplicate ID
   * will throw an error.
   *
   * Use this for singleton entities or entities that need to be referenced
   * by other parts of the codebase without direct references.
   *
   * @example
   * // In entity constructor or definition:
   * this.id = "player";
   *
   * // Later, retrieve the entity:
   * const player = game.entities.getById("player");
   */
  id?: string;
  /** Tags to find entities by */
  readonly tags: ReadonlyArray<string>;

  /** Children that get added/destroyed along with this entity */
  readonly children?: Entity[];

  /** Entity that has this entity as a child */
  parent?: Entity;

  /** Used for determining if this entity should stay around when we reach a transition
   * point, like the end of a level or we change to a new menu screen */
  readonly persistenceLevel: number;

  /** True if this entity will stop updating when the game is paused. */
  readonly pausable: boolean;

  /** Called to remove this entity from the game */
  destroy(): void;

  ///////////////////////
  /// Rendering Stuff ///
  ///////////////////////

  /** Pixi sprite that gets automatically added/removed from the renderer */
  sprite?: GameSprite;
  /** Pixi sprites that get automatically added/removed from the renderer */
  sprites?: GameSprite[];

  ////////////////////////
  /// Tick Layer Stuff ///
  ////////////////////////

  /**
   * The tick layer this entity updates on (defaults to "main" if not specified).
   * For single-layer entities, use this property.
   * For multi-layer entities, use `tickLayers` instead.
   */
  readonly tickLayer?: TickLayerName;

  /**
   * Multiple tick layers this entity updates on.
   * The onTick callback will be called once for each layer.
   * Use `tickLayer` for single-layer entities.
   */
  readonly tickLayers?: readonly TickLayerName[];
}
