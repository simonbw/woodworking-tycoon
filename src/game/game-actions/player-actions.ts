import { materialMeetsInput } from "../material-helpers";
import { CellMap } from "../CellMap";
import { GameAction, MaterialPile } from "../GameState";
import { Machine, MachineOperation, ParameterizedOperation, ParameterValues } from "../Machine";
import { MaterialInstance } from "../Materials";
import { Direction, rotateVec, translateVec, vectorEquals } from "../Vectors";
import { getOperationInputMaterials } from "../operation-helpers";

export function instaMovePlayerAction(direction: Direction): GameAction {
  return (gameState) => {
    const cellMap = CellMap.fromGameState(gameState);
    const destinationPosition = translateVec(
      gameState.player.position,
      rotateVec([1, 0], direction)
    );
    const destinationCell = cellMap.at(destinationPosition);
    if (destinationCell === undefined || destinationCell.machine) {
      return { ...gameState, player: { ...gameState.player, direction } };
    }
    return {
      ...gameState,
      player: {
        ...gameState.player,
        canWork: false,
        position: destinationPosition,
        direction,
      },
    };
  };
}

export function pickUpMaterialAction(
  materialPiles: ReadonlyArray<MaterialPile>
): GameAction {
  return (gameState) => {
    for (const materialPile of materialPiles) {
      if (!vectorEquals(gameState.player.position, materialPile.position)) {
        console.warn("Tried to pick up material from wrong position");
        return gameState;
      }
    }
    return {
      ...gameState,
      player: {
        ...gameState.player,
        inventory: [
          ...gameState.player.inventory,
          ...materialPiles.map((pile) => pile.material),
        ],
      },
      materialPiles: gameState.materialPiles.filter(
        (pile) => !materialPiles.includes(pile)
      ),
    };
  };
}

export function dropMaterialAction(
  materials: ReadonlyArray<MaterialInstance>
): GameAction {
  return (gameState) => {
    for (const material of materials) {
      if (!gameState.player.inventory.some((item) => item === material)) {
        console.warn("Tried to drop material not in inventory");
        return gameState;
      }
    }
    return {
      ...gameState,
      player: {
        ...gameState.player,
        inventory: gameState.player.inventory.filter(
          (item) => !materials.includes(item)
        ),
      },
      materialPiles: [
        ...gameState.materialPiles,
        ...materials.map((material) => ({
          material,
          position: gameState.player.position,
        })),
      ],
    };
  };
}

export function moveMaterialsToMachineAction(
  materials: ReadonlyArray<MaterialInstance>,
  machine: Machine
): GameAction {
  return (gameState) => {
    const spacesRemaining =
      machine.type.inputSpaces - machine.inputMaterials.length;
    if (materials.length > spacesRemaining) {
      console.warn("Tried to move too many materials to machine");
      return gameState;
    }

    for (const material of materials) {
      if (!gameState.player.inventory.some((item) => item === material)) {
        console.warn("Tried to move material not in inventory");
        return gameState;
      }
    }
    return {
      ...gameState,
      player: {
        ...gameState.player,
        inventory: gameState.player.inventory.filter(
          (item) => !materials.includes(item)
        ),
      },
      machines: gameState.machines.map((m) =>
        m === machine
          ? { ...m, inputMaterials: [...m.inputMaterials, ...materials] }
          : m
      ),
    };
  };
}

export function takeInputsFromMachineAction(
  materials: ReadonlyArray<MaterialInstance>,
  machine: Machine
): GameAction {
  return (gameState) => {
    for (const material of materials) {
      if (!machine.inputMaterials.includes(material)) {
        console.warn("Tried to move material not in machine");
        return gameState;
      }
    }
    return {
      ...gameState,
      player: {
        ...gameState.player,
        inventory: [...gameState.player.inventory, ...materials],
      },
      machines: gameState.machines.map((m) =>
        m === machine
          ? {
              ...m,
              inputMaterials: m.inputMaterials.filter(
                (item) => !materials.includes(item)
              ),
            }
          : m
      ),
    };
  };
}

export function takeOutputsFromMachineAction(
  materials: ReadonlyArray<MaterialInstance>,
  machine: Machine
): GameAction {
  return (gameState) => {
    for (const material of materials) {
      if (!machine.outputMaterials.includes(material)) {
        console.warn("Tried to move material not in machine");
        return gameState;
      }
    }
    return {
      ...gameState,
      player: {
        ...gameState.player,
        inventory: [...gameState.player.inventory, ...materials],
      },
      machines: gameState.machines.map((m) =>
        m === machine
          ? {
              ...m,
              outputMaterials: m.outputMaterials.filter(
                (item) => !materials.includes(item)
              ),
            }
          : m
      ),
    };
  };
}

export function setMachineOperationAction(
  machine: Machine,
  operation: MachineOperation | ParameterizedOperation,
  parameters?: ParameterValues
): GameAction {
  return (gameState) => {
    if (!machine.type.operations.includes(operation)) {
      throw new Error("Tried to set machine operation to invalid operation");
    }

    return {
      ...gameState,
      machines: gameState.machines.map((m) =>
        m === machine ? { ...m, selectedOperation: operation, selectedParameters: parameters } : m
      ),
    };
  };
}

export function operateMachineAction(machine: Machine): GameAction {
  return (gameState) => {
    // Can't start a new operation if one is in progress
    if (machine.operationProgress.status === "inProgress") {
      console.warn("Machine is already operating");
      return gameState;
    }

    const inventory = [...machine.inputMaterials];
    const materialsToConsume: MaterialInstance[] = [];

    // Validate that we have all required materials
    const inputMaterials = getOperationInputMaterials(
      machine.selectedOperation,
      machine.selectedParameters
    );
    
    for (const inputMaterial of inputMaterials) {
      for (let i = 0; i < inputMaterial.quantity; i++) {
        const index = inventory.findIndex((m) =>
          materialMeetsInput(m, inputMaterial)
        );
        if (index === -1) {
          console.warn("Tried to perform operation without required materials");
          return gameState;
        }
        materialsToConsume.push(inventory[index]);
        inventory.splice(index, 1);
      }
    }

    // Start the operation - move materials to processing and set timer
    return {
      ...gameState,
      machines: gameState.machines.map((m) =>
        m === machine
          ? {
              ...m,
              inputMaterials: inventory,
              processingMaterials: materialsToConsume,
              operationProgress: {
                status: "inProgress" as const,
                ticksRemaining: machine.selectedOperation.duration,
              },
            }
          : m
      ),
    };
  };
}
