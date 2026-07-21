import { GameAction, GameState } from "../GameState";
import {
  isSameMachine,
  Machine,
  MACHINE_TYPES,
  MachineId,
  MachineState,
  MachineType,
} from "../Machine";
import { MaterialInstance } from "../Materials";
import { Direction, rotateVec, translateVec, Vector } from "../Vectors";
import { CellMap } from "../CellMap";

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
  const unlessExcluded = (occupant: Machine | undefined): Machine | undefined =>
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
 * Gets all free cells needed by a machine at the given position and rotation
 * Useful for highlighting during placement preview
 */
export function getMachineFreeCells(
  machineType: MachineType,
  position: Vector,
  rotation: Direction,
): Vector[] {
  return machineType.freeCellsNeeded.map((relativeCell) =>
    translateVec(rotateVec(relativeCell, rotation), position),
  );
}

/**
 * The benchtop machines sitting on a worktable's cells. A table with
 * machines mounted can't be moved or removed — take the machines off
 * first.
 */
export function machinesMountedOnTable(
  gameState: GameState,
  tableIndex: number,
): ReadonlyArray<MachineState> {
  const table = gameState.machines[tableIndex];
  const tableType = MACHINE_TYPES[table.machineTypeId];
  if (!tableType.worktable) {
    return [];
  }
  const tableCells = getMachineOccupiedCells(
    tableType,
    table.position,
    table.rotation,
  ).map((cell) => cell.join(","));
  return gameState.machines.filter((machine, index) => {
    if (index === tableIndex) {
      return false;
    }
    const machineType = MACHINE_TYPES[machine.machineTypeId];
    return getMachineOccupiedCells(
      machineType,
      machine.position,
      machine.rotation,
    ).some((cell) => tableCells.includes(cell.join(",")));
  });
}

/**
 * Drops materials from a machine at a specific position
 */
function dropMachineMaterials(
  gameState: GameState,
  position: Vector,
  materials: ReadonlyArray<MaterialInstance>,
): GameState {
  if (materials.length === 0) {
    return gameState;
  }

  return {
    ...gameState,
    materialPiles: [
      ...gameState.materialPiles,
      ...materials.map((material) => ({
        material,
        position,
      })),
    ],
  };
}

/**
 * Places a machine from storage onto the shop floor
 */
export function placeMachineAction(
  machineTypeId: MachineId,
  position: Vector,
  rotation: Direction = 0,
): GameAction {
  return (gameState) => {
    // Verify machine is in storage
    if (!gameState.storage.machines.includes(machineTypeId)) {
      console.warn(
        `Tried to place machine ${machineTypeId} but it's not in storage`,
      );
      return gameState;
    }

    // Remove one instance of this machine from storage
    const storageIndex = gameState.storage.machines.indexOf(machineTypeId);
    const updatedStorage = [
      ...gameState.storage.machines.slice(0, storageIndex),
      ...gameState.storage.machines.slice(storageIndex + 1),
    ];

    const machineType = MACHINE_TYPES[machineTypeId];
    if (!machineType) {
      console.warn(`Unknown machine type: ${machineTypeId}`);
      return gameState;
    }

    // Create new machine state; default to the first UNLOCKED operation
    const unlockedOps = machineType.operations.filter(
      (op: { requiredSkill?: string }) =>
        !op.requiredSkill ||
        (
          gameState.progression.unlockedSkills as ReadonlyArray<string>
        ).includes(op.requiredSkill),
    );
    const newMachine = {
      machineTypeId,
      position,
      rotation,
      selectedOperationId: unlockedOps.length > 0 ? unlockedOps[0].id : "none",
      selectedParameters: undefined,
      operationProgress: {
        status: "notStarted" as const,
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

    return {
      ...gameState,
      storage: {
        ...gameState.storage,
        machines: updatedStorage,
      },
      machines: [...gameState.machines, newMachine],
    };
  };
}

/**
 * Moves a placed machine to a new position and/or rotation
 * Drops all materials at the old position (shelf stock rides along —
 * that's what the shelf is for)
 */
export function moveMachineAction(
  machineIndex: number,
  newPosition: Vector,
  newRotation: Direction,
): GameAction {
  return (gameState) => {
    if (machineIndex < 0 || machineIndex >= gameState.machines.length) {
      console.warn(`Invalid machine index: ${machineIndex}`);
      return gameState;
    }

    if (machinesMountedOnTable(gameState, machineIndex).length > 0) {
      console.warn("Can't move a worktable with machines mounted on it");
      return gameState;
    }

    const machine = gameState.machines[machineIndex];
    const oldPosition = machine.position;

    // Collect all materials from the machine
    const allMaterials = [
      ...machine.inputMaterials,
      ...machine.processingMaterials,
      ...machine.outputMaterials,
    ];

    // Drop materials at old position
    let updatedState = dropMachineMaterials(
      gameState,
      oldPosition,
      allMaterials,
    );

    // Update machine with new position/rotation and clear materials
    const updatedMachines = [...updatedState.machines];
    updatedMachines[machineIndex] = {
      ...machine,
      position: newPosition,
      rotation: newRotation,
      inputMaterials: [],
      processingMaterials: [],
      outputMaterials: [],
    };

    return {
      ...updatedState,
      machines: updatedMachines,
    };
  };
}

/**
 * Removes a machine from the shop floor and returns it to storage
 * Drops all materials at the machine's position
 */
export function removeMachineToStorageAction(machineIndex: number): GameAction {
  return (gameState) => {
    if (machineIndex < 0 || machineIndex >= gameState.machines.length) {
      console.warn(`Invalid machine index: ${machineIndex}`);
      return gameState;
    }

    if (machinesMountedOnTable(gameState, machineIndex).length > 0) {
      console.warn("Can't remove a worktable with machines mounted on it");
      return gameState;
    }

    const machine = gameState.machines[machineIndex];

    // Collect all materials from the machine — the shelf empties too, since
    // a machine in storage is just an id
    const allMaterials = [
      ...machine.inputMaterials,
      ...machine.processingMaterials,
      ...machine.outputMaterials,
      ...(machine.storedMaterials ?? []),
    ];

    // Drop materials at machine position
    let updatedState = dropMachineMaterials(
      gameState,
      machine.position,
      allMaterials,
    );

    // Remove machine from placed machines
    const updatedMachines = [
      ...updatedState.machines.slice(0, machineIndex),
      ...updatedState.machines.slice(machineIndex + 1),
    ];

    // Add machine back to storage; mounted tools and installed upgrades
    // go to their own storage so they're never destroyed with the station
    const updatedStorage = [
      ...updatedState.storage.machines,
      machine.machineTypeId,
    ];
    const updatedTools = [...updatedState.storage.tools, ...machine.tools];
    const updatedUpgrades = [
      ...updatedState.storage.upgrades,
      ...(machine.upgrades ?? []),
    ];

    return {
      ...updatedState,
      machines: updatedMachines,
      storage: {
        ...updatedState.storage,
        machines: updatedStorage,
        tools: updatedTools,
        upgrades: updatedUpgrades,
      },
    };
  };
}
