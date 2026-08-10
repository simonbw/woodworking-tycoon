import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CONSUMABLE_TYPES } from "./Consumable";
import { hasFloorControls, isBenchType, MACHINE_TYPES } from "./Machine";
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

/**
 * Which stations answer the shop floor's operation keys. The three kinds
 * of station differ exactly here, so the registry is the place to pin it:
 * a direct-feed machine is worked entirely from the floor, a container
 * has its one job there, and a bench has nothing out there at all — its
 * work lives in the bench view (docs/bench-work.md).
 */
describe("hasFloorControls", () => {
  it("holds for direct-feed machines and containers", () => {
    for (const type of Object.values(MACHINE_TYPES)) {
      if (!type.directFeed && !type.container) continue;
      assert.ok(
        hasFloorControls(type),
        `${type.id} is run from the floor and must keep its floor controls`,
      );
    }
  });

  it("holds for no bench — out there a bench is a table", () => {
    const benches = Object.values(MACHINE_TYPES).filter(isBenchType);
    assert.ok(benches.length > 0, "there should be benches to check");
    for (const type of benches) {
      assert.ok(
        !hasFloorControls(type),
        `${type.id} is a bench — its work belongs to the bench view`,
      );
    }
  });
});
