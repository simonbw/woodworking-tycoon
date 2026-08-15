import { DEFAULT_LAYER, LAYERS } from "../config/layers";
import { TICK_LAYERS, TickLayerName } from "../config/tickLayers";
import { EntityList } from "./EntityList";
import { V } from "./Vector";
import { createViewFor } from "./ViewRegistry";
import { Entity, GameEventMap } from "./entity/Entity";
import { eventHandlerName } from "./entity/EventHandler";
import { IoEvents } from "./entity/IoEvents";
import {
  GameRenderer2d,
  GameRenderer2dOptions,
} from "./graphics/GameRenderer2d";
import { IOManager } from "./io/IO";
import { lerp } from "./util/MathUtil";

export interface GameOptions {
  /**
   * Build no renderer, IO, or audio; touch no DOM; start no rAF. The game
   * only advances when `step()` or `advance()` is called. This is how tests
   * and other Node-side callers run the simulation.
   */
  headless?: boolean;
  /**
   * Source of randomness for the simulation. Pass a seeded generator for
   * deterministic runs. Sim code must use `game.random` and never
   * `Math.random` directly.
   */
  random?: () => number;
  /** Fixed simulation rate. */
  ticksPerSecond?: number;
  audio?: AudioContext;
}

/** Top level control structure */
export class Game {
  /** Keeps track of entities in lots of useful ways */
  readonly entities: EntityList;
  /** Keeps track of entities that are ready to be removed */
  readonly entitiesToRemove: Set<Entity>;
  /** True if this game was built without renderer, IO, and audio. */
  readonly headless: boolean;
  /** The random number source the simulation draws from. */
  readonly random: () => number;
  /** Renders the stage. Undefined when headless. */
  readonly renderer: GameRenderer2d | undefined;
  /** Manages keyboard/mouse/gamepad state and events. Undefined when headless. */
  private _io?: IOManager;
  get io(): IOManager {
    if (!this._io) {
      throw new Error(
        "io is not available (headless game, or init() not called yet)",
      );
    }
    return this._io;
  }

  /** The audio context that is connected to the output. Undefined when headless. */
  readonly audio: AudioContext | undefined;
  /** Volume control for all sound output by the game. Undefined when headless. */
  readonly masterGain: GainNode | undefined;
  /** Readonly. Whether or not the game is paused */
  paused: boolean = false;
  /** Readonly. Number of frames that have gone by */
  framenumber: number = 0;
  /** Readonly. Number of ticks that have gone by */
  ticknumber: number = 0;
  /** The timestamp when the last frame started */
  lastFrameTime: number = 0;
  /** Number of ticks that happen per second of game time */
  readonly ticksPerSecond: number;
  /** Number of seconds of game time to simulate per tick */
  readonly tickDuration: number;
  /**
   * Maximum sim backlog per frame of the render loop, in ticks. Half a
   * second: enough that a slow renderer (a throttled tab, headless
   * Chromium) keeps sim time tracking wall time, small enough that a
   * long hitch can't fling the world.
   */
  readonly maxTicksPerFrame = 30;

  /** ID of the current animation frame request, used for cancellation */
  private animationFrameId: number = 0;
  /** Whether the game has been destroyed */
  private destroyed: boolean = false;
  /** Whether the animation-frame loop is currently running. */
  private looping: boolean = false;
  /** Depth of event dispatch we're currently inside (guards entity cleanup). */
  private dispatching: number = 0;

  /** Total amount of game time that has elapsed */
  elapsedTime: number = 0;
  /** Total amount of game time that has elapsed while not paused */
  elapsedUnpausedTime: number = 0;
  /** Keep track of how long each frame is taking on average */
  averageFrameDuration = 1 / 60;

  /** The camera. Throws when headless — sim code has no business with it. */
  get camera() {
    if (!this.renderer) {
      throw new Error("camera is not available on a headless game");
    }
    return this.renderer.camera;
  }

  get averageDt() {
    return this.slowMo / (this.averageFrameDuration * this.ticksPerSecond);
  }

  private _slowMo: number = 1.0;
  /** Multiplier of time that passes during tick */
  get slowMo() {
    return this._slowMo;
  }

  set slowMo(value: number) {
    if (value != this._slowMo) {
      this._slowMo = value;
      this.dispatch("slowMoChanged", { slowMo: this._slowMo });
    }
  }

