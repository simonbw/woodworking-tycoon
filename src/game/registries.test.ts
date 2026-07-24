import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CONSUMABLE_TYPES } from "./Consumable";
import { MACHINE_TYPES } from "./Machine";
import { SKILL_TYPES } from "./Skill";
import { TOOL_TYPES } from "./Tool";
import { UPGRADE_TYPES } from "./Upgrade";

/**
 * Every type registry maps id -> definition, and each definition repeats
 * its id as a field. Nothing in the type system ties the two together, so
 * this guards the invariant for all registries at once.
 */
describe("type registries", () => {
  const registries: Record<string, Record<string, { id: string }>> = {
    MACHINE_TYPES,
    TOOL_TYPES,
    UPGRADE_TYPES,
    SKILL_TYPES,
    CONSUMABLE_TYPES,
  };

  for (const [name, registry] of Object.entries(registries)) {
    it(`${name} keys agree with their entries' id fields`, () => {
      for (const [key, def] of Object.entries(registry)) {
        assert.equal(
          def.id,
          key,
          `${name}["${key}"] declares id "${def.id}" — key and id must match`,
        );
      }
    });
  }
});
