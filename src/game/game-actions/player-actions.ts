import { materialMeetsInput } from "../../components/useGameHelpers";
import { CellMap } from "../CellMap";
import { GameAction, MaterialPile } from "../GameState";
import { Machine } from "../Machine";
import { MachineOperation } from "../Machine";
import { MaterialInstance } from "../Materials";
import { Direction, rotateVec, translateVec, vectorEquals } from "../Vectors";

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

export function pickUpMaterialAction(materialPile: MaterialPile): GameAction {
  return (gameState) => {
    if (!vectorEquals(gameState.player.position, materialPile.position)) {
      console.warn("Tried to pick up material from wrong position");
    }
    return {
      ...gameState,
      player: {
        ...gameState.player,
        inventory: [...gameState.player.inventory, materialPile.material],
      },
      materialPiles: gameState.materialPiles.filter(
        (pile) => pile !== materialPile
      ),
    };
  };
}

export function dropMaterialAction(material: MaterialInstance): GameAction {
  return (gameState) => {
    if (!gameState.player.inventory.some((item) => item === material)) {
      console.warn("Tried to drop material not in inventory");
    }
    return {
      ...gameState,
      player: {
        ...gameState.player,
        inventory: gameState.player.inventory.filter(
          (item) => item !== material
        ),
      },
      materialPiles: [
        ...gameState.materialPiles,
        { material, position: gameState.player.position },
      ],
    };
  };
}

export function moveMaterialToMachineAction(
  material: MaterialInstance,
  machine: Machine
): GameAction {
  return (gameState) => {
    if (!gameState.player.inventory.some((item) => item === material)) {
      console.warn("Tried to move material not in inventory");
    }
    return {
      ...gameState,
      player: {
        ...gameState.player,
        inventory: gameState.player.inventory.filter(
          (item) => item !== material
        ),
      },
      machines: gameState.machines.map((m) =>
        m === machine
          ? { ...m, inputMaterials: [...m.inputMaterials, material] }
          : m
      ),
    };
  };
}

export function takeInputFromMachineAction(
  materials: ReadonlyArray<MaterialInstance>,
  machine: Machine
): GameAction {
  return (gameState) => {
    if (
      !materials.every((material) => machine.inputMaterials.includes(material))
    ) {
      console.warn("Tried to move material not in machine");
      return gameState;
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

export function takeOutputFromMachineAction(
  materials: ReadonlyArray<MaterialInstance>,
  machine: Machine
): GameAction {
  return (gameState) => {
    if (
      !materials.every((material) => machine.outputMaterials.includes(material))
    ) {
      console.warn("Tried to move material not in machine");
      return gameState;
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
  operation: MachineOperation
): GameAction {
  return (gameState) => {
    if (!machine.type.operations.includes(operation)) {
      throw new Error("Tried to set machine operation to invalid operation");
    }

    return {
      ...gameState,
      machines: gameState.machines.map((m) =>
        m === machine ? { ...m, selectedOperation: operation } : m
      ),
    };
  };
}

export function operateMachineAction(machine: Machine): GameAction {
  return (gameState) => {
    const inventory = [...machine.inputMaterials];
    const materialsToConsume: MaterialInstance[] = [];

    for (const inputMaterial of machine.selectedOperation.inputMaterials) {
      for (let i = 0; i < inputMaterial.quantity; i++) {
        // TODO: Quantity
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

    const { inputs, outputs } =
      machine.selectedOperation.output(materialsToConsume);

    inventory.push(...inputs);

    return {
      ...gameState,
      machines: gameState.machines.map((m) =>
        m === machine
          ? {
              ...m,
              inputMaterials: inventory,
              outputMaterials: [...m.outputMaterials, ...outputs],
            }
          : m
      ),
    };
  };
}
