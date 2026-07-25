import {
  CONSUMABLE_TYPES,
  ConsumableStock,
  hasConsumables,
  NO_CONSUMABLES,
} from "./Consumable";
import { clampsFor, clampsFree } from "./Clamp";
import { GameState, ProgressionState } from "./GameState";
import {
  InputMaterialWithQuantity,
  Machine,
  Operation,
  ParameterValues,
} from "./Machine";
import { Board, MaterialInstance } from "./Materials";
import { isBoard } from "./board-helpers";
import {
  createMockMaterial,
  describeMaterialRequirement,
  materialInputMismatches,
  materialMeetsInput,
} from "./material-helpers";
import { availableOperations } from "./skill-helpers";
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
 * Whether the player counts as attending this machine: standing in its
 * operation zone (the apron of cells around the operation position — a
 * body is bigger than one 1-ft cell) and not off on an away trip.
 * Machines with no operation cell can't be worked at all, so their
 * (never-reachable) attended phases are treated as satisfied rather than
 * deadlocking.
 */
export function playerAttendsMachine(
  machine: Machine,
  playerPosition: Vector,
  playerIsAway: boolean,
): boolean {
  const zone = machine.operationZone;
  if (zone.length === 0) {
    return true;
  }
  return (
    !playerIsAway && zone.some((cell) => vectorEquals(cell, playerPosition))
  );
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
  operation: Operation,
  paramId: string,
  value: number | string,
  stock: ReadonlyArray<MaterialInstance> = machine.inputMaterials,
): boolean {
  if (stock.length === 0) {
    return true;
  }
  const params = {
    ...machine.resolvedParameters(operation),
    [paramId]: value,
  };
  const slots = matchMaterialsToSlots(
    stock,
    operation.getInputMaterials(params),
  );
  return slots.every((slot) => slot.isValid && !slot.isPlaceholder);
}

/**
 * Greedily fill `requirements` from `materials`, in declaration order —
 * the one matching order feeding, refusal explanations, and operability
 * checks all share. Returns the materials consumed, what's left over, and
 * the first requirement that couldn't be filled (null when all were).
 */
export function matchRequirements(
  materials: ReadonlyArray<MaterialInstance>,
  requirements: ReadonlyArray<InputMaterialWithQuantity>,
): {
  matched: MaterialInstance[];
  remaining: MaterialInstance[];
  firstUnmet: InputMaterialWithQuantity | null;
} {
  const remaining = [...materials];
  const matched: MaterialInstance[] = [];
  for (const requirement of requirements) {
    for (let i = 0; i < requirement.quantity; i++) {
      const index = remaining.findIndex((material) =>
        materialMeetsInput(material, requirement),
      );
      if (index === -1) {
        return { matched, remaining, firstUnmet: requirement };
      }
      matched.push(remaining[index]);
      remaining.splice(index, 1);
    }
  }
  return { matched, remaining, firstUnmet: null };
}

/** What feeding a direct-feed machine right now would run. */
export interface FeedMatch {
  readonly operation: Operation;
  /**
   * The operation's parameters resolved against the machine's settings bag
   * (its defaults filled in under whatever the player has dialed).
   */
  readonly parameters: ParameterValues;
  /** Carried materials the operation would consume, in match order. */
  readonly materials: ReadonlyArray<MaterialInstance>;
  /** What stays in the player's hands. */
  readonly remaining: ReadonlyArray<MaterialInstance>;
}

/**
 * The operation feeding this machine would run, inferred from what the
 * player is carrying: the first of `operations` whose inputs are fully
 * covered by carried stock under the machine's current settings. On real
 * direct-feed machines the operations' input specs are disjoint (a rough
 * board can only be face-jointed, a panel can only be crosscut), so the
 * stock itself picks — there is no mode.
 */
export function findFeedableOperation(
  machine: Machine,
  operations: ReadonlyArray<Operation>,
  carried: ReadonlyArray<MaterialInstance>,
): FeedMatch | null {
  for (const operation of operations) {
    // The settings bag is shared across operations; each reads its own ids
    // and falls back to its defaults for anything never dialed in.
    const parameters = machine.resolvedParameters(operation);
    const requirements = operation.getInputMaterials(parameters);
    const { matched, remaining, firstUnmet } = matchRequirements(
      carried,
      requirements,
    );
    // Zero-input recipes aren't "fed" — feeding means presenting stock
    if (firstUnmet === null && matched.length > 0) {
      return { operation, parameters, materials: matched, remaining };
    }
  }
  return null;
}

/**
 * Why feeding this direct-feed machine right now would do nothing, in
 * words a mentor would use — or null when a feed would run. The specs
 * that refuse the stock also explain it: the reason comes from the
 * **nearest miss**, the (operation, carried material) pair failing the
 * fewest requirement fields, ties broken by operation order — the same
 * order feed inference uses. The operation's own `explainRejection` gets
 * first say (it knows its machine's vocabulary and can blame a setting
 * instead of the wood); the fallback states the unmet requirement.
 */
