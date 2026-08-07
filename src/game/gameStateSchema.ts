import { z } from "zod";
import { CONSUMABLE_TYPES } from "./Consumable";
import { GameState } from "./GameState";
import { MACHINE_TYPES } from "./Machine";
import { SKILL_IDS } from "./Skill";
import { TOOL_TYPES } from "./Tool";
import { UPGRADE_TYPES } from "./Upgrade";

/**
 * The shape a saved GameState must have to be worth loading. Parsed at the
 * load boundary (see saveLoad.ts) so a truncated or hand-edited save is
 * rejected up front instead of crashing ticks deep into a session.
 *
 * Granularity: strict about the state's structure — every slice present,
 * every container the right kind, every registry id a real one — and
 * deliberately loose inside MaterialInstance. The material union is big
 * and grows often; validating it field-by-field here would make this file
 * a second copy of Materials.ts that must be edited in lockstep. A
 * malformed material can only confuse the recipes it's fed to; a malformed
 * slice takes down the whole sim.
 */

const vectorSchema = z.tuple([z.number(), z.number()]);
const directionSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);

const idEnum = (registry: Record<string, unknown>) =>
  z.enum(Object.keys(registry) as [string, ...string[]]);

const machineIdSchema = idEnum(MACHINE_TYPES);
const toolIdSchema = idEnum(TOOL_TYPES);
const upgradeIdSchema = idEnum(UPGRADE_TYPES);
const skillIdSchema = z.enum(SKILL_IDS);
const consumableIdSchema = idEnum(CONSUMABLE_TYPES);

/** See note above: materials stay structural, not exhaustive. */
const materialSchema = z.object({ type: z.string() }).passthrough();

/** Species amounts keyed by species name (dust cells, vac canister). */
const speciesAmountsSchema = z.record(z.number());

const operationProgressSchema = z.object({
  status: z.enum(["notStarted", "inProgress", "finished"]),
  phaseIndex: z.number(),
  ticksRemaining: z.number(),
});

const machineStateSchema = z.object({
  machineTypeId: machineIdSchema,
  position: vectorSchema,
  rotation: directionSchema,
  selectedOperationId: z.string(),
  selectedParameters: z.record(z.union([z.number(), z.string()])).optional(),
  operationProgress: operationProgressSchema,
  inputMaterials: z.array(materialSchema),
  processingMaterials: z.array(materialSchema),
  outputMaterials: z.array(materialSchema),
  tools: z.array(toolIdSchema),
  storedMaterials: z.array(materialSchema).optional(),
  upgrades: z.array(upgradeIdSchema).optional(),
  poweredOn: z.boolean().optional(),
  benchLayout: z
    .record(
      z.object({
        xIn: z.number(),
        yIn: z.number(),
        angleDeg: z.number(),
        flipped: z.boolean(),
        // The orientation half of the arrangement: without these a
        // board tipped on edge (or stood on end) lay back flat on load
        onEdge: z.boolean().optional(),
        onEnd: z.boolean().optional(),
      }),
    )
    .optional(),
});

const awayTripSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("scavenging"),
    startTick: z.number(),
    stops: z.array(
      z.object({
        stopName: z.string(),
        pallet: materialSchema.nullable(),
      }),
    ),
    stopsSearched: z.number(),
    phase: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("searching"), doneTick: z.number() }),
      z.object({ kind: z.literal("deciding") }),
    ]),
  }),
  z.object({
    kind: z.literal("shopping"),
    store: z.string(),
  }),
  z.object({
    kind: z.literal("home"),
  }),
]);

const personSchema = z.object({
  name: z.string(),
  position: vectorSchema,
  direction: directionSchema,
  inventory: z.array(materialSchema),
  carriedMachine: machineStateSchema.nullable().optional(),
  busyTicks: z.number(),
  away: awayTripSchema.nullable(),
});

