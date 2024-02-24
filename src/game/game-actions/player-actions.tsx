import { materialMeetsInput } from "../../components/useGameHelpers";
import { CellMap } from "../CellMap";
import { GameAction, GameState } from "../GameState";
import { MachineOperation } from "../MachineType";
import { MaterialInstance } from "../Materials";
import { Direction, rotateVec, translateVec } from "../Vectors";

export function performOperationAction(
  operation: MachineOperation
): GameAction {
  return (gameState: GameState): GameState => {
    console.log("Performing Operation", operation);

    const inventory = [...gameState.player.inventory];

    const materialsToConsume: MaterialInstance[] = [];

    for (const inputMaterial of operation.inputMaterials) {
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

    const outputMaterials = operation.output(materialsToConsume);

    return {
      ...gameState,
      player: {
        ...gameState.player,
        inventory: [...inventory, ...outputMaterials],
      },
    };
  };
}

export function instaMovePlayerAction(direction: Direction): GameAction {
  return (gameState) => {
    const cellMap = CellMap.fromGameState(gameState);
    const destinationPosition = translateVec(
      gameState.player.position,
      rotateVec([1, 0], direction)
    );
    const destinationCell = cellMap.at(destinationPosition);
    if (destinationCell === undefined || destinationCell.machine) {
      return gameState;
    }
    return {
      ...gameState,
      player: {
        ...gameState.player,
        canWork: false,
        position: destinationPosition,
      },
    };
  };
}
