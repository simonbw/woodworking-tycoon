import { TickLayerName } from "../config/tickLayers";
import { Persistence } from "../config/constants";
import { BaseEntity } from "../core/entity/BaseEntity";
import { Entity } from "../core/entity/Entity";
import { on } from "../core/entity/handler";

/**
 * The spend-to-advance clock's pace, rehosted on the entity engine.
 *
 * This is the new-world home of the model documented at length in
 * `src/game/time-flow.ts`: the day is a budget of working minutes, and how
 * fast the clock runs depends on what the player is doing. What changes
 * here is only the wiring. The old world computed `timeSpeed(gameState)`
 * from the whole state object; in the entity world the participants come
 * to TimeFlow instead:
 *
 *  - Entities that consume time (a busy body, an attended machine cut, a
 *    scavenging run's search) register a *spender* — a callback that
 *    returns true while they're actively spending. Any true spender puts
 *    the clock at working pace.
 *  - The player's held wait key and the night state are provided by
 *    their owners via the provider setters.
 *  - Whatever holds the world still — the player home in bed, a trip's
 *    curtain while the truck rolls — registers a *stop* the same way a
 *    spender registers, and any true stop freezes the clock.
 *
 * Each engine tick, TimeFlow resolves the speed with the same precedence
 * as the old `timeSpeed` — stopped > working > waiting > night-stop >
 * idle — and converts the engine's real dt into `gameDt`, the game
 * minutes the simulation should advance this tick. Sim entities consume
 * `gameDt`; the body, camera, and UI keep consuming raw dt.
 *
 * TimeFlow runs on the "input" tick layer so every sim layer of the same
 * engine tick sees one consistent gameDt.
 */
export type TimeSpeed = "waiting" | "working" | "idle" | "stopped";

/**
 * Working pace, in game minutes per real second — the familiar five
 * minutes a second (the old world's TICKS_PER_SECOND, one tick being one
 * shop minute).
 */
export const WORKING_PACE = 5;

/**
 * The idle creep: about five times real life, so a full day of pure
 * idling takes around two hours. Thinking is nearly free.
 */
export const IDLE_PACE = 5 / 60;

/**
 * The wait key's ramp. Holding it starts the clock at a gentle spin and
 * winds it up over a few seconds to twice working pace.
 */
export const WAIT_START_PACE = 2;
export const WAIT_MAX_PACE = 2 * WORKING_PACE;
export const WAIT_RAMP_SECONDS = 5;

/**
 * Ceiling on game minutes simulated in one engine tick, so a pace spike
 * can never tunnel the sim past events (a customer crossing the lot, a
 * phase boundary). At 60 engine ticks/s even full wait pace only wants
 * ~0.17 minutes a tick, so the cap is slack in normal play.
 */
export const MAX_GAME_MINUTES_PER_TICK = 1;

type BoolProvider = () => boolean;

export class TimeFlow extends BaseEntity implements Entity {
  id = "timeFlow";
  tickLayer: TickLayerName = "input";
  // Pace state is session-transient, never saved: it survives scene swaps
  // AND save loads (which clear at Persistence.Game).
  persistenceLevel: number = Persistence.Permanent;
  pausable = true;

  /** The game minutes the sim should advance this engine tick. */
  gameDt = 0;
  /**
   * Whole game minutes ("sim ticks") the quantized sim layers should
   * process this engine tick. The sim runs on one-minute steps: its
   * entities loop `wholeTicks` times inside their engine tick, which is
   * also how deep fast-forward substeps instead of tunneling. Usually 0, and
   * 1 when the minute accumulator carries; forced minutes (the driver's
   * `tick(n)`, the overnight batch) can make it large.
   */
  wholeTicks = 0;
  /** The speed resolved for this engine tick. */
  speed: TimeSpeed = "idle";

  /** Fractional game minutes accrued toward the next whole sim tick. */
  private minuteAccumulator = 0;
  /** Minutes queued by forceMinutes, drained on the next engine tick. */
  private forcedMinutes = 0;