  /**
   * Create a new Game.
   * NOTE: You must call .init() before actually using the game.
   */
  constructor({
    headless = false,
    random,
    audio,
    ticksPerSecond = 60,
  }: GameOptions = {}) {
    this.entities = new EntityList();
    this.entitiesToRemove = new Set();
    this.headless = headless;
    this.random = random ?? Math.random;

    this.ticksPerSecond = ticksPerSecond;
    this.tickDuration = 1.0 / this.ticksPerSecond;

    if (!headless) {
      this.renderer = new GameRenderer2d(
        LAYERS,
        DEFAULT_LAYER,
        this.onResize.bind(this),
      );
      this.audio = audio ?? new AudioContext();
      this.masterGain = this.audio.createGain();
      this.masterGain.connect(this.audio.destination);
    }
  }

  /**
   * Initialize the game. With a renderer, this builds the canvas and IO and
   * starts the animation-frame loop (unless autoStart is false). Headless
   * games have nothing to initialize; init() is a no-op so callers can treat
   * both alike.
   */
  async init({
    rendererOptions = {},
    autoStart = true,
  }: {
    rendererOptions?: GameRenderer2dOptions;
    autoStart?: boolean;
  } = {}) {
    if (this.headless) {
      return;
    }
    await this.renderer!.init(rendererOptions);
    // IO events don't respect pause state
    const dispatchIo = <E extends keyof IoEvents>(
      event: E,
      data: IoEvents[E],
    ) => this.dispatch(event, data as GameEventMap[E], false);
    this._io = new IOManager(this.renderer!.canvas, dispatchIo);
    this.addEntity(this.renderer!.camera);

    if (autoStart) {
      this.startLoop();
    }
  }

  /**
   * Start the animation-frame loop. Called automatically by init() unless
   * autoStart is false. Safe to call if the loop is already running.
   */
  startLoop() {
    if (this.looping || this.destroyed || this.headless) return;
    this.looping = true;
    this.lastFrameTime = window.performance.now();
    this.animationFrameId = window.requestAnimationFrame((t) => this.loop(t));
  }

  /**
   * Stop the animation-frame loop. The game will not advance until
   * startLoop() is called again.
   */
  stopLoop() {
    this.looping = false;
    if (!this.headless) {
      window.cancelAnimationFrame(this.animationFrameId);
    }
  }

  /** See pause() and unpause(). */
  togglePause() {
    if (this.paused) {
      this.unpause();
    } else {
      this.pause();
    }
  }

  /** Called when renderer is resized */
  onResize(size: [number, number]) {
    this.dispatch("resize", { size: V(size) });
  }

  /**
   * Pauses the game. This calls onPause() handlers and stops updating
   * `pausable` entities.
   */
  pause() {
    if (!this.paused) {
      this.paused = true;
      this.dispatch("pause", undefined);
    }
  }

  /** Resumes the game and calls onUnpause() handlers. */
  unpause() {
    this.paused = false;
    this.dispatch("unpause", undefined);
  }

  /** Destroy the game and clean up all resources. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    this.stopLoop();

    // Destroy all entities
    for (const entity of this.entities) {
      this.cleanupEntity(entity);
    }
    this.entitiesToRemove.clear();

    this._io?.destroy();
    this.renderer?.destroy();
    this.audio?.close();
  }

  /** Dispatch an event. */
  dispatch<EventName extends keyof GameEventMap>(
    eventName: EventName,
    data: GameEventMap[EventName],
    respectPause = true,
  ) {
    const effectivelyPaused = respectPause && this.paused;
    this.dispatching += 1;
    try {
      for (const entity of this.entities.getHandlers(eventName)) {
        if (entity.isAdded && !(effectivelyPaused && entity.pausable)) {
          const functionName = eventHandlerName(eventName);
          const handler = entity[functionName];
          if (typeof handler !== "function") {
            console.error(
              `Entity ${entity.constructor.name} registered for "${eventName}" but has no ${functionName} method`,
              entity,
            );
            continue;
          }
          handler.call(entity, data);
        }
      }
    } finally {
      this.dispatching -= 1;
    }
  }

