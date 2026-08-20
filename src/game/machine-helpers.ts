import {
  CONSUMABLE_TYPES,
  ConsumableStock,
  hasConsumables,
  NO_CONSUMABLES,
} from "./Consumable";
import { clampsFor, clampsFree } from "./Clamp";
import { CellMap } from "./CellMap";
import {
  describeFeedShortfall,
  feedClearanceShortfall,
} from "./feed-clearance";
import { GameState, ProgressionState } from "./GameState";
import {
  defaultParametersFor,
  InputMaterialWithQuantity,
  isBenchType,
  Machine,
  Operation,
  OperationParameter,
  operationParameters,
  ParameterValues,
  StockOrientation,
} from "./Machine";
import { Board, MaterialInstance } from "./Materials";
import { Person } from "./Person";
import { selectedBenchPlan } from "./bench-work/tool-work";
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
 * Whether an operation's attended phases would advance this tick.
 * Attended phases need the player at the machine, holding the operate
 * key, AND the machine powered — switching off mid-cut pauses the work
 * like stepping away, and so does letting go. Power-feed operations (the
 * planer) pull the stock through on their own: neither the player's
 * whereabouts nor their grip matters, but the switch still does.
 * Interactive operations never tick their attended work at all — the
 * bench view performs it and commits through `finishAttendedWork`
 * (see docs/bench-work.md).
 *
 * Shared between the tick pipeline (which advances the work) and the
 * time-flow model (which decides that this is the player spending time),
 * so the two can never disagree about what counts as working.
 */
