import { Persistence } from "../../config/constants";
import { Game } from "../../core/Game";
import { getSerializationSpec, isSerializableEntity } from "./serialization";

/**
 * The save file: `{ version, singletons, entities }`, written from and
 * loaded into the entity world.
 *
 * Singletons (the wallet, the clock, the progression ledger…) are stored
 * once each under their type key; everything else is an ordered
 * `{type, data}` array. Loading and fixture-loading are the same path:
 * clear the scene, instantiate every record through its registered
 * `fromJSON` after validating against its schema.
 *
 * One top-level SAVE_VERSION covers the whole file. When the shape of
 * anything persisted changes, bump it and add a step to MIGRATIONS that
 * rewrites a file of the previous version; loading runs the chain
 * sequentially until the file is current.
 */

export const SAVE_VERSION = 1;

export interface SaveFile {
  version: number;
  singletons: Record<string, unknown>;
  entities: Array<{ type: string; data: unknown }>;
}

/** Each entry migrates a file of exactly that version to the next one. */
const MIGRATIONS: Record<number, (file: SaveFile) => SaveFile> = {
  // [1]: (file) => ({ ...rewritten, version: 2 }),
};

export function migrateSaveFile(file: SaveFile): SaveFile {
  let current = file;
  while (current.version < SAVE_VERSION) {
    const step = MIGRATIONS[current.version];
    if (!step) {
      throw new Error(`No migration path from save version ${current.version}`);
    }
    const next = step(current);
    if (next.version <= current.version) {
      throw new Error(
        `Migration from version ${current.version} did not advance the file`,
      );
    }
    current = next;
  }
  if (current.version !== SAVE_VERSION) {
    throw new Error(
      `Save version ${current.version} is newer than this build (${SAVE_VERSION})`,
    );
  }
  return current;
}

/**
 * Snapshot every serializable entity in the game. Call between ticks —
 * never from inside one — so the snapshot sits on a tick boundary.
 */
export function serializeGame(game: Game): SaveFile {
  const singletons: Record<string, unknown> = {};
  const entities: Array<{ type: string; data: unknown }> = [];

  for (const entity of game.entities) {
    if (!isSerializableEntity(entity)) {
      continue;
    }
    const spec = getSerializationSpec(entity.saveType);
    if (!spec) {
      throw new Error(
        `Entity ${entity.constructor.name} has unregistered saveType "${entity.saveType}"`,
      );
    }
    const data = entity.toJSON();
    if (spec.singleton) {
      if (entity.saveType in singletons) {
        throw new Error(`Duplicate singleton in scene: ${entity.saveType}`);
      }
      singletons[entity.saveType] = data;
    } else {
      entities.push({ type: entity.saveType, data });
    }
  }

  // Singletons are keyed, so give them a stable order for byte-identical
  // round trips. The entity array keeps world insertion order, which the
  // loader reproduces.
  const sortedSingletons = Object.fromEntries(
    Object.keys(singletons)
      .sort()
      .map((key) => [key, singletons[key]]),
  );

  return { version: SAVE_VERSION, singletons: sortedSingletons, entities };
}

/**
 * Replace the world's persistent entities with a save file's. Clears
 * everything at or below Game persistence (views follow their sim
 * entities down), then instantiates the file's records — singletons
 * first, then the entity array in file order.
 */
export function loadSaveFile(game: Game, file: SaveFile): void {
  const migrated = migrateSaveFile(file);

  game.clearScene(Persistence.Game);

  for (const [type, data] of Object.entries(migrated.singletons)) {
    game.addEntity(instantiate(type, data));
  }
  for (const { type, data } of migrated.entities) {
    game.addEntity(instantiate(type, data));
  }
}

function instantiate(type: string, data: unknown) {
  const spec = getSerializationSpec(type);
  if (!spec) {
    throw new Error(`Save file contains unknown type "${type}"`);
  }
  return spec.fromJSON(spec.schema.parse(data));
}
