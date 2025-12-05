import { GameAction } from "../GameState";
import { MachineId, MachineType } from "../Machine";
import { Direction, rotateVec, translateVec, Vector } from "../Vectors";
import { CellMap } from "../CellMap";

/**
 * Validates whether a machine can be placed at the given position and rotation
 * @param excludeMachineIndex - Optional machine index to exclude from collision checks (for moving)
 */
export function canPlaceMachine(
  cellMap: CellMap,
  machineType: MachineType,
  position: Vector,
  rotation: Direction,
  excludeMachineIndex?: number
): boolean {
  // Check all cells the machine occupies
  for (const relativeCell of machineType.cellsOccupied) {
    const absolutePosition = translateVec(
      rotateVec(relativeCell, rotation),
      position
    );

    // Check if cell exists in the map
    if (!cellMap.has(absolutePosition)) {
      return false;
    }

    // Check if cell is free (no machine, or the machine is the one being moved)
    const cell = cellMap.at(absolutePosition);
    if (cell?.machine !== undefined) {
      // If we're excluding a specific machine (during move), check if this is it
      if (excludeMachineIndex !== undefined) {
        const machines = cellMap.getCells()
          .flatMap(c => c.machine ? [c.machine] : []);
        const machineAtCell = cell.machine;
        const machineIndex = machines.indexOf(machineAtCell);

        // If this is the machine being moved, allow it
        if (machineIndex === excludeMachineIndex) {
          continue;
        }
      }
      return false;
    }
  }

  // Check all free cells needed by the machine
  for (const relativeCell of machineType.freeCellsNeeded) {
    const absolutePosition = translateVec(
      rotateVec(relativeCell, rotation),
      position
    );

    // Check if cell exists in the map
    if (!cellMap.has(absolutePosition)) {
      return false;
    }

    // Check if cell is free (no machine, or the machine is the one being moved)
    const cell = cellMap.at(absolutePosition);
    if (cell?.machine !== undefined) {
      // If we're excluding a specific machine (during move), check if this is it
      if (excludeMachineIndex !== undefined) {
        const machines = cellMap.getCells()
          .flatMap(c => c.machine ? [c.machine] : []);
        const machineAtCell = cell.machine;
        const machineIndex = machines.indexOf(machineAtCell);

        // If this is the machine being moved, allow it
        if (machineIndex === excludeMachineIndex) {
          continue;
        }
      }
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
  rotation: Direction
): Vector[] {
  return machineType.cellsOccupied.map((relativeCell) =>
    translateVec(rotateVec(relativeCell, rotation), position)
  );
}

/**
 * Gets all free cells needed by a machine at the given position and rotation
 * Useful for highlighting during placement preview
 */
export function getMachineFreeCells(
  machineType: MachineType,
  position: Vector,
  rotation: Direction
): Vector[] {
  return machineType.freeCellsNeeded.map((relativeCell) =>
    translateVec(rotateVec(relativeCell, rotation), position)
  );
}

/**
 * Drops materials from a machine at a specific position
 */
function dropMachineMaterials(
  gameState: GameAction extends (state: infer S) => any ? S : never,
  position: Vector,
  materials: ReadonlyArray<any>
): any {
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
  rotation: Direction = 0
): GameAction {
  return (gameState) => {
    // Verify machine is in storage
    if (!gameState.storage.machines.includes(machineTypeId)) {
      console.warn(
        `Tried to place machine ${machineTypeId} but it's not in storage`
      );
      return gameState;
    }

    // Remove one instance of this machine from storage
    const storageIndex = gameState.storage.machines.indexOf(machineTypeId);
    const updatedStorage = [
      ...gameState.storage.machines.slice(0, storageIndex),
      ...gameState.storage.machines.slice(storageIndex + 1),
    ];

    // Get the machine type to find its default operation
    const machineType = require("../Machine").MACHINE_TYPES[machineTypeId];
    if (!machineType) {
      console.warn(`Unknown machine type: ${machineTypeId}`);
      return gameState;
    }

    // Create new machine state
    const newMachine = {
      machineTypeId,
      position,
      rotation,
      selectedOperationId:
        machineType.operations.length > 0
          ? machineType.operations[0].id
          : "none",
      selectedParameters: undefined,
      operationProgress: {
        status: "notStarted" as const,
        ticksRemaining: 0,
      },
      inputMaterials: [],
      processingMaterials: [],
      outputMaterials: [],
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
 * Drops all materials at the old position
 */
export function moveMachineAction(
  machineIndex: number,
  newPosition: Vector,
  newRotation: Direction
): GameAction {
  return (gameState) => {
    if (machineIndex < 0 || machineIndex >= gameState.machines.length) {
      console.warn(`Invalid machine index: ${machineIndex}`);
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
    let updatedState = dropMachineMaterials(gameState, oldPosition, allMaterials);

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

    const machine = gameState.machines[machineIndex];

    // Collect all materials from the machine
    const allMaterials = [
      ...machine.inputMaterials,
      ...machine.processingMaterials,
      ...machine.outputMaterials,
    ];

    // Drop materials at machine position
    let updatedState = dropMachineMaterials(gameState, machine.position, allMaterials);

    // Remove machine from placed machines
    const updatedMachines = [
      ...updatedState.machines.slice(0, machineIndex),
      ...updatedState.machines.slice(machineIndex + 1),
    ];

    // Add machine back to storage
    const updatedStorage = [
      ...updatedState.storage.machines,
      machine.machineTypeId,
    ];

    return {
      ...updatedState,
      machines: updatedMachines,
      storage: {
        ...updatedState.storage,
        machines: updatedStorage,
      },
    };
  };
}