  /** Add an entity to the game. */
  addEntity = <T extends Entity>(entity: T): T => {
    entity.game = this;
    if (entity.onAdd) {
      entity.onAdd({ game: this });
    }

    // If the entity was destroyed during it's onAdd, we shouldn't add it
    if (!entity.isAdded) {
      return entity;
    }

    this.entities.add(entity);

    if (this.renderer) {
      if (entity.sprite) {
        this.renderer.addSprite(entity.sprite);
        entity.sprite.owner = entity;
      }
      if (entity.sprites) {
        for (const sprite of entity.sprites) {
          this.renderer.addSprite(sprite);
          sprite.owner = entity;
        }
      }

      if (entity.onResize) {
        entity.onResize({ size: this.renderer.getSize() });
      }
    }

    if (entity.children) {
      for (const child of entity.children) {
        if (!child.isAdded) {
          this.addEntity(child);
        }
      }
    }

    // Pair the entity with its view, if one is registered and we can render.
    // The view rides along as a child so it's destroyed with its sim entity.
    if (this.renderer) {
      this.spawnRegisteredView(entity);
    }

    if (entity.onAfterAdded) {
      entity.onAfterAdded({ game: this });
    }

    return entity;
  };

  /**
   * Spawn the registered view for a sim entity as its child, if one is
   * registered and none is attached. Views are tagged `isRegistryView`
   * so scene swaps can tear them down and respawn them (the shell's
   * SceneDirector re-pairs the surviving sim world when a venue returns).
   */
  spawnRegisteredView(entity: Entity): void {
    if (!this.renderer) return;
    if (entity.children?.some((child) => child.isRegistryView)) return;
    const view = createViewFor(entity);
    if (!view) return;
    view.isRegistryView = true;
    if (hasAddChild(entity)) {
      entity.addChild(view);
    } else {
      view.parent = entity;
      entity.children?.push(view);
      this.addEntity(view);
    }
  }

  /** Shortcut for adding multiple entities. */
  addEntities<T extends readonly Entity[]>(...entities: T): T {
    for (const entity of entities) {
      this.addEntity(entity);
    }
    return entities;
  }

  /**
   * Remove an entity from the game. If we're in the middle of dispatching
   * events, the entity is actually removed at the end of the current pass;
   * it stops receiving events immediately either way.
   */
  removeEntity(entity: Entity) {
    (entity as { game: Game | undefined }).game = undefined;
    if (this.dispatching > 0) {
      this.entitiesToRemove.add(entity);
    } else {
      this.cleanupEntity(entity);
    }
    return entity;
  }

  /**
   * Removes all non-persistent entities from the game scene.
   * Only removes top-level entities (those without parents) to avoid double-cleanup.
   *
   * @param persistenceThreshold - Entities with persistence level <= this value will be removed (default: 0)
   */
  clearScene(persistenceThreshold = 0) {
    for (const entity of this.entities) {
      if (
        entity.isAdded && // Not already destroyed
        !this.entitiesToRemove.has(entity) && // not already about to be destroyed
        entity.persistenceLevel <= persistenceThreshold &&
        !entity.parent // We only wanna deal with top-level things, let parents handle the rest
      ) {
        entity.destroy();
      }
    }
  }

  private timeToSimulate = 0.0;
  /**
   * Maximum renders per second, or null to draw every frame. E2E builds
   * cap this so headless Chromium isn't saturated by the render loop.
   */
  renderFpsCap: number | null = null;
  /** Timestamp of the last frame actually drawn. */
  private lastRenderTime = -Infinity;

