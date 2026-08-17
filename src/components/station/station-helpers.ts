import { isBenchType, Machine } from "../../game/Machine";
import { ProgressionState } from "../../game/GameState";
import { availableOperations } from "../../game/skill-helpers";
import { MaterialInstance } from "../../game/Materials";

/**
 * Parameter ids follow the "targetLength" pattern; the matching bare
 * dimension on a piece of stock anchors the scale's "you are here" mark.
 */
export function stockDimension(
  stock: MaterialInstance | undefined,
  paramId: string,
): number | undefined {
  if (!paramId.startsWith("target")) {
    return undefined;
  }
  const key = paramId.slice("target".length);
  const dimension = key.charAt(0).toLowerCase() + key.slice(1);
  const value = (stock as unknown as Record<string, unknown> | undefined)?.[
    dimension
  ];
  return typeof value === "number" ? value : undefined;
}

export function loadedStockDimension(
  machine: Machine,
  paramId: string,
): number | undefined {
  return stockDimension(machine.inputMaterials[0], paramId);
}

/**
 * Whether this station has a sheet worth opening. Benches and containers
 * always do; a direct-feed machine only does if there is an accessory slot to fit
 * something into, since everything else about running it lives on the
 * floor. Machines with no sheet leave the key unbound rather than opening
 * an empty page.
 */
export function hasStationSheet(machine: Machine): boolean {
  return machine.type.directFeed ? machine.toolSlots > 0 : true;
}

/**
 * Whether Tab (or a right-click) at this station leans the player over a
 * work surface rather than spreading a sheet. A bench with work to do
 * does: its plans, tools, and racks hang on the bench's own chrome. A
 * container bench — a garbage can, a lumber rack — has no work surface,
 * so its sheet stays the inventory it always was.
 */
export function divesToBench(
  machine: Machine,
  progression: ProgressionState,
): boolean {
  return (
    isBenchType(machine.type) &&
    !machine.type.container &&
    availableOperations(machine, progression).length > 0
  );
}
