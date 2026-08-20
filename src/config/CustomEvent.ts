import type { PayoutEvent } from "../game/PayoutEvent";
import type { SoundEvent } from "../game/SoundEvent";
import type { MachineEntity } from "../sim/entities/MachineEntity";

/**
 * Global event types that can be dispatched by the Game and listened to by entities.
 *
 * Beyond the two view cues (sound, payout), these are the sim's domain
 * events: past-tense facts, dispatched by whatever just mutated the world
 * (a command, or a system's minute pass) after the mutation lands.
 * Dispatch is synchronous, so any read after the mutating call sees
 * listeners' derived state already up to date.
 *
 * Rules of the road (issue #230): events announce facts, never issue
 * instructions; listeners maintain derived/view state and must not run
 * gameplay logic that dispatches further sim events (no cascades);
 * queries and single-owner mutations stay direct calls. Headless games
 * may have no listeners, and the dispatch is a no-op. Granularity is
 * deliberately coarse — a listener that wants finer grain re-reads the
 * entities it cares about; splitting an event later is cheap.
 *
 * Continuous motion is not an event: the player's body crossing the
 * floor, the shopper's walk through the aisles, dust settling, customers
 * strolling, and the clock's tick all change every frame or every sim
 * minute and are read directly by whoever draws or derives from them.
 * Events cover the discrete mutations.
 *
 * Two events issue #230 sketched are deliberately absent: a machine
 * never moves in place (carrying is a `machineRemoved` at pickup and a
 * `machineAdded` at set-down), and bench work never needed its own event
 * (every bench mutation is a machine-state write, so
 * `machineStateChanged` covers the bench stage's whole input).
 */
export type CustomEvents = {
  /**
   * A sound cue emitted by the simulation (the old world's pendingSounds
   * queue, as an event). Sim entities and commands dispatch it; the sound
   * view layer (phase 8) listens. Headless games have no listener and the
   * dispatch is a no-op.
   */
  sound: { sound: SoundEvent };
  /**
   * A completed sale, announced so it can be celebrated (the old world's
   * pendingPayouts queue, as an event). The StreetSystem dispatches it;
   * the reward-flight view layer (phase 8) listens. Headless games have
   * no listener and the dispatch is a no-op.
   */
  payout: { payout: PayoutEvent };

  /** A machine was set down on the floor and stands there now. */
  machineAdded: { machine: MachineEntity };
  /**
   * A machine left the floor (hoisted onto the player's shoulders). The
   * entity is already destroyed; the reference carries its last state.
   */
  machineRemoved: { machine: MachineEntity };
  /**
   * A standing machine's state object was replaced — staged or delivered
   * materials, settings, mounted tools, upgrades, power, bench layout,
   * operation progress. The payload names the entity; the new state is
   * already on it.
   */
  machineStateChanged: { machine: MachineEntity };
  /** Loose stock on the floor changed: a pile added or picked up. */
  pilesChanged: Record<string, never>;
  /** Machine crates on the floor changed: delivered or hoisted up. */
  cratesChanged: Record<string, never>;
  /**
   * The player's discrete carried/trip state changed: the inventory in
   * the arms, the machine on the shoulders, or the away trip (leaving,
   * cart and scavenging updates, coming home). The body's continuous
   * motion is not announced (see the header).
   */
  playerChanged: Record<string, never>;
  /** The truck's cargo changed: bed stock or crated machines. */
  truckChanged: Record<string, never>;
  /** The for-sale stand's table changed: set out, taken back, or sold. */
  standChanged: Record<string, never>;
  /**
   * Shop-wide supplies changed: consumable stock, the clamp rack, or
   * upgrade storage.
   */
  suppliesChanged: Record<string, never>;
  /**
   * The cleaning gear changed: broom or vac bought, picked up, or set
   * down, or the dustpan/canister contents moved.
   */
  cleaningChanged: Record<string, never>;
  /**
   * The unlock ledger moved: money, reputation, xp and skills, unlock
   * flags, manual articles, or the tutorial tracks.
   */
  progressionChanged: Record<string, never>;
  /**
   * The whole world was replaced in one stroke — a new game, a save
   * load, or a test fixture. Listeners holding derived state treat it
   * as "everything changed".
   */
  worldLoaded: Record<string, never>;
};