const progressionSchema = z.object({
  tutorialStep: z.number(),
  tutorialDismissed: z.boolean(),
  storeUnlocked: z.boolean(),
  lumberyardUnlocked: z.boolean(),
  marketplaceUnlocked: z.boolean(),
  commissionsCompleted: z.number(),
  commissionsOffered: z.number(),
  commissionArrivalSeen: z.boolean(),
  sweepingUnlocked: z.boolean(),
  dustTipDismissed: z.boolean(),
  unlockedArticles: z.array(z.string()),
  readArticles: z.array(z.string()),
  xp: z.number(),
  skillPoints: z.number(),
  unlockedSkills: z.array(skillIdSchema),
});

/**
 * Job/commission requirements are declarative InputMaterialWithQuantity
 * records (never functions — see the note on InputMaterial.matches), so
 * structurally they're "quantity plus allowed-value fields".
 */
const requirementSchema = z.object({ quantity: z.number() }).passthrough();

const jobOfferSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  requiredMaterials: z.array(requirementSchema),
  basePay: z.number(),
  baseReputation: z.number(),
  postedAtTick: z.number(),
  materialCostFree: z.boolean(),
});

export const gameStateSchema = z.object({
  tick: z.number(),
  // Optional so saves from before the day was a real unit still load;
  // parseGameState backfills them as a fresh morning at the saved tick.
  day: z.number().optional(),
  dayStartTick: z.number().optional(),
  jobBoardDay: z.number().optional(),
  money: z.number(),
  reputation: z.number(),
  materialPiles: z.array(
    z.object({
      material: materialSchema,
      position: vectorSchema,
      rotation: z.number(),
    }),
  ),
  consumables: z.record(consumableIdSchema, z.number()),
  clamps: z.number(),
  machines: z.array(machineStateSchema),
  machineCrates: z.array(
    z.object({ machine: machineStateSchema, position: vectorSchema }),
  ),
  // Defaulted so saves from before the truck carried cargo still load
  truck: z
    .object({
      bed: z.array(materialSchema),
      crates: z.array(machineStateSchema),
    })
    .default({ bed: [], crates: [] }),
  shopInfo: z.object({
    name: z.string(),
    electricity: z.union([z.literal(120), z.literal(240)]),
    size: vectorSchema,
    materialDropoffPosition: vectorSchema,
    entrancePosition: vectorSchema,
  }),
  player: personSchema,
  storage: z.object({
    upgrades: z.array(upgradeIdSchema),
  }),
  progression: progressionSchema,
  listings: z.array(
    z.object({
      id: z.string(),
      materials: z.array(materialSchema),
      askingPrice: z.number(),
      listedAtTick: z.number(),
    }),
  ),
  jobBoard: z.array(jobOfferSchema),
  seenJobTemplateIds: z.array(z.string()),
  acceptedJobs: z.array(jobOfferSchema.extend({ acceptedAtTick: z.number() })),
  categoryDemand: z.record(z.number()),
  dust: z.record(speciesAmountsSchema),
  shopVac: z
    .object({
      position: vectorSchema.nullable(),
      canister: speciesAmountsSchema,
    })
    .nullable(),
  broomOwned: z.boolean(),
  broomPosition: vectorSchema.nullable(),
  dustpan: speciesAmountsSchema,
});

/**
 * Validate a parsed save file's game state. Returns the typed state, or
 * null (with a console.warn) when the save doesn't hold together. zod
 * strips unknown top-level keys, which quietly drops any transient fields
 * (pendingSounds) an old save might have persisted.
 */
export function parseGameState(data: unknown): GameState | null {
  const result = gameStateSchema.safeParse(data);
  if (!result.success) {
    console.warn("Save failed validation:", result.error.issues.slice(0, 5));
    return null;
  }
  // The schema mirrors GameState structurally; materials are validated
  // loosely (see above), so the cast bridges the last gap. Saves from
  // before the day was a real unit wake as a fresh morning: whatever the
  // old free-running clock said, the player gets a full day from here.
  const parsed = result.data;
  return {
    ...parsed,
    day: parsed.day ?? 1,
    dayStartTick: parsed.dayStartTick ?? parsed.tick,
    jobBoardDay: parsed.jobBoardDay ?? 0,
  } as unknown as GameState;
}
