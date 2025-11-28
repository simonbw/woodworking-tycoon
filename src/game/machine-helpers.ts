import { InputMaterialWithQuantity, Machine } from "./Machine";
import { MaterialInstance } from "./Materials";
import { createMockMaterial, materialMeetsInput } from "./material-helpers";
import { getOperationInputMaterials } from "./operation-helpers";

export interface MaterialSlot {
  requirement: InputMaterialWithQuantity;
  material: MaterialInstance;
  isValid: boolean;
  isPlaceholder: boolean;
}

/**
 * Match actual materials to operation requirements, creating slots for each required material.
 * Returns slots with materials, validation status, and placeholders for missing materials.
 */
export function matchMaterialsToSlots(
  actualMaterials: MaterialInstance[],
  requirements: ReadonlyArray<InputMaterialWithQuantity>,
): MaterialSlot[] {
  const slots: MaterialSlot[] = [];
  const availableMaterials = [...actualMaterials];

  for (const requirement of requirements) {
    for (let i = 0; i < requirement.quantity; i++) {
      // Find a matching material
      const materialIndex = availableMaterials.findIndex((material) =>
        materialMeetsInput(material, requirement),
      );

      if (materialIndex !== -1) {
        // Found a matching material
        const material = availableMaterials[materialIndex];
        availableMaterials.splice(materialIndex, 1);
        slots.push({
          requirement,
          material,
          isValid: true,
          isPlaceholder: false,
        });
      } else {
        // No matching material found - try to find any material for this slot
        const anyMaterialIndex = availableMaterials.findIndex(() => true);
        if (anyMaterialIndex !== -1) {
          // Found a material but it doesn't match requirements
          const material = availableMaterials[anyMaterialIndex];
          availableMaterials.splice(anyMaterialIndex, 1);
          slots.push({
            requirement,
            material,
            isValid: false,
            isPlaceholder: false,
          });
        } else {
          // No material at all - show mock material as placeholder
          slots.push({
            requirement,
            material: createMockMaterial(requirement),
            isValid: false,
            isPlaceholder: true,
          });
        }
      }
    }
  }

  return slots;
}

export function machineCanOperate(machine: Machine): boolean {
  const inventory = [...machine.inputMaterials];

  const materialsToConsume: MaterialInstance[] = [];

  const inputMaterials = getOperationInputMaterials(
    machine.selectedOperation,
    machine.selectedParameters,
  );

  for (const inputMaterial of inputMaterials) {
    for (let i = 0; i < inputMaterial.quantity; i++) {
      // TODO: Quantity
      const index = inventory.findIndex((m) =>
        materialMeetsInput(m, inputMaterial),
      );
      if (index === -1) {
        return false;
      }
      materialsToConsume.push(inventory[index]);
      inventory.splice(index, 1);
    }
  }

  return true;
}
