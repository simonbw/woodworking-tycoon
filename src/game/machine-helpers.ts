import { ConsumableStock, hasConsumables, NO_CONSUMABLES } from "./Consumable";
import {
  InputMaterialWithQuantity,
  Machine,
  ParameterizedOperation,
} from "./Machine";
import { MaterialInstance } from "./Materials";
import { createMockMaterial, materialMeetsInput } from "./material-helpers";
import {
  defaultParametersFor,
  getOperationInputMaterials,
} from "./operation-helpers";
import { Vector, vectorEquals } from "./Vectors";

export interface MaterialSlot {
  requirement: InputMaterialWithQuantity;
  material: MaterialInstance;
  isValid: boolean;
  isPlaceholder: boolean;
}

/**
 * Match actual materials to operation requirements, creating slots for each required material.
 * Returns slots with materials, validation status, and placeholders for missing materials.
 *
 * Uses a two-pass algorithm:
 * 1. First pass: Assign exact matches to ensure valid materials go to correct slots
 * 2. Second pass: Fill remaining empty slots with leftover materials (invalid) or placeholders
 */
export function matchMaterialsToSlots(
  actualMaterials: ReadonlyArray<MaterialInstance>,
  requirements: ReadonlyArray<InputMaterialWithQuantity>,
): MaterialSlot[] {
  const availableMaterials = [...actualMaterials];

  // PASS 1: Create all slots and assign exact matches
  const slots: (MaterialSlot | null)[] = [];

  for (const requirement of requirements) {
    for (let i = 0; i < requirement.quantity; i++) {
      // Try to find a matching material
      const materialIndex = availableMaterials.findIndex((material) =>
        materialMeetsInput(material, requirement),
      );

      if (materialIndex !== -1) {
        // Found a valid match - assign it
        const material = availableMaterials[materialIndex];
        availableMaterials.splice(materialIndex, 1);
        slots.push({
          requirement,
          material,
          isValid: true,
          isPlaceholder: false,
        });
      } else {
        // No match found - leave slot empty for now
        slots.push(null);
      }
    }
  }

  // PASS 2: Fill empty slots with remaining materials or placeholders
  for (let i = 0; i < slots.length; i++) {
    if (slots[i] === null) {
      // This slot needs to be filled
      const requirement = getRequirementForSlotIndex(i, requirements);

      if (availableMaterials.length > 0) {
        // Use a remaining material (but mark as invalid)
        const material = availableMaterials.shift()!;
        slots[i] = {
          requirement,
          material,
          isValid: false,
          isPlaceholder: false,
        };
      } else {
        // No materials left - create placeholder
        slots[i] = {
          requirement,
          material: createMockMaterial(requirement),
          isValid: false,
          isPlaceholder: true,
        };
      }
    }
  }

  return slots as MaterialSlot[];
}

/**
 * Helper to get the requirement for a given slot index
 */
function getRequirementForSlotIndex(
  slotIndex: number,
  requirements: ReadonlyArray<InputMaterialWithQuantity>,
): InputMaterialWithQuantity {
  let index = 0;
  for (const requirement of requirements) {
    if (slotIndex < index + requirement.quantity) {
      return requirement;
    }
    index += requirement.quantity;
  }
  throw new Error(`Slot index ${slotIndex} out of range`);
}

/**
 * Checks if a machine has all required materials to start its selected operation.
 *
 * Uses the material slot matching algorithm to verify that the machine's input materials
 * satisfy all requirements for the current operation. The machine can operate only if
 * every material slot can be filled with a valid material (no placeholders or invalid materials).
 *
 * @param machine - The machine to check
 * @returns true if the machine has all required materials and can start operating, false otherwise
 */
/**
 * Whether the player counts as attending this machine: standing at its
 * operation cell and not off on an away trip. Machines with no operation
 * cell can't be worked at all, so their (never-reachable) attended phases
 * are treated as satisfied rather than deadlocking.
 */
export function playerAttendsMachine(
  machine: Machine,
  playerPosition: Vector,
  playerIsAway: boolean,
): boolean {
  const operationCell = machine.absoluteOperationPosition;
  if (operationCell === null) {
    return true;
  }
  return !playerIsAway && vectorEquals(playerPosition, operationCell);
}

/**
 * Whether the machine's loaded inputs could run this operation with
 * `paramId` set to `value` (other parameters kept as currently selected).
 * With nothing loaded there's nothing to contradict, so every value counts
 * as satisfiable — the player may well be dialing in the machine before
 * fetching stock.
 *
 * Direct-feed machines have no input bay; pass what the player is carrying
 * as `stock` so the scale reads against the board in their hands.
 */
export function parameterValueSatisfiable(
  machine: Machine,
  operation: ParameterizedOperation,
  paramId: string,
  value: number | string,
  stock: ReadonlyArray<MaterialInstance> = machine.inputMaterials,
): boolean {
  if (stock.length === 0) {
    return true;
  }
  const params = {
    ...defaultParametersFor(operation),
    ...machine.selectedParameters,
    [paramId]: value,
  };
  const slots = matchMaterialsToSlots(
    stock,
    operation.getInputMaterials(params),
  );
  return slots.every((slot) => slot.isValid && !slot.isPlaceholder);
}

/**
 * Direct-feed machines run on what the player is carrying, so callers pass
 * the inventory as `carried`; everything else runs on its staged input bay.
 */
export function machineCanOperate(
  machine: Machine,
  consumables: ConsumableStock = NO_CONSUMABLES,
  carried: ReadonlyArray<MaterialInstance> = [],
): boolean {
  const operation = machine.selectedOperationOrNull;
  if (!operation) {
    return false;
  }
  const inputMaterials = getOperationInputMaterials(
    operation,
    machine.selectedParameters,
  );

  const stock = machine.type.directFeed ? carried : machine.inputMaterials;
  const slots = matchMaterialsToSlots(stock, inputMaterials);

  // Machine can operate if all slots have valid materials (no placeholders,
  // all valid) and the shop stock covers the recipe's supplies
  return (
    slots.every((slot) => slot.isValid && !slot.isPlaceholder) &&
    hasConsumables(consumables, operation.requiredConsumables ?? [])
  );
}
