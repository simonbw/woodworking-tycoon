import { z } from "zod";
import { CONSUMABLE_TYPES } from "./Consumable";
import { MACHINE_TYPES } from "./Machine";
import { TOOL_TYPES } from "./Tool";
import { UPGRADE_TYPES } from "./Upgrade";

/**
 * The shapes the saved world is checked against as it loads (see
 * `sim/save/`), so a truncated or hand-edited save is rejected up front
 * instead of crashing ticks deep into a session.
 *
 * Granularity: strict about the state's structure — every slice present,
 * every container the right kind, every registry id a real one — and
 * deliberately loose inside MaterialInstance. The material union is big
 * and grows often; validating it field-by-field here would make this file
 * a second copy of Materials.ts that must be edited in lockstep. A
 * malformed material can only confuse the recipes it's fed to; a malformed
 * slice takes down the whole sim.
 */

export const vectorSchema = z.tuple([z.number(), z.number()]);
export const directionSchema = z.union([
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
const consumableIdSchema = idEnum(CONSUMABLE_TYPES);

/** See note above: materials stay structural, not exhaustive. */
export const materialSchema = z.object({ type: z.string() }).passthrough();

/** Species amounts keyed by species name (dust cells, vac canister). */
export const speciesAmountsSchema = z.record(z.number());

/** The shop vac: where it's parked (null in hand) and what it holds. */
export const shopVacSchema = z.object({
  position: vectorSchema.nullable(),
  canister: speciesAmountsSchema,
});

export const operationProgressSchema = z.object({
  status: z.enum(["notStarted", "inProgress", "finished"]),
  phaseIndex: z.number(),
  ticksRemaining: z.number(),
});

export const machineStateSchema = z.object({
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

/**
 * A shopping cart's lines (see cart.ts). Every line carries the price it
 * was shelved at, so a reloaded trip rings up exactly what the aisle
 * quoted.
 */
export const cartLineSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("material"),
    material: materialSchema,
    price: z.number(),
  }),
  z.object({
    kind: z.literal("machine"),
    machineTypeId: machineIdSchema,
    price: z.number(),
  }),
  z.object({
    kind: z.literal("consumablePack"),
    consumableId: consumableIdSchema,
    price: z.number(),
  }),
  z.object({
    kind: z.literal("upgrade"),
    upgradeId: upgradeIdSchema,
    price: z.number(),
  }),
  z.object({ kind: z.literal("clamp"), price: z.number() }),
  z.object({ kind: z.literal("broom"), price: z.number() }),
  z.object({ kind: z.literal("shopVac"), price: z.number() }),
]);

export const awayTripSchema = z.discriminatedUnion("kind", [
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
    cart: z.array(cartLineSchema),
    // Whether a flatbed has been taken from the corral — a reload
    // mid-trip keeps the cart in hand.
    hasCart: z.boolean(),
    // Where on the store's floor the trip stands (see store-layout.ts) —
    // a reload mid-trip finds the shopper in the aisle they left off in.
    position: vectorSchema,
    direction: directionSchema,
  }),
  z.object({
    kind: z.literal("home"),
  }),
]);

/** A passerby on the sidewalk line (see stand.ts). */
export const customerSchema = z.object({
  id: z.string(),
  x: z.number(),
  walkDirection: z.union([z.literal(1), z.literal(-1)]),
  state: z.enum(["walking", "browsing", "leaving"]),
  browseTicksLeft: z.number(),
});
