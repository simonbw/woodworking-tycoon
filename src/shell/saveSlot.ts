import { migrateSaveFile, SaveFile } from "../sim/save/SaveFile";
import { getSerializationSpec } from "../sim/save/serialization";

/**
 * The shop's save slot in browser storage, holding a `SaveFile`.
 *
 * `getEngineSaveStatus` judges the stored save without loading it — a
 * version the migration chain can't reach, or a record its schema
 * rejects, shows as incompatible on the start menu. An incompatible save
 * is left in place, not deleted: only starting a new game writes over it.
 */

export const ENGINE_SAVE_KEY = "woodworking-tycoon-engine-save";

export type SaveStatus = "none" | "ok" | "incompatible";

/** Judge the stored save without loading or touching it. */
export function getEngineSaveStatus(): SaveStatus {
  const serialized = localStorage.getItem(ENGINE_SAVE_KEY);
  if (!serialized) {
    return "none";
  }
  try {
    return isLoadable(JSON.parse(serialized) as SaveFile)
      ? "ok"
      : "incompatible";
  } catch {
    return "incompatible";
  }
}

/**
 * Read the stored save, or null when there is none or it cannot be
 * opened — the same discard semantics `loadSaveFile` enforces, checked
 * up front so the caller never boots a world that then throws.
 */
export function readEngineSave(): SaveFile | null {
  try {
    const serialized = localStorage.getItem(ENGINE_SAVE_KEY);
    if (!serialized) {
      return null;
    }
    const file = JSON.parse(serialized) as SaveFile;
    if (!isLoadable(file)) {
      console.warn("Stored engine save cannot be opened, ignoring");
      return null;
    }
    return file;
  } catch (error) {
    console.error("Failed to read engine save:", error);
    return null;
  }
}

/** Store a snapshot in the slot (the SaveManager's write hook). */
export function writeEngineSave(file: SaveFile): void {
  try {
    localStorage.setItem(ENGINE_SAVE_KEY, JSON.stringify(file));
  } catch (error) {
    console.error("Failed to save game:", error);
  }
}

export function deleteEngineSave(): void {
  localStorage.removeItem(ENGINE_SAVE_KEY);
}

/**
 * A dry run of `loadSaveFile`'s validation: the version must migrate to
 * current, and every record must be a registered type whose schema
 * accepts its data. Nothing is instantiated.
 */
function isLoadable(file: SaveFile): boolean {
  let migrated: SaveFile;
  try {
    migrated = migrateSaveFile(file);
  } catch {
    return false;
  }
  const records = [
    ...Object.entries(migrated.singletons).map(([type, data]) => ({
      type,
      data,
    })),
    ...migrated.entities,
  ];
  return records.every(({ type, data }) => {
    const spec = getSerializationSpec(type);
    return spec !== undefined && spec.schema.safeParse(data).success;
  });
}
