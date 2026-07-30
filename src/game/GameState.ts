import { ConsumableStock } from "./Consumable";
import { DustMap, SpeciesAmounts } from "./Dust";
import type { ManualArticleId } from "./manual";
import { ShopVacState } from "./ShopVac";
import { MachineState } from "./Machine";
import { InputMaterialWithQuantity } from "./Machine";
import { MaterialInstance } from "./Materials";
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
};

/**
 * A machine boxed up on the shop floor, waiting to be carried into place.
 * Shop-built stations (worktables) land crated at the bench that produced
 * them; purchased machines ride home in the truck's bed instead (see
 * TruckState). Crates don't block walking — stand on one and pick it up.
 * See docs/carrying-machines.md.
 */
export type MachineCrate = {
  readonly machine: MachineState;
  readonly position: Vector;
};

export type GameAction = (gameState: GameState) => GameState;

/**
 * What's riding in the truck's bed. Purchases and scavenged loot come
 * home here instead of materializing on the shop floor, and finished
 * work will leave from here (see docs/handing-work-over.md). Loaded and
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

/** Represents all of the state for the game simulation. This is what gets loaded/saved. Does not include UI state. */
export interface ProgressionState {
  readonly tutorialStage: number;
  readonly storeUnlocked: boolean;
  /** Reveals the lumberyard (S2S and rough stock) at the garage door. */
  readonly lumberyardUnlocked: boolean;
  /** Reveals the phone (listings + job board) in the top bar. */
  readonly marketplaceUnlocked: boolean;
  readonly commissionsCompleted: number;
  /** The floor has gotten properly dusty — puts up the one-time sweeping note. */
  readonly sweepingUnlocked: boolean;
  /** The one-time "sweep it up" note has been read. */
  readonly dustTipDismissed: boolean;
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
  /** Items up for sale on the marketplace, awaiting a buyer. */
  readonly listings: ReadonlyArray<MarketListing>;
  /** Open job offers the player hasn't accepted (refreshed daily). */
  readonly jobBoard: ReadonlyArray<JobOffer>;
  /**
   * Job template ids that were available at the last board refresh. A
   * template appearing for the first time (new machine, tool, or skill)
   * gets a guaranteed burst of offers — word gets around. See
   * job-generation.ts.
   */
  readonly seenJobTemplateIds: ReadonlyArray<string>;
  /** Jobs the player has accepted and not yet delivered or cancelled. */
  readonly acceptedJobs: ReadonlyArray<AcceptedJob>;
  /**
   * Per-product-category demand saturation, 0–1. Each sale of a category
   * dips its meter; meters recover over time. A missing key means full
   * demand (1) — keys are dropped once fully recovered.
   */
  readonly categoryDemand: Readonly<Record<string, number>>;
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
   * persisted (stripped in `saveLoad`); treat a missing value as empty.
   */
  readonly pendingSounds?: ReadonlyArray<SoundEvent>;
  /**
   * Transient queue of completed handoffs, drained by `RewardFlightLayer`
   * to fly the rewards to their readouts and show the client's card.
   * Optional and never persisted (stripped in `saveLoad`); treat a missing
   * value as empty.
   */
  readonly pendingPayouts?: ReadonlyArray<PayoutEvent>;
}

/** An item the player has put up for sale on the marketplace. */
export interface MarketListing {
  readonly id: string;
  readonly material: MaterialInstance;
  readonly askingPrice: number;
  /**
   * When the item went up at its current price. Repricing resets this —
   * the pity timer (see marketplace.ts) runs from here, and a price change
   * is a new offer to the market.
   */
  readonly listedAtTick: number;
}

/**
 * A generated one-off request on the job board. Jobs pay guaranteed money
 * for specific deliverables but never advance the story — that's what the
 * authored commission sequence is for.
 */
export interface JobOffer {
  readonly id: string;
  /** Who's asking — generated flavor. */
  readonly name: string;
  readonly description: string;
  readonly requiredMaterials: ReadonlyArray<InputMaterialWithQuantity>;
  /** Guaranteed payout. Never decays. */
  readonly basePay: number;
  /** Guaranteed reputation gain. Never decays. */
  readonly baseReputation: number;
  /** Offers rotate off the board a few days after this (see marketplace.ts). */
  readonly postedAtTick: number;
  /**
   * Fulfillable from scavenged pallet wood alone. The board always keeps at
   * least one such offer — a broke player's guaranteed path back to solvency.
   */
  readonly materialCostFree: boolean;
}

/** An accepted job: the tip and bonus reputation decay from acceptance. */
export interface AcceptedJob extends JobOffer {
  readonly acceptedAtTick: number;
}

/**
 * A work order in the authored commission sequence. The active commission is
 * derived from `progression.commissionsCompleted` (see commissionSequence.ts)
 * rather than stored in GameState.
 */
export interface Commission {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly requiredMaterials: ReadonlyArray<InputMaterialWithQuantity>;
  readonly rewardMoney: number;
  readonly rewardReputation: number;
  /** Who takes delivery at the garage door. */
  readonly client: string;
  /** What they say when you hand the work over. Shown on the payout card. */
  readonly thanks: string;
}
