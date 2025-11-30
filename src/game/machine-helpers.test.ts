import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "./board-helpers";
import { InputMaterialWithQuantity } from "./Machine";
import { matchMaterialsToSlots } from "./machine-helpers";
import { MaterialInstance } from "./Materials";

describe("matchMaterialsToSlots", () => {
  it("should match all materials when placed in correct order", () => {
    const materials = [
      board("pallet", 4, 6, 3), // stringer
      board("pallet", 4, 6, 3), // stringer
      board("pallet", 3, 4, 1), // deck
      board("pallet", 3, 4, 1), // deck
      board("pallet", 3, 4, 1), // deck
    ];

    const requirements: ReadonlyArray<InputMaterialWithQuantity> = [
      {
        type: ["board"],
        species: ["pallet"],
        width: [6],
        length: [4],
        quantity: 2,
      },
      {
        type: ["board"],
        species: ["pallet"],
        width: [4],
        length: [3],
        quantity: 3,
      },
    ];

    const slots = matchMaterialsToSlots(materials, requirements);

    assert.strictEqual(slots.length, 5);
    assert.strictEqual(
      slots.filter((slot) => slot.isValid).length,
      5,
      "All slots should be valid",
    );
    assert.strictEqual(
      slots.filter((slot) => slot.isPlaceholder).length,
      0,
      "No placeholders should exist",
    );
  });

  it("should match materials even when placed in wrong order", () => {
    // Place deck boards first, then stringers - opposite of requirement order
    const materials = [
      board("pallet", 3, 4, 1), // deck
      board("pallet", 3, 4, 1), // deck
      board("pallet", 3, 4, 1), // deck
      board("pallet", 4, 6, 3), // stringer
      board("pallet", 4, 6, 3), // stringer
    ];

    const requirements: ReadonlyArray<InputMaterialWithQuantity> = [
      {
        type: ["board"],
        species: ["pallet"],
        width: [6],
        length: [4],
        quantity: 2,
      }, // stringers first
      {
        type: ["board"],
        species: ["pallet"],
        width: [4],
        length: [3],
        quantity: 3,
      }, // decks second
    ];

    const slots = matchMaterialsToSlots(materials, requirements);

    // This test will FAIL with current implementation
    // After two-pass fix, all 5 should be valid
    assert.strictEqual(slots.length, 5);
    const validCount = slots.filter((slot) => slot.isValid).length;
    assert.strictEqual(
      validCount,
      5,
      `Expected all materials to match, but only ${validCount}/5 were valid`,
    );
  });

  it("should handle partial materials with placeholders", () => {
    const materials = [
      board("pallet", 4, 6, 3), // only 1 stringer
    ];

    const requirements: ReadonlyArray<InputMaterialWithQuantity> = [
      {
        type: ["board"],
        species: ["pallet"],
        width: [6],
        length: [4],
        quantity: 2,
      },
      {
        type: ["board"],
        species: ["pallet"],
        width: [4],
        length: [3],
        quantity: 3,
      },
    ];

    const slots = matchMaterialsToSlots(materials, requirements);

    assert.strictEqual(slots.length, 5, "Should create 5 slots total");
    assert.strictEqual(
      slots.filter((slot) => slot.isValid && !slot.isPlaceholder).length,
      1,
      "Should have 1 valid material",
    );
    assert.strictEqual(
      slots.filter((slot) => slot.isPlaceholder).length,
      4,
      "Should have 4 placeholders",
    );
  });

  it("should create all placeholders when no materials provided", () => {
    const materials: MaterialInstance[] = [];

    const requirements: ReadonlyArray<InputMaterialWithQuantity> = [
      {
        type: ["board"],
        species: ["pallet"],
        width: [6],
        length: [4],
        quantity: 2,
      },
    ];

    const slots = matchMaterialsToSlots(materials, requirements);

    assert.strictEqual(slots.length, 2);
    assert.strictEqual(
      slots.filter((slot) => slot.isPlaceholder).length,
      2,
      "All slots should be placeholders",
    );
    assert.strictEqual(
      slots.filter((slot) => slot.isValid).length,
      0,
      "No slots should be valid",
    );
  });

  it("should handle mix of valid and invalid materials", () => {
    // User places 3 wrong boards, then 2 correct stringers
    const materials = [
      board("pine", 8, 4, 1), // wrong species
      board("pine", 8, 4, 1), // wrong species
      board("pine", 8, 4, 1), // wrong species
      board("pallet", 4, 6, 3), // correct stringer
      board("pallet", 4, 6, 3), // correct stringer
    ];

    const requirements: ReadonlyArray<InputMaterialWithQuantity> = [
      {
        type: ["board"],
        species: ["pallet"],
        width: [6],
        length: [4],
        quantity: 2,
      }, // stringers
      {
        type: ["board"],
        species: ["pallet"],
        width: [4],
        length: [3],
        quantity: 3,
      }, // decks
    ];

    const slots = matchMaterialsToSlots(materials, requirements);

    assert.strictEqual(slots.length, 5);

    // With current implementation:
    // - Slots 0-1 should have the valid stringers (isValid: true)
    // - Slots 2-4 should have the pine boards (isValid: false)
    const validSlots = slots.filter(
      (slot) => slot.isValid && !slot.isPlaceholder,
    );
    assert.strictEqual(validSlots.length, 2, "Should have 2 valid stringers");

    const invalidSlots = slots.filter(
      (slot) => !slot.isValid && !slot.isPlaceholder,
    );
    assert.strictEqual(
      invalidSlots.length,
      3,
      "Should have 3 invalid materials in wrong slots",
    );
  });

  it("should handle partial materials in wrong placement order (THE BUG)", () => {
    // This is the actual issue the user experiences:
    // User places deck boards first, then adds stringers one at a time
    const materials = [
      board("pallet", 3, 4, 1), // deck board placed first
      board("pallet", 4, 6, 3), // stringer placed second
    ];

    const requirements: ReadonlyArray<InputMaterialWithQuantity> = [
      {
        type: ["board"],
        species: ["pallet"],
        width: [6],
        length: [4],
        quantity: 2,
      }, // stringers required first
      {
        type: ["board"],
        species: ["pallet"],
        width: [4],
        length: [3],
        quantity: 3,
      }, // decks required second
    ];

    const slots = matchMaterialsToSlots(materials, requirements);

    assert.strictEqual(slots.length, 5);

    // DESIRED BEHAVIOR (with two-pass):
    // All valid materials should show as valid, regardless of placement order
    const validSlots = slots.filter(
      (slot) => slot.isValid && !slot.isPlaceholder,
    );
    assert.strictEqual(
      validSlots.length,
      2,
      "Both materials should be valid (1 stringer, 1 deck)",
    );

    // CURRENT BEHAVIOR (will fail):
    // Slot 0 (stringer): gets the stringer ✓
    // Slot 1 (stringer): gets the deck board ✗ (shows red/invalid)
    // Slots 2-4 (decks): placeholders
    // The deck board shows as INVALID even though it's a correct material!
  });
});