  private spenders = new Set<BoolProvider>();
  private stops = new Set<BoolProvider>();
  private waitingProvider: BoolProvider = () => false;
  private nightProvider: BoolProvider = () => false;
  private waitHeldSeconds = 0;

  /**
   * Register a callback that returns true while its owner is actively
   * consuming the player's time. Returns an unregister function; entities
   * should call it from onDestroy.
   */
  registerSpender(spender: BoolProvider): () => void {
    this.spenders.add(spender);
    return () => this.spenders.delete(spender);
  }

  /** The player's held wait key. */
  setWaitingProvider(provider: BoolProvider): void {
    this.waitingProvider = provider;
  }

  /** Whether the day's budget is spent (the shop is closed for the night). */
  setNightProvider(provider: BoolProvider): void {
    this.nightProvider = provider;
  }

  /**
   * Register a callback that returns true while its owner is holding the
   * world still — the player home in bed, where the overnight passes as
   * one batch rather than a stream of live ticks, or a trip's curtain
   * while the truck rolls out of the driveway and back in. A stop
   * outranks every other pace. Returns an unregister function.
   */
  registerStop(stop: BoolProvider): () => void {
    this.stops.add(stop);
    return () => this.stops.delete(stop);
  }

  /**
   * Resolve how fast the clock should run right now. Same precedence as
   * the old `timeSpeed`: a hard stop wins; any spender means working
   * (so a held wait key can never speed up an attended cut); the wait
   * key spins the clock only while there's day left to give; otherwise
   * night stops the clock and daytime creeps.
   */
  resolveSpeed(): TimeSpeed {
    for (const stop of this.stops) {
      if (stop()) {
        return "stopped";
      }
    }
    for (const spender of this.spenders) {
      if (spender()) {
        return "working";
      }
    }
    const night = this.nightProvider();
    if (this.waitingProvider() && !night) {
      return "waiting";
    }
    return night ? "stopped" : "idle";
  }

  /** The wait pace after the key has been held this long. */
  static waitPace(heldSeconds: number): number {
    const t = Math.min(1, Math.max(0, heldSeconds / WAIT_RAMP_SECONDS));
    return WAIT_START_PACE + t * (WAIT_MAX_PACE - WAIT_START_PACE);
  }

  /**
   * Queue whole game minutes to run on the next engine tick, outside the
   * pace model. The sequence driver's `tick(n)` and the overnight batch
   * advance the world this way — the same one-minute passes, just many
   * of them in one engine tick.
   */
  /**
   * Minutes queued by forceMinutes that no tick has served yet — zero
   * means any charged leg (a store drive, say) has already run, which is
   * what the shell's deferred trip completions wait on.
   */
  get pendingForcedMinutes(): number {
    return this.forcedMinutes;
  }

  forceMinutes(minutes: number): void {
    this.forcedMinutes += minutes;
  }

  @on("tick")
  onTick(dt: number) {
    this.speed = this.resolveSpeed();

    // The ramp winds up only while the wait key is what's driving the
    // clock, and resets whenever anything else takes over.
    if (this.speed === "waiting") {
      this.waitHeldSeconds += dt;
    } else {
      this.waitHeldSeconds = 0;
    }

    // A forced engine tick serves exactly the forced minutes: the pace
    // model neither accrues nor advances alongside it, so the driver's
    // tick(n) (and the overnight batch) mean exactly n minutes — never
    // n plus whatever the live pace would have crept in.
    if (this.forcedMinutes > 0) {
      this.gameDt = 0;
      this.wholeTicks = this.forcedMinutes;
      this.forcedMinutes = 0;
      return;
    }

    const pace =
      this.speed === "working"
        ? WORKING_PACE
        : this.speed === "idle"
          ? IDLE_PACE
          : this.speed === "waiting"
            ? TimeFlow.waitPace(this.waitHeldSeconds)
            : 0;

    this.gameDt = Math.min(pace * dt, MAX_GAME_MINUTES_PER_TICK);

    // Carry whole minutes out to the quantized sim layers.
    this.minuteAccumulator += this.gameDt;
    const whole = Math.floor(this.minuteAccumulator);
    this.minuteAccumulator -= whole;
    this.wholeTicks = whole;
  }
}
