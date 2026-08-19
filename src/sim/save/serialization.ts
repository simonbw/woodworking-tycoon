import { z } from "zod";
import { Entity } from "../../core/entity/Entity";

/**
 * The serialization registry: how sim entities get into and out of save
 * files.
 *
 * Each serializable entity type registers a spec under a stable string
 * key: a zod schema for its persisted data and a `fromJSON` that rebuilds
 * a live entity from it. Instances declare their key via `saveType` and
 * produce their data via `toJSON()`. The save file writer walks the
 * entity world collecting `{type, data}` pairs; the loader validates each
 * against its schema and instantiates through `fromJSON` (see
 * SaveFile.ts).
 *
 * Singleton types (`singleton: true`) — the wallet, the clock, the
 * progression ledger — are stored once under the file's `singletons` map
 * rather than the entity array, and it's an error to serialize two of
 * one. Every singleton is required in a complete save unless its spec
 * says `optional`, which is what lets the loader reject a truncated file
 * up front instead of crashing on the first tick that misses one.
 */

export interface SerializableEntity extends Entity {
  /** The registry key this entity serializes under. */
  readonly saveType: string;
  /** The entity's persisted data. Must satisfy its spec's schema. */
  toJSON(): unknown;
}

export function isSerializableEntity(e: Entity): e is SerializableEntity {
  const candidate = e as Partial<SerializableEntity>;
  return (
    typeof candidate.saveType === "string" &&
    typeof candidate.toJSON === "function"
  );
}

export interface SerializationSpec<Data = unknown> {
  /** Stable string key identifying the type in save files. */
  type: string;
  /** Stored once under `singletons` instead of the entity array. */
  singleton?: boolean;
  /**
   * A singleton a real shop can be without — the shop vac, until it's
   * bought. Every other singleton must appear in a save for the file to
   * describe a shop at all. Meaningless on a non-singleton spec.
   */
  optional?: boolean;
  /** Validates persisted data on load. */
  schema: z.ZodType<Data, z.ZodTypeDef, any>;
  /** Rebuild a live entity from validated data. */
  fromJSON(data: Data): SerializableEntity;
}

const registry = new Map<string, SerializationSpec<any>>();

export function registerSerializable<Data>(
  spec: SerializationSpec<Data>,
): void {
  if (registry.has(spec.type)) {
    throw new Error(`Serializable type registered twice: ${spec.type}`);
  }
  registry.set(spec.type, spec);
}

export function getSerializationSpec(
  type: string,
): SerializationSpec | undefined {
  return registry.get(type);
}

/**
 * The singleton types a file must carry to describe a shop — every
 * registered singleton but the optional ones. Read at call time, not at
 * module load, because specs register as their modules are imported.
 */
export function requiredSingletonTypes(): string[] {
  return [...registry.values()]
    .filter((spec) => spec.singleton && !spec.optional)
    .map((spec) => spec.type);
}
