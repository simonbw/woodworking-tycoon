import { materialMeetsInput } from "../material-helpers";
import { hasConsumables, subtractConsumables } from "../Consumable";
import { machineDustMultiplier, moveDustPenalty } from "../Dust";
import { carryingShopVac, SHOP_VAC_DRAG_PENALTY } from "../ShopVac";
import { CellMap } from "../CellMap";
import { GameAction, MaterialPile } from "../GameState";
import {
  isSameMachine,
  Machine,
  MachineOperation,
  ParameterizedOperation,
  ParameterValues,
  MACHINE_TYPES,
} from "../Machine";
import { MaterialInstance } from "../Materials";
import { Direction, rotateVec, translateVec } from "../Vectors";
import { getOperationInputMaterials } from "../operation-helpers";
import { pileCoversCell } from "../pile-helpers";
import { availableOperations, getOperationPhases } from "../skill-helpers";
import { emitSound } from "./sound-actions";

export function instaMovePlayerAction(direction: Direction): GameAction {
  return (gameState) => {
    const cellMap = CellMap.fromGameState(gameState);
    const destinationPosition = translateVec(
      gameState.player.position,
      rotateVec([1, 0], direction),
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
        // Deep sawdust is slow going, and dragging the vac slower still
        busyTicks:
          moveDustPenalty(gameState.dust, destinationPosition) +
          (carryingShopVac(gameState) ? SHOP_VAC_DRAG_PENALTY : 0),
        position: destinationPosition,
        direction,
      },
    };
  };
}

export function pickUpMaterialAction(
  materialPiles: ReadonlyArray<MaterialPile>,
): GameAction {
  return (gameState) => {
    for (const materialPile of materialPiles) {
      // Long stock overhangs its anchor cell — any overlapped cell is
      // close enough to grab from (see pileFootprint).
      if (!pileCoversCell(materialPile, gameState.player.position)) {
        console.warn("Tried to pick up material from wrong position");
        return gameState;
      }
    }
    return emitSound(
      {
        ...gameState,
        player: {
          ...gameState.player,
          inventory: [
            ...gameState.player.inventory,
            ...materialPiles.map((pile) => pile.material),
          ],
        },
        materialPiles: gameState.materialPiles.filter(
          (pile) => !materialPiles.includes(pile),
        ),
      },
      { kind: "material-pickup" },
    );
  };
}

export function dropMaterialAction(
  materials: ReadonlyArray<MaterialInstance>,
): GameAction {
  return (gameState) => {
    for (const material of materials) {
      if (!gameState.player.inventory.some((item) => item === material)) {
        console.warn("Tried to drop material not in inventory");
        return gameState;
      }
    }
    return emitSound(
      {
        ...gameState,
        player: {
          ...gameState.player,
          inventory: gameState.player.inventory.filter(
            (item) => !materials.includes(item),
          ),
        },
        materialPiles: [
          ...gameState.materialPiles,
          ...materials.map((material) => ({
            material,
            position: gameState.player.position,
          })),
        ],
      },
      { kind: "material-drop" },
    );
  };
}

export function moveMaterialsToMachineAction(
  materials: ReadonlyArray<MaterialInstance>,
  machine: Machine,
): GameAction {
  return (gameState) => {
    const machineState = machine.state;
    const machineType = MACHINE_TYPES[machineState.machineTypeId];
    const spacesRemaining =
      machineType.inputSpaces - machineState.inputMaterials.length;
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
    return emitSound(
      {
        ...gameState,
        player: {
          ...gameState.player,
          inventory: gameState.player.inventory.filter(
            (item) => !materials.includes(item),
          ),
        },
        machines: gameState.machines.map((m) =>
          isSameMachine(m, machineState)
            ? { ...m, inputMaterials: [...m.inputMaterials, ...materials] }
            : m,
        ),
      },
      { kind: "material-drop" },
    );
  };
}

export function takeInputsFromMachineAction(
  materials: ReadonlyArray<MaterialInstance>,
  machine: Machine,
): GameAction {
  return (gameState) => {
    const machineState = machine.state;
    for (const material of materials) {
      if (!machineState.inputMaterials.includes(material)) {
        console.warn("Tried to move material not in machine");
        return gameState;
      }
    }
    return emitSound(
      {
        ...gameState,
        player: {
          ...gameState.player,
          inventory: [...gameState.player.inventory, ...materials],
        },
        machines: gameState.machines.map((m) =>
          isSameMachine(m, machineState)
            ? {
                ...m,
                inputMaterials: m.inputMaterials.filter(
                  (item: MaterialInstance) => !materials.includes(item),
                ),
              }
            : m,
        ),
      },
      { kind: "material-pickup" },
    );
  };
}

/**
 * Parks carried materials on a station's shelf (MachineType.materialStorage
 * spaces). The shelf is a parking spot, not an input queue — stock there
 * never feeds operations until it's taken back out.
 */
export function stowMaterialsInMachineAction(
  materials: ReadonlyArray<MaterialInstance>,
  machine: Machine,
): GameAction {
  return (gameState) => {
    const machineState = machine.state;
    const spacesRemaining =
      machine.type.materialStorage - machine.storedMaterials.length;
    if (materials.length > spacesRemaining) {
      console.warn("Tried to stow more materials than the shelf holds");
      return gameState;
    }

    for (const material of materials) {
      if (!gameState.player.inventory.some((item) => item === material)) {
        console.warn("Tried to stow material not in inventory");
        return gameState;
      }
    }
    return emitSound(
      {
        ...gameState,
        player: {
          ...gameState.player,
          inventory: gameState.player.inventory.filter(
            (item) => !materials.includes(item),
          ),
        },
        machines: gameState.machines.map((m) =>
          isSameMachine(m, machineState)
            ? {
                ...m,
                storedMaterials: [...(m.storedMaterials ?? []), ...materials],
              }
            : m,
        ),
      },
      { kind: "material-drop" },
    );
  };
}

