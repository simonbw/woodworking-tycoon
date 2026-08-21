import { ProgressionState } from "../GameState";
import { Person } from "../Person";
import { ShopVacCarry } from "../ShopVac";
import {
  defaultParametersFor,
  isSameMachine,
  Machine,
  MACHINE_TYPES,
  MachineId,
  MachineState,
  MachineType,
} from "../Machine";
import {
  Direction,
  rotateVec,
  scaleVec,
  translateVec,
  Vector,
  vectorEquals,
  vectorKey,
} from "../Vectors";
import { CellMap } from "../CellMap";
import { carryingShopVac } from "../ShopVac";

/**
 * The rules of where a machine may stand and when it may be lifted: what
 * a machine type occupies, whether a spot will take it, what a fresh one
 * looks like, and the guards on hoisting and setting down.
 *
 * All pure reads over a shop snapshot; the commands in
 * `sim/commands/machine-commands.ts` drive them.
 */

/**
 * Validates whether a machine can be placed at the given position and
 * rotation. Benchtop machines (MachineType.benchtop) may land on free
 * worktable cells as well as empty floor; everything else needs bare
 * floor. Free cells (infeed/outfeed/operator) must be genuinely walkable —
 * a table top doesn't count.
 * @param excludeMachine - Optional machine to ignore in collision checks
 * (the machine being moved)
 */