  /** The animation-frame loop: advance sim time, then render. */
  private loop(time: number): void {
    if (this.destroyed) return;

    this.framenumber += 1;

    const lastFrameDuration = (time - this.lastFrameTime) / 1000;
    this.lastFrameTime = time;

    // Keep a rolling average
    if (0 < lastFrameDuration && lastFrameDuration < 0.3) {
      // Ignore weird durations because they're probably flukes from the user
      // changing to a different tab/window or loading a new level or something
      this.averageFrameDuration = lerp(
        this.averageFrameDuration,
        lastFrameDuration,
        0.05,
      );
    }

    // Accrue the frame's ACTUAL elapsed wall time (clamped against
    // hitches), not the rolling fps estimate: on a slow renderer the
    // estimate lags and sim time falls behind the clock on the wall.
    const renderDt = Math.min(
      lastFrameDuration > 0 ? lastFrameDuration : this.tickDuration,
      0.25,
    );

    this.slowTick(renderDt * this.slowMo);

    // Cap the backlog so a long frame (tab switch, breakpoint) doesn't make
    // us simulate minutes in one go.
    this.timeToSimulate = Math.min(
      this.timeToSimulate + renderDt * this.slowMo,
      this.tickDuration * this.maxTicksPerFrame,
    );
    this.timeToSimulate = this.advance(this.timeToSimulate);

    // A capped render rate (test builds) skips draws, never sim time: the
    // loop keeps advancing every frame and hands the thread back between
    // the frames it doesn't draw.
    if (
      this.renderFpsCap === null ||
      time - this.lastRenderTime >= 1000 / this.renderFpsCap
    ) {
      this.lastRenderTime = time;
      this.render(renderDt);
    }

    // Request next frame at END to prevent concurrent loops
    if (this.looping) {
      this.animationFrameId = window.requestAnimationFrame((t) => this.loop(t));
    }
  }

  /**
   * Advance the simulation by as many whole fixed ticks as fit in the given
   * number of seconds. Returns the unsimulated remainder.
   */
  advance(seconds: number): number {
    let remaining = seconds;
    while (remaining >= this.tickDuration) {
      remaining -= this.tickDuration;
      this.tick(this.tickDuration);
    }
    return remaining;
  }

  /** Advance the simulation synchronously by a whole number of fixed ticks. */
  step(ticks: number): void {
    for (let i = 0; i < ticks; i++) {
      this.tick(this.tickDuration);
    }
  }

  /**
   * Calculates and returns the current screen frames per second based on average frame duration.
   * @returns The current FPS rounded to the nearest integer
   */
  getScreenFps(): number {
    const duration = this.averageFrameDuration;
    return Math.round(1.0 / duration);
  }

  /** Actually remove all the entities slated for removal from the game. */
  private cleanupEntities() {
    for (const entity of this.entitiesToRemove) {
      this.cleanupEntity(entity);
    }
    this.entitiesToRemove.clear();
  }

  private cleanupEntity(entity: Entity) {
    (entity as { game: Game | undefined }).game = undefined; // This should be done by `removeEntity`, but better safe than sorry
    this.entities.remove(entity);

    if (this.renderer) {
      if (entity.sprite) {
        this.renderer.removeSprite(entity.sprite);
        entity.sprite.destroy({ children: true });
      }
      if (entity.sprites) {
        for (const sprite of entity.sprites) {
          this.renderer.removeSprite(sprite);
          sprite.destroy({ children: true });
        }
      }
    }

    if (entity.onDestroy) {
      entity.onDestroy({ game: this });
    }
  }

  /** Run one fixed tick of the simulation. */
  private tick(dt: number) {
    this.ticknumber += 1;
    this.elapsedTime += dt;
    if (!this.paused) {
      this.elapsedUnpausedTime += dt;
    }

    this.dispatch("beforeTick", dt);

    // Dispatch tick events layer by layer
    for (const layerName of TICK_LAYERS) {
      this.dispatchTickForLayer(layerName, dt);
    }

    this.dispatch("afterTick", undefined);

    this.cleanupEntities();
  }

  /** Dispatch tick event to entities on a specific layer */
  private dispatchTickForLayer(layerName: TickLayerName, dt: number): void {
    const effectivelyPaused = this.paused;
    this.dispatching += 1;
    try {
      for (const entity of this.entities.getTickersOnLayer(layerName)) {
        if (entity.isAdded && !(effectivelyPaused && entity.pausable)) {
          entity.onTick?.(dt);
        }
      }
    } finally {
      this.dispatching -= 1;
    }
  }

  /** Called once per frame, before normal ticks */
  private slowTick(dt: number) {
    this.dispatch("slowTick", dt);
  }

  /** Render the current frame. Does nothing when headless. */
  render(dt: number) {
    if (!this.renderer) {
      return;
    }
    this.cleanupEntities();
    this.dispatch("render", dt);
    this.dispatch("lateRender", dt);
    this.cleanupEntities();
    this.renderer.render();
  }
}

function hasAddChild(
  entity: Entity,
): entity is Entity & { addChild(child: Entity): Entity } {
  return typeof (entity as { addChild?: unknown }).addChild === "function";
}