/** Takes materials back off a station's shelf into the player's arms. */
export function takeStoredMaterialsFromMachineAction(
  materials: ReadonlyArray<MaterialInstance>,
  machine: Machine,
): GameAction {
  return (gameState) => {
    const machineState = machine.state;
    for (const material of materials) {
      if (!machine.storedMaterials.includes(material)) {
        console.warn("Tried to take material not on the shelf");
        return gameState;
      }
    }
    return emitSound(
      {
        ...gameState,
        player: {
          ...gameState.player,
          inventory: [...gameState.player.inventory, ...materials],
        },
        machines: gameState.machines.map((m) =>
          isSameMachine(m, machineState)
            ? {
                ...m,
                storedMaterials: (m.storedMaterials ?? []).filter(
                  (item: MaterialInstance) => !materials.includes(item),
                ),
              }
            : m,
        ),
      },
      { kind: "material-pickup" },
    );
  };
}

export function takeOutputsFromMachineAction(
  materials: ReadonlyArray<MaterialInstance>,
  machine: Machine,
): GameAction {
  return (gameState) => {
    const machineState = machine.state;
    for (const material of materials) {
      if (!machineState.outputMaterials.includes(material)) {
        console.warn("Tried to move material not in machine");
        return gameState;
      }
    }
    return emitSound(
      {
        ...gameState,
        player: {
          ...gameState.player,
          inventory: [...gameState.player.inventory, ...materials],
        },
        machines: gameState.machines.map((m) =>
          isSameMachine(m, machineState)
            ? {
                ...m,
                outputMaterials: m.outputMaterials.filter(
                  (item: MaterialInstance) => !materials.includes(item),
                ),
              }
            : m,
        ),
      },
      { kind: "material-pickup" },
    );
  };
}

export function setMachineOperationAction(
  machine: Machine,
  operation: MachineOperation | ParameterizedOperation,
  parameters?: ParameterValues,
): GameAction {
  return (gameState) => {
    const machineState = machine.state;
    if (
      !availableOperations(machine, gameState.progression).includes(operation)
    ) {
      throw new Error("Tried to set machine operation to invalid operation");
    }

    return {
      ...gameState,
      machines: gameState.machines.map((m) =>
        isSameMachine(m, machineState)
          ? {
              ...m,
              selectedOperationId: operation.id,
              selectedParameters: parameters,
            }
          : m,
      ),
    };
  };
}

/**
 * Flip a machine's power switch. Only meaningful on types with
 * `powerSwitch`; switching off mid-operation pauses the cut (the wood
 * stays put) until the machine is switched back on.
 */
export function toggleMachinePowerAction(machine: Machine): GameAction {
  return (gameState) => {
    if (!machine.type.powerSwitch) {
      return gameState;
    }
    return {
      ...gameState,
      machines: gameState.machines.map((m) =>
        isSameMachine(m, machine.state)
          ? { ...m, poweredOn: !(m.poweredOn ?? false) }
          : m,
      ),
    };
  };
}

export function operateMachineAction(machine: Machine): GameAction {
  return (gameState) => {
    const machineState = machine.state;
    // Can't start a new operation if one is in progress
    if (machineState.operationProgress.status === "inProgress") {
      console.warn("Machine is already operating");
      return gameState;
    }

    // Flipping the switch is its own step — no power, no cut
    if (!machine.isPowered) {
      console.warn("Machine is switched off");
      return gameState;
    }

    const inventory = [...machineState.inputMaterials];
    const materialsToConsume: MaterialInstance[] = [];

    // Validate that we have all required materials
    const inputMaterials = getOperationInputMaterials(
      machine.selectedOperation,
      machineState.selectedParameters,
    );

    for (const inputMaterial of inputMaterials) {
      for (let i = 0; i < inputMaterial.quantity; i++) {
        const index = inventory.findIndex((m) =>
          materialMeetsInput(m, inputMaterial),
        );
        if (index === -1) {
          console.warn("Tried to perform operation without required materials");
          return gameState;
        }
        materialsToConsume.push(inventory[index]);
        inventory.splice(index, 1);
      }
    }

    // Supplies are spent up front — once the operation starts, the glue is
    // out of the bottle and the nails are in the wood.
    const consumableCosts = machine.selectedOperation.requiredConsumables ?? [];
    if (!hasConsumables(gameState.consumables, consumableCosts)) {
      console.warn("Tried to perform operation without required supplies");
      return gameState;
    }

    // Start the operation - move materials to processing and enter phase 0
    const [firstPhase] = getOperationPhases(
      machine.selectedOperation,
      gameState.progression,
      machineDustMultiplier(gameState.dust, machine, gameState.shopInfo.size),
      machine.type.workSpeed,
    );
    return {
      ...gameState,
      consumables: subtractConsumables(gameState.consumables, consumableCosts),
      machines: gameState.machines.map((m) =>
        isSameMachine(m, machineState)
          ? {
              ...m,
              inputMaterials: inventory,
              processingMaterials: materialsToConsume,
              operationProgress: {
                status: "inProgress" as const,
                phaseIndex: 0,
                ticksRemaining: firstPhase.duration,
              },
            }
          : m,
      ),
    };
  };
}
