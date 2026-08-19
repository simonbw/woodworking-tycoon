import { Persistence } from "../../config/constants";
import { BaseEntity } from "../../core/entity/BaseEntity";
import { Entity } from "../../core/entity/Entity";
import { on } from "../../core/entity/handler";
import { Player } from "../../sim/entities/Player";
import { TimeFlow } from "../../sim/TimeFlow";
import { playSound, preloadSound } from "../../utils/sfx";
import { ShellStore } from "../ShellStore";

/**
 * The theater around a trip. The simulation flips `player.away` in one
 * tick; this stretches that instant into a scene: the engine cranks,
 * the truck rolls down the driveway and off the lot, the screen dips to
 * black, and the destination is there when it comes back. Heading home
 * fades to black *over the destination* (`headHome` holds the return
 * until the screen is dark), then reveals the shop with the truck
 * backing up the driveway.
 *
 * The sim is untouched by any of it — `away` still flips before a frame
 * of the arrival plays, saves and ticks behave identically — so a save
 * loaded mid-trip just opens on the destination with no performance.
 * The truck's view reads the stage for its roll, and the HUD's fade
 * reads the curtain.
 *
 * The one thing the theater does hold is the clock: no game time passes
 * while the truck is rolling out or rolling in (it registers a TimeFlow
 * stop for those two stages). A trip's legs are charged as whole
 * minutes by the commands that start them, and forced minutes run
 * through a stop — so the drive is paid for exactly once, and a
 * scavenging run's first half-hour starts when its screen is up rather
 * than while the truck is still on the driveway.
 */

export type TruckStage = "parked" | "departing" | "away" | "arriving";

export const TRUCK_DEPART_SECONDS = 2.6;
/** When the wheels start moving within the departure — the first
 * stretch is the crank and the idle settling. */
export const TRUCK_ROLL_OUT_SECONDS = 1.4;
export const TRUCK_ARRIVE_SECONDS = 2.9;
/** How much of the arrival the truck spends rolling; the remainder is
 * the parking brake and the door. */
export const TRUCK_ROLL_IN_SECONDS = 1.7;
const FADE_SECONDS = 0.4;
/** The beat the shop needs to swap in behind the black. */
const REVEAL_DELAY_SECONDS = 0.12;

/**
 * The E2E build skips the staging entirely (specs click "Go" and expect
 * the destination that frame), same as the old shell's layer and the
 * same flag that caps the renderer.
 */
export const TRIP_TRANSITIONS_DISABLED = Number(process.env.E2E_RENDER_FPS) > 0;

export class TripTheater extends BaseEntity implements Entity {
  id = "tripTheater";
  persistenceLevel: number = Persistence.Permanent;
  pausable = false;

  private stageName: TruckStage = "parked";
  /** Seconds the current stage has been running. */
  private elapsed = 0;
  /** The black curtain, 0..1. */
  private curtain = 0;
  private curtainTarget = 0;
  /** Whether `away` was set the last time this looked. */
  private wasAway: boolean | null = null;
  /** A return held back until the screen is dark. */
  private pendingReturn: (() => void) | null = null;
  private pendingSeconds = 0;
  /** The TimeFlow this theater's stop is registered with, and the way
   * back off it. A shop is booted into the running game after this
   * entity is standing, and booting another replaces the TimeFlow, so
   * the registration is kept current from the tick rather than taken
   * once on add. */
  private heldFlow: TimeFlow | null = null;
  private releaseHold: (() => void) | null = null;

  onAdd() {
    // The crank should land with the click, not a fetch later.
    preloadSound("truck-start");
    preloadSound("truck-arrive");
  }

  @on("destroy")
  onDestroy() {
    this.releaseHold?.();
    this.releaseHold = null;
    this.heldFlow = null;
  }

  /** Where the truck is in its trip, as the presentation sees it. */
  stage(): TruckStage {
    return this.stageName;
  }

  /** Whether the curtain is holding the clock: the truck is rolling. */
  holdsTheClock(): boolean {
    return this.stageName === "departing" || this.stageName === "arriving";
  }

