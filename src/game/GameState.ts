import { ConsumableStock } from "./Consumable";
import { DustMap, SpeciesAmounts } from "./Dust";
import type { ManualArticleId } from "./manual";
import { ShopVacState } from "./ShopVac";
import { MachineState } from "./Machine";
import { MaterialInstance } from "./Materials";
import type { Customer } from "./stand";
import { PayoutEvent } from "./PayoutEvent";
import { SkillId } from "./Skill";
import { SoundEvent } from "./SoundEvent";
import { UpgradeId } from "./Upgrade";
import { Person } from "./Person";
import { ShopInfo } from "./ShopInfo";
import { Vector } from "./Vectors";

export type MaterialPile = {
  material: MaterialInstance;
  position: Vector;
  /**
   * How the piece lies, in radians, world frame — the orientation it was
   * dropped in. 0 is square to the shop with long stock running down the
   * y axis (the way material sprites draw); a piece set down mid-stride
   * keeps the carrier's heading.
   */
  rotation: number;
};

/**
 * A machine boxed up on the shop floor, waiting to be carried into place.
 * Shop-built stations (worktables) land crated at the bench that produced
 * them; purchased machines ride home in the truck's bed instead (see
 * TruckState). Crates don't block walking — stand on one and pick it up.
 * See game-actions/machine-actions.ts.
 */
export type MachineCrate = {
  readonly machine: MachineState;
  readonly position: Vector;
};

export type GameAction = (gameState: GameState) => GameState;

/**
 * What's riding in the truck's bed. Purchases and scavenged loot come
 * home here instead of materializing on the shop floor. Loaded and
 * unloaded standing at the bed — the tailgate end, backed up near the
 * garage door. The bed is unbounded — hauling is what a truck is for;
 * the player's hands (HAND_CAPACITY) are what meter the trips to it.
 */
export type TruckState = {
  /** Loose stock in the bed. */
  readonly bed: ReadonlyArray<MaterialInstance>;
  /** Machines still crated, lying in the bed after a store run. */
  readonly crates: ReadonlyArray<MachineState>;
};

/**
 * The tutorial tracks, each a to-do card of its own: the guided opening,
 * and the sweeping lesson that goes up when the floor first gets properly
 * dusty. Declared here rather than in tutorial.ts so the state can name
 * them without importing the goal tables (tutorial.ts imports GameState).
 */
export const TUTORIAL_TRACK_IDS = ["opening", "dust"] as const;
export type TutorialTrackId = (typeof TUTORIAL_TRACK_IDS)[number];

/** One tutorial track's ratchet (see tutorial.ts). */
export interface TutorialTrackProgress {
  /**
   * How far the track's walk has gotten: an index into its flattened
   * steps, moved forward by the milestone pass and never backward. Equal
   * to the step count once every box is ticked.
   */
  readonly step: number;
  /** The player retired the card early ("Skip"). One way, like an unlock. */
  readonly dismissed: boolean;
}

/** Represents all of the state for the game simulation. This is what gets loaded/saved. Does not include UI state. */
export interface ProgressionState {
  /** Each tutorial track's walk index and skip flag, by track. */
  readonly tutorials: Readonly<Record<TutorialTrackId, TutorialTrackProgress>>;
  readonly storeUnlocked: boolean;
  /** Reveals the lumberyard (S2S and rough stock) at the garage door. */
  readonly lumberyardUnlocked: boolean;
  /** Lifetime pieces sold off the for-sale stand (see stand.ts). */
  readonly salesCompleted: number;
  /** The floor has gotten properly dusty — begins the sweeping tutorial track. */
  readonly sweepingUnlocked: boolean;
  /** Shop-manual articles revealed so far (one-way, like the flags above). */
  readonly unlockedArticles: ReadonlyArray<ManualArticleId>;
  /** Articles the player has opened — drives the manual's NEW markers. */
  readonly readArticles: ReadonlyArray<ManualArticleId>;
  /** Lifetime craft XP (never spent — levels derive from it). */
  readonly xp: number;
  /** Unspent skill points (1 per level gained). */
  readonly skillPoints: number;
  readonly unlockedSkills: ReadonlyArray<SkillId>;
}

