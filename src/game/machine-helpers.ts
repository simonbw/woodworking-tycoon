import { Machine } from "./Machine";
import { MaterialInstance } from "./Materials";
import { materialMeetsInput } from "./material-helpers";

export function machineCanOperate(machine: Machine): boolean {
  const inventory = [...machine.inputMaterials];

  const materialsToConsume: MaterialInstance[] = [];

  for (const inputMaterial of machine.selectedOperation.inputMaterials) {
    for (let i = 0; i < inputMaterial.quantity; i++) {
      // TODO: Quantity
      const index = inventory.findIndex((m) =>
        materialMeetsInput(m, inputMaterial)
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