export function canPlaceMachine(
  cellMap: CellMap,
  machineType: MachineType,
  position: Vector,
  rotation: Direction,
  excludeMachine?: MachineState,
): boolean {
  const unlessExcluded = (
    occupant: Machine | undefined,
  ): Machine | undefined =>
    occupant !== undefined &&
    excludeMachine !== undefined &&
    isSameMachine(occupant.state, excludeMachine)
      ? undefined
      : occupant;

  // Check all cells the machine occupies
  for (const relativeCell of machineType.cellsOccupied) {
    const absolutePosition = translateVec(
      rotateVec(relativeCell, rotation),
      position,
    );

    const cell = cellMap.at(absolutePosition);
    if (cell === undefined) {
      return false;
    }

    const top = unlessExcluded(cell.machine);
    const table = unlessExcluded(cell.tableMachine);

    if (machineType.benchtop) {
      // Empty floor, or a worktable cell with nothing mounted on it yet
      if (top !== undefined && !top.type.worktable) {
        return false;
      }
    } else if (top !== undefined || table !== undefined) {
      return false;
    }
  }

  // Check all free cells needed by the machine
  for (const relativeCell of machineType.freeCellsNeeded) {
    const absolutePosition = translateVec(
      rotateVec(relativeCell, rotation),
      position,
    );

    const cell = cellMap.at(absolutePosition);
    if (cell === undefined) {
      return false;
    }

    if (
      unlessExcluded(cell.machine) !== undefined ||
      unlessExcluded(cell.tableMachine) !== undefined
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Gets all cells that would be occupied by a machine at the given position and rotation
 * Useful for highlighting during placement preview
 */
export function getMachineOccupiedCells(
  machineType: MachineType,
  position: Vector,
  rotation: Direction,
): Vector[] {
  return machineType.cellsOccupied.map((relativeCell) =>
    translateVec(rotateVec(relativeCell, rotation), position),
  );
}

/**
 * The benchtop machines sitting on a worktable's cells. A table with
 * machines mounted can't be moved or removed — take the machines off
 * first.
 */
export function machinesMountedOnTable(
  machines: ReadonlyArray<MachineState>,
  tableIndex: number,
): ReadonlyArray<MachineState> {
  const table = machines[tableIndex];
  const tableType = MACHINE_TYPES[table.machineTypeId];
  if (!tableType.worktable) {
    return [];
  }
  const tableCells = getMachineOccupiedCells(
    tableType,
    table.position,
    table.rotation,
  ).map(vectorKey);
  return machines.filter((machine, index) => {
    if (index === tableIndex) {
      return false;
    }
    const machineType = MACHINE_TYPES[machine.machineTypeId];
    return getMachineOccupiedCells(
      machineType,
      machine.position,
      machine.rotation,
    ).some((cell) => tableCells.includes(vectorKey(cell)));
  });
}

/** A factory-fresh MachineState; defaults to the first UNLOCKED operation. */
export function freshMachineState(
  machineTypeId: MachineId,
  progression: ProgressionState,
): MachineState {
  const machineType = MACHINE_TYPES[machineTypeId];
  const unlockedOps = machineType.operations.filter(
    (op) =>
      !op.requiredSkill ||
      progression.unlockedSkills.includes(op.requiredSkill),
  );
  return {
    machineTypeId,
    position: [0, 0],
    rotation: 0,
    selectedOperationId: unlockedOps.length > 0 ? unlockedOps[0].id : "none",
    // Parameterized defaults up front: an operation started without the
    // player ever touching the scale must still complete cleanly.
    selectedParameters:
      unlockedOps.length > 0 ? defaultParametersFor(unlockedOps[0]) : undefined,
    operationProgress: {
      status: "notStarted",
      phaseIndex: 0,
      ticksRemaining: 0,
    },
    inputMaterials: [],
    processingMaterials: [],
    outputMaterials: [],
    tools: [],
    storedMaterials: [],
    upgrades: [],
  };
}

/** What the carrying rules read — a structural slice of `GameState`. */
export interface CarryFacts extends ShopVacCarry {
  readonly machines: ReadonlyArray<MachineState>;
  readonly player: Pick<Person, "carriedMachine" | "inventory">;
}

/** The player's hands are genuinely free: no machine, no boards, no vac. */
function handsFree(facts: CarryFacts): boolean {
  return (
    facts.player.carriedMachine == null &&
    facts.player.inventory.length === 0 &&
    !carryingShopVac(facts)
  );
}

/**
 * Why the crate at hand can't be hoisted right now, for the chip to say
 * in place of "unpack" — the same test the unpack commands run (here and
 * at the truck's bed), so the chip and the key always agree. Null when
 * unpacking would work; the carried-machine case never asks (no chips
 * show with a machine on the shoulders).
 */
export function explainUnpackRefusal(facts: CarryFacts): string | null {
  if (carryingShopVac(facts)) {
    return "set the vac down to unpack";
  }
  if (facts.player.inventory.length > 0) {
    return "empty your hands to unpack";
  }
  return null;
}

/*
 * Carrying machines IS shop-layout management — there is no separate
 * layout editor. One contextual key (B) three-way toggles: put down what
 * you're carrying, unpack a crate underfoot (or at the truck's bed), or
 * hoist the machine you're standing at. Available from the start of a
 * new game — carrying was never gated. A carried machine costs no walk
 * speed, deliberately: rearranging the shop is meant to feel free, not
 * be a logistics minigame.
 */

/**
 * Whether the player could hoist this machine right now: hands free, the
 * machine idle and emptied of work materials (shelf stock, mounted tools,
 * and installed upgrades ride along), and no benchtop machines mounted on
 * it if it's a table. Position isn't checked here — the caller picks
 * machines the player is standing at.
 */
export function canPickUpMachine(
  facts: CarryFacts,
  machineState: MachineState,
): boolean {
  const machineIndex = facts.machines.findIndex((m) =>
    isSameMachine(m, machineState),
  );
  return (
    handsFree(facts) &&
    machineIndex !== -1 &&
    machineState.operationProgress.status !== "inProgress" &&
    machineState.inputMaterials.length === 0 &&
    machineState.processingMaterials.length === 0 &&
    machineState.outputMaterials.length === 0 &&
    machinesMountedOnTable(facts.machines, machineIndex).length === 0
  );
}

/**
 * Where the carried machine would land if set down right now: anchored so
 * the player is standing at its operator cell — you place a machine by
 * standing where you'd work it, which guarantees the operator cell is
 * genuinely reachable. Machines with no operator cell (the garbage can)
 * land on the cell the player faces instead.
 */
/** What the set-down placement reads — a structural slice of `GameState`. */
export interface PlacementFacts {
  readonly player: Pick<Person, "carriedMachine" | "position" | "direction">;
}

export function carriedMachinePlacement(
  facts: PlacementFacts,
): { machineType: MachineType; position: Vector; rotation: Direction } | null {
  const carried = facts.player.carriedMachine;
  if (!carried) {
    return null;
  }
  const machineType = MACHINE_TYPES[carried.machineTypeId];
  const rotation = carried.rotation;
  const position = machineType.operationPosition
    ? translateVec(
        facts.player.position,
        scaleVec(rotateVec(machineType.operationPosition, rotation), -1),
      )
    : translateVec(
        facts.player.position,
        rotateVec([1, 0], facts.player.direction),
      );
  return { machineType, position, rotation };
}

/** Whether the carried machine fits where it would land right now. */
export function canPutDownCarriedMachine(
  facts: PlacementFacts,
  cellMap: CellMap,
): boolean {
  const placement = carriedMachinePlacement(facts);
  if (!placement) {
    return false;
  }
  const { machineType, position, rotation } = placement;
  const occupied = getMachineOccupiedCells(machineType, position, rotation);
  return (
    !occupied.some((cell) => vectorEquals(cell, facts.player.position)) &&
    canPlaceMachine(cellMap, machineType, position, rotation)
  );
}