export function explainFeedRefusal(
  machine: Machine,
  operations: ReadonlyArray<Operation>,
  carried: ReadonlyArray<MaterialInstance>,
  consumables: ConsumableStock = NO_CONSUMABLES,
): string | null {
  const match = findFeedableOperation(machine, operations, carried);
  if (match) {
    // The stock qualifies — the only thing that can still block is supply
    const short = (match.operation.requiredConsumables ?? []).find(
      (cost) => (consumables[cost.id] ?? 0) < cost.amount,
    );
    if (!short) {
      return null;
    }
    const type = CONSUMABLE_TYPES[short.id];
    return `Out of ${type.name.toLowerCase()} — this needs ${short.amount}, the shop has ${consumables[short.id] ?? 0}.`;
  }

  if (carried.length === 0) {
    return "Your hands are empty — stock feeds straight from them.";
  }

  let best: {
    operation: Operation;
    parameters: ParameterValues;
    requirement: InputMaterialWithQuantity;
    material: MaterialInstance;
    misses: number;
  } | null = null;
  for (const operation of operations) {
    const parameters = machine.resolvedParameters(operation);
    const requirements = operation.getInputMaterials(parameters);
    // Fill requirements the way feeding would, to find the one that blocks
    const { remaining, firstUnmet: blocking } = matchRequirements(
      carried,
      requirements,
    );
    if (!blocking) {
      continue;
    }
    for (const material of remaining) {
      const misses = materialInputMismatches(material, blocking).length;
      if (!best || misses < best.misses) {
        best = {
          operation,
          parameters,
          requirement: blocking,
          material,
          misses,
        };
      }
    }
  }
  if (!best) {
    // Nothing carried was left over to diagnose (everything went to
    // earlier requirement slots) — fall back to the old generic line
    return "Carry stock the machine is set up to take.";
  }
  return (
    best.operation.explainRejection?.(best.material, best.parameters) ??
    `Needs: ${describeMaterialRequirement(best.requirement)}.`
  );
}

/**
 * The carried board a slide-presented setting positions (the stock under
 * the miter saw's blade): the board feeding right now would consume, or —
 * when the set mark doesn't land inside anything carried — the first board
 * that could take a cut at some other mark, shown with the line off its
 * end.
 */
export function slideStock(
  machine: Machine,
  operations: ReadonlyArray<Operation>,
  carried: ReadonlyArray<MaterialInstance>,
): Board | undefined {
  const match = findFeedableOperation(machine, operations, carried);
  const fed = match?.materials.find(isBoard);
  if (fed) {
    return fed;
  }
  return carried.find(
    (material): material is Board => isBoard(material) && material.length >= 2,
  );
}

/**
 * What the shop can put toward a recipe beyond the wood itself: the supply
 * cabinet, and how many clamps are off the rack right now. Bundled because
 * every "could this run?" check needs both, and both come from the same
 * game state (see `shopSupply`).
 */
export interface ShopSupply {
  readonly consumables: ConsumableStock;
  readonly freeClamps: number;
}

/** An empty cabinet and a bare rack — nothing a recipe can draw on. */
export const NO_SUPPLY: ShopSupply = {
  consumables: NO_CONSUMABLES,
  freeClamps: 0,
};

export function shopSupply(gameState: GameState): ShopSupply {
  return {
    consumables: gameState.consumables,
    freeClamps: clampsFree(gameState.clamps, gameState.machines),
  };
}

/**
 * Direct-feed machines run on what the player is carrying, so callers pass
 * the inventory as `carried` (plus `progression`, so skill-locked recipes
 * can't be fed); everything else runs on its staged input bay.
 */
export function machineCanOperate(
  machine: Machine,
  supply: ShopSupply = NO_SUPPLY,
  carried: ReadonlyArray<MaterialInstance> = [],
  progression?: ProgressionState,
): boolean {
  if (machine.type.directFeed) {
    const operations = progression
      ? availableOperations(machine, progression)
      : machine.operations;
    const match = findFeedableOperation(machine, operations, carried);
    return (
      match !== null &&
      hasConsumables(
        supply.consumables,
        match.operation.requiredConsumables ?? [],
      ) &&
      clampsFor(match.operation) <= supply.freeClamps
    );
  }

  const operation = machine.selectedOperationOrNull;
  if (!operation) {
    return false;
  }
  const inputMaterials = operation.getInputMaterials(
    machine.resolvedParameters(operation),
  );

  const slots = matchMaterialsToSlots(machine.inputMaterials, inputMaterials);

  // Machine can operate if all slots have valid materials (no placeholders,
  // all valid), the shop stock covers the recipe's supplies, and there are
  // enough clamps off the rack for a glue-up
  return (
    slots.every((slot) => slot.isValid && !slot.isPlaceholder) &&
    hasConsumables(supply.consumables, operation.requiredConsumables ?? []) &&
    clampsFor(operation) <= supply.freeClamps
  );
}