export interface GameState {
  readonly tick: number;
  /**
   * Which calendar day the shop is on, counting from 1. Advances only by
   * sleeping — driving home at the end of the day — never by the tick
   * counter rolling over (see time-flow.ts).
   */
  readonly day: number;
  /**
   * The tick this morning started on. `tick - dayStartTick` is how much
   * of today's working-minute budget has been spent; past TICKS_PER_DAY
   * the shop is closed for the night (see time-flow.ts).
   */
  readonly dayStartTick: number;
  readonly money: number;
  readonly reputation: number;
  readonly materialPiles: ReadonlyArray<MaterialPile>;
  /**
   * Shop-wide supplies (nails, finish oil, …). Not physical items — recipes
   * draw amounts straight from this stock. See Consumable.ts.
   */
  readonly consumables: ConsumableStock;
  /**
   * How many clamps the shop owns. Unlike consumables these come back: a
   * glue-up ties some up until it's cured, and the count in use is derived
   * from the machines running (see Clamp.ts). Owning more buys parallel
   * glue-ups.
   */
  readonly clamps: number;
  readonly machines: ReadonlyArray<MachineState>;
  /** Machines still in their delivery crates (see MachineCrate). */
  readonly machineCrates: ReadonlyArray<MachineCrate>;
  /** The pickup in the driveway and everything in its bed. */
  readonly truck: TruckState;
  readonly shopInfo: ShopInfo;
  readonly player: Person;
  readonly storage: {
    /** Worktable upgrades owned but not installed (see Upgrade.ts). */
    upgrades: ReadonlyArray<UpgradeId>;
  };
  readonly progression: ProgressionState;
  /**
   * Finished pieces set out on the for-sale stand at the end of the
   * driveway, oldest first. Physical goods on a physical table: carried
   * down and set out by hand, taken back the same way, and sold off it
   * when a passing customer picks one (see stand.ts).
   */
  readonly stand: ReadonlyArray<MaterialInstance>;
  /**
   * The people out walking past the lot right now. They stroll the
   * sidewalk line below the driveway, pause at a stocked stand, and
   * sometimes buy — see standTickPass in game-actions/stand-actions.ts.
   */
  readonly customers: ReadonlyArray<Customer>;
  /**
   * Sawdust on the shop floor: per-cell (keyed "x,y"), per-species
   * amounts, dropped when clean. Machines lay it down while they cut;
   * the render layer draws it and rebuilds the grime from this on load.
   * See Dust.ts and docs/dust-and-cleaning.md.
   */
  readonly dust: DustMap;
  /** The shop vac, once bought (see ShopVac.ts). Null until then. */
  readonly shopVac: ShopVacState | null;
  /** Whether the shop owns a broom yet — bought off the store's tool wall. */
  readonly broomOwned: boolean;
  /**
   * Where the shop broom is resting; null while it's in the player's
   * hands (the same convention as the vac's parked position — see
   * HeldTool.ts). Meaningless until `broomOwned`.
   */
  readonly broomPosition: Vector | null;
  /**
   * Sawdust in the broom's dustpan, by species. Sweeping gathers into
   * it; it holds DUSTPAN_CAPACITY and has to be emptied at the garbage
   * can (a hold, like the vac's canister). Rides with the broom whether
   * it's in hand or leaning.
   */
  readonly dustpan: SpeciesAmounts;
  /**
   * Transient queue of sound cues emitted by the action(s) that produced this
   * state, drained by `GameSoundLayer` each render. Optional and never
   * persisted; treat a missing value as empty.
   */
  readonly pendingSounds?: ReadonlyArray<SoundEvent>;
  /**
   * Transient queue of completed sales, drained by `RewardFlightLayer`
   * to fly the rewards to their readouts. Optional and never persisted
   * treat a missing value as empty.
   */
  readonly pendingPayouts?: ReadonlyArray<PayoutEvent>;
}