export function operationAttendanceSatisfied(
  machine: Machine,
  operation: Operation,
  attending: Pick<Person, "position" | "away" | "operating">,
): boolean {
  const interactive = operation.interaction != null;
  return (
    !interactive &&
    ((playerAttendsMachine(
      machine,
      attending.position,
      attending.away !== null,
    ) &&
      attending.operating === true) ||
      operation.powerFeed === true) &&
    machine.isPowered
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

/** Whether any of these operations wants the stock sitting this way. */
function someOperationWants(
  operations: ReadonlyArray<Operation>,
  orientation: StockOrientation,
): boolean {
  return operations.some(
    (operation) =>
      operation.stockOrientation === undefined ||
      operation.stockOrientation === orientation,
  );
}

/**
 * Which way stock currently sits on this machine's table: the bag value if
 * the player has turned it, else the resting default of whichever
 * operation declares the `stockOrientation` parameter. A machine none of
 * whose operations declare it has nothing to stand stock against, so it
 * reads "flat".
 *
 * A bag value no operation on this list wants doesn't count — the table
 * saw rests flat for the rip, and a player who hasn't learned resawing
 * has nothing to stand a board up for, so the saw reads flat however the
 * bag was left. Pass the skill-filtered list to get that reading.
 */
export function stockOrientation(
  machine: Machine,
  operations: ReadonlyArray<Operation> = machine.operations,
): StockOrientation {
  const declared = operations
    .flatMap((operation) => operationParameters(operation))
    .find((parameter) => parameter.id === "stockOrientation");
  if (!declared) {
    return "flat";
  }
  const set = machine.selectedParameters?.stockOrientation;
  if (
    (set === "flat" || set === "on edge") &&
    someOperationWants(operations, set)
  ) {
    return set;
  }
  return (declared.defaultValue as StockOrientation) ?? "flat";
}

/**
 * The operations the machine's current stock orientation presents the work
 * to: everything that doesn't care how the stock sits, plus the ones that
 * want it exactly this way. This is what keeps a saw's rip and resaw
 * disjoint — both would take the same board, but only one is ever live.
 */
export function orientedOperations(
  machine: Machine,
  operations: ReadonlyArray<Operation>,
): ReadonlyArray<Operation> {
  const orientation = stockOrientation(machine, operations);
  return operations.filter(
    (operation) =>
      operation.stockOrientation === undefined ||
      operation.stockOrientation === orientation,
  );
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
 * stock itself picks — there is no mode. Where two cuts would take the
 * same board, the way the stock sits breaks the tie: operations declaring
 * a stockOrientation are only candidates while the machine's stock sits
 * that way (see orientedOperations).
 */
export function findFeedableOperation(
  machine: Machine,
  operations: ReadonlyArray<Operation>,
  carried: ReadonlyArray<MaterialInstance>,
): FeedMatch | null {
  return findMatchAmong(
    machine,
    orientedOperations(machine, operations),
    carried,
  );
}

/** The matching core of findFeedableOperation, with no orientation gate. */
function findMatchAmong(
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
  supply: ShopSupply = NO_SUPPLY,
): string | null {
  const match = findFeedableOperation(machine, operations, carried);
  if (match) {
    // The stock qualifies — what can still block is the room to run it
    // through, and then the supply cabinet
    if (supply.cellMap !== undefined) {
      const shortfall = feedClearanceShortfall(
        machine,
        match.materials,
        supply.cellMap,
      );
      if (shortfall) {
        return describeFeedShortfall(shortfall);
      }
    }
    const { consumables } = supply;
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
    return "Nothing on the machine — set stock down on it first.";
  }

  // The stock may be right for a cut the machine isn't presenting it to —
  // lying flat when the cut wants it on edge, or the reverse. R turns it
  // over, so say that before diagnosing the wood itself.
  const oriented = orientedOperations(machine, operations);
  const turned = findMatchAmong(
    machine,
    operations.filter((operation) => !oriented.includes(operation)),
    carried,
  );
  if (turned) {
    const verb = turned.operation.name.toLowerCase();
    return turned.operation.stockOrientation === "flat"
      ? `To ${verb} it, lay the stock flat — press R to turn it over.`
      : `To ${verb} it, stand the stock on edge — press R to turn it up.`;
  }

  let best: {
    operation: Operation;
    parameters: ParameterValues;
    requirement: InputMaterialWithQuantity;
    material: MaterialInstance;
    misses: number;
  } | null = null;
  for (const operation of oriented) {
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
): Board | undefined {
  const staged = machine.inputMaterials;
  const match = findFeedableOperation(machine, operations, staged);
  const fed = match?.materials.find(isBoard);
  if (fed) {
    return fed;
  }
  // On the table but not currently cuttable (the mark sits off its end):
  // still the board the scale positions, shown with the line past it.
  return staged.find((material): material is Board => isBoard(material));
}

/**
 * Which of the carried materials this machine would take if they were set
 * down on it right now — the F key's subject. Distinct from
 * machineCanOperate, which asks whether what's *already* on the machine
 * can run: setting stock down and pulling the trigger are two acts.
 */
export function stageableMaterials(
  machine: Machine,
  carried: ReadonlyArray<MaterialInstance>,
  progression?: ProgressionState,
): ReadonlyArray<MaterialInstance> {
  const freeSpaces = machine.type.inputSpaces - machine.inputMaterials.length;
  if (freeSpaces <= 0 || carried.length === 0) {
    return [];
  }
  if (machine.type.directFeed || isBenchType(machine.type)) {
    // A saw table takes any board. Setting stock down is not the same act
    // as cutting it: the settings decide whether the *cut* works, and you
    // have to be able to put the board on the machine before you can slide
    // it to the mark. So this matches on material kind only — whether the
    // stock is millable at the current settings is the trigger's business,
    // and the refusal chip explains it in the meantime.
    //
    // A bench gets the same treatment for a homelier reason: it's a table.
    // Any stock a bench recipe could ever want can be set on it — no plan
    // has to be picked first. The work itself decides later (the pallet's
    // nails offer prying, a chosen plan claims its pieces).
    const operations = progression
      ? availableOperations(machine, progression)
      : machine.operations;
    const kinds = new Set(
      operations.flatMap((operation) =>
        operation
          .getInputMaterials(machine.resolvedParameters(operation))
          .flatMap((input) => (input.type ? [...input.type] : [])),
      ),
    );
    const takeable = carried.filter((material) => kinds.has(material.type));
    // On a bench with a plan picked, F grabs the plan's pieces out of the
    // armful first — the bench still takes anything, but the single press
    // sets down the piece the work actually wants. (Tool work — pry,
    // stroke, saw — isn't a plan, so a stale selection of it expresses
    // no preference.)
    const selected = machine.selectedOperationOrNull;
    if (
      isBenchType(machine.type) &&
      selected &&
      !["pry", "stroke", "saw"].includes(selected.interaction?.kind ?? "")
    ) {
      const inputs = selected.getInputMaterials(
        machine.resolvedParameters(selected),
      );
      const preferred = takeable.filter((material) =>
        inputs.some((input) => materialMeetsInput(material, input)),
      );
      return [
        ...preferred,
        ...takeable.filter((material) => !preferred.includes(material)),
      ].slice(0, freeSpaces);
    }
    return takeable.slice(0, freeSpaces);
  }
  const operation = machine.selectedOperationOrNull;
  if (!operation) {
    return [];
  }
  const inputs = operation.getInputMaterials(
    machine.resolvedParameters(operation),
  );
  return carried
    .filter((material) =>
      inputs.some((input) => materialMeetsInput(material, input)),
    )
    .slice(0, freeSpaces);
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
  /**
   * The shop floor itself, for checks that depend on where things stand —
   * feed-through machines need clear lane scaled to the stock's length
   * (see feed-clearance.ts). Absent (bare-supply tests, previews with no
   * floor), clearance is treated as unlimited.
   */
  readonly cellMap?: CellMap;
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
    cellMap: CellMap.fromGameState(gameState),
  };
}

/**
 * Whether the machine could run right now. Every station runs on its staged
 * input — a direct-feed machine's table is one slot deep, and the stock got
 * there with F — so this never looks at the player's hands. Pass
 * `progression` on a direct-feed machine so skill-locked recipes can't be
 * inferred. See `stageableMaterials` for the other half: what the machine
 * would *accept*.
 */
export function machineCanOperate(
  machine: Machine,
  supply: ShopSupply = NO_SUPPLY,
  progression?: ProgressionState,
): boolean {
  if (machine.type.directFeed) {
    // What's *on the machine* decides which operation runs — the stock was
    // set down first (F) and the trigger comes after (Space).
    const operations = progression
      ? availableOperations(machine, progression)
      : machine.operations;
    const match = findFeedableOperation(
      machine,
      operations,
      machine.inputMaterials,
    );
    return (
      match !== null &&
      (supply.cellMap === undefined ||
        feedClearanceShortfall(machine, match.materials, supply.cellMap) ===
          null) &&
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

/**
 * The operations that could take the stock sitting on the machine,
 * judged on material kind alone — settings are what we're picking here,
 * so the stock's dimensions can't be part of the test (a fence dialed
 * past the board is exactly when you need to reach the fence).
 *
 * An empty table leaves every operation on the list: there's nothing to
 * narrow by, and the settings still have to be dialable before the stock
 * goes down.
 */
function operationsForStagedStock(
  machine: Machine,
  operations: ReadonlyArray<Operation>,
): ReadonlyArray<Operation> {
  const staged = machine.inputMaterials;
  if (staged.length === 0) {
    return operations;
  }
  const narrowed = operations.filter((operation) => {
    const requirements = operation.getInputMaterials(
      defaultParametersFor(operation),
    );
    return staged.every((material) =>
      requirements.some(
        (requirement) =>
          requirement.type === undefined ||
          // The union of per-material type arrays narrows to never
          (requirement.type as ReadonlyArray<string>).includes(material.type),
      ),
    );
  });
  return narrowed.length > 0 ? narrowed : operations;
}

/**
 * The machine's live setting of the given kind — the one Z/X ("linear")
 * or R ("rotate") steps. On direct-feed machines the setting can belong
 * to any available operation (what's in hand decides which one runs); at
 * a bench only the plan pulled off the blueprint pile, whose scales are
 * drawn on the drawing itself (BlueprintCorner) — and only from inside
 * the bench view, since a bench has no controls out on the floor at all
 * (Machine.hasFloorControls). Tool work never has a live setting: the
 * gesture carries its own parameters, so the hand saw's kept length is
 * the mark you make, not a dial you leave set.
 *
 * `undefined` when the key would have nothing to step, which is also how
 * R decides whether it swings a head or rummages the pile underfoot.
 */
export function liveSettingParameter(
  machine: Machine,
  progression: ProgressionState,
  kind: "linear" | "rotate",
): { operation: Operation; parameter: OperationParameter } | undefined {
  const isKind = (parameter: OperationParameter) =>
    kind === "rotate"
      ? parameter.presentation === "rotate"
      : parameter.presentation !== "rotate";

  // Only the operations the stock's orientation presents count: a band
  // saw set up to resaw offers its resaw fence to Z/X, not the rip's —
  // while the orientation itself (a rotate setting on both) stays live
  // either way. And of those, only the ones that could take what's
  // actually on the table: the table saw's fence reads in board detents
  // for a board and in inches for a sheet, and the scale you turn is the
  // one for the stock in front of you.
  const available = machine.type.directFeed
    ? availableOperations(machine, progression)
    : [];
  const candidates = machine.type.directFeed
    ? operationsForStagedStock(machine, orientedOperations(machine, available))
    : [selectedBenchPlan(machine)].filter((op) => op != null);

  // Turning the stock over is only a setting when the machine has work
  // waiting the other way up. A table saw whose owner hasn't learned
  // resawing only ever rips, so R goes back to rummaging the pile — and
  // nobody can strand the saw standing on edge with nothing to run.
  const orientationsWanted = new Set(
    available
      .map((operation) => operation.stockOrientation)
      .filter((orientation) => orientation !== undefined),
  );
  const canTurnStock = orientationsWanted.size > 1;

  return candidates
    .flatMap((operation) =>
      operationParameters(operation).map((parameter) => ({
        operation,
        parameter,
      })),
    )
    .find(
      ({ parameter }) =>
        isKind(parameter) &&
        parameter.values.length > 1 &&
        (parameter.id !== "stockOrientation" || canTurnStock),
    );
}