  /** How long the current stage has been running, in seconds. */
  stageElapsed(): number {
    return this.elapsed;
  }

  /** How black the screen is right now, 0..1. */
  fade(): number {
    return this.curtain;
  }

  /**
   * Head home: dip to black first, then apply the return — the
   * destination is what fades out, not the shop.
   */
  headHome(apply: () => void): void {
    if (TRIP_TRANSITIONS_DISABLED) {
      apply();
      return;
    }
    if (this.pendingReturn) return; // already on the way out
    this.curtainTarget = 1;
    this.pendingReturn = apply;
    this.pendingSeconds = FADE_SECONDS;
    this.bump();
  }

  /** Keep the clock's hold pointed at the live TimeFlow. */
  private trackTimeFlow(): void {
    const timeFlow = this.game.entities.tryGetSingleton(TimeFlow) ?? null;
    if (timeFlow === this.heldFlow) return;
    this.releaseHold?.();
    this.heldFlow = timeFlow;
    this.releaseHold =
      timeFlow?.registerStop(() => this.holdsTheClock()) ?? null;
  }

  @on("tick")
  onTick(dt: number) {
    this.trackTimeFlow();
    const away = this.game.entities.tryGetSingleton(Player)?.away != null;
    if (this.wasAway === null) {
      // First look (a fresh boot, or a save loaded mid-trip): take the
      // state as found, no performance.
      this.wasAway = away;
      this.setStage(away ? "away" : "parked");
      return;
    }
    if (away !== this.wasAway) {
      this.wasAway = away;
      this.begin(away);
    }

    this.elapsed += dt;
    this.advanceStage();
    this.advanceCurtain(dt);
    this.advancePendingReturn(dt);
  }

  /** Start the departure or the arrival. */
  private begin(away: boolean): void {
    if (TRIP_TRANSITIONS_DISABLED) {
      this.setStage(away ? "away" : "parked");
      this.curtain = 0;
      this.curtainTarget = 0;
      return;
    }
    if (away) {
      this.setStage("departing");
      // Dry, not through the garage reverb — the driveway is outdoors.
      playSound("truck-start", 0.7, "sfx");
      return;
    }
    // Home. The screen is already black (heading home and the scavenge
    // timer both fade before `away` clears); the shop swaps in
    // underneath, and the reveal rides the truck rolling in.
    this.curtain = 1;
    this.curtainTarget = 1;
    this.setStage("arriving");
    playSound("truck-arrive", 0.7, "sfx");
  }

  /** Walk the stage clock: departing → away, arriving → parked. */
  private advanceStage(): void {
    if (this.stageName === "departing") {
      if (this.elapsed >= TRUCK_DEPART_SECONDS - FADE_SECONDS) {
        this.curtainTarget = 1;
      }
      if (this.elapsed >= TRUCK_DEPART_SECONDS) {
        this.setStage("away");
        this.curtainTarget = 0;
      }
      return;
    }
    if (this.stageName === "arriving") {
      if (this.elapsed >= REVEAL_DELAY_SECONDS) this.curtainTarget = 0;
      if (this.elapsed >= REVEAL_DELAY_SECONDS + TRUCK_ARRIVE_SECONDS) {
        this.setStage("parked");
      }
    }
  }

  private advanceCurtain(dt: number): void {
    if (this.curtain === this.curtainTarget) return;
    const step = dt / FADE_SECONDS;
    this.curtain =
      this.curtainTarget > this.curtain
        ? Math.min(this.curtainTarget, this.curtain + step)
        : Math.max(this.curtainTarget, this.curtain - step);
    this.bump();
  }

  private advancePendingReturn(dt: number): void {
    if (!this.pendingReturn) return;
    this.pendingSeconds -= dt;
    if (this.pendingSeconds > 0) return;
    const apply = this.pendingReturn;
    this.pendingReturn = null;
    apply();
  }

  private setStage(next: TruckStage): void {
    if (next === this.stageName) return;
    this.stageName = next;
    this.elapsed = 0;
    this.bump();
  }

  private bump(): void {
    this.game.entities.tryGetSingleton(ShellStore)?.bump();
  }
}
