import { materialMeetsInput } from "../material-helpers";
import { stationWorkSpeed } from "../bench-mounting";
import { seatedAssemblyPieces } from "../bench-work/assembly";
import { productBlueprintFor } from "../bench-work/blueprint";
import { CellMap } from "../CellMap";
import { clampsFor, clampsFree } from "../Clamp";
import { hasConsumables, subtractConsumables } from "../Consumable";
import { machineDustMultiplier } from "../Dust";
import { feedClearanceShortfall } from "../feed-clearance";
import { heldTool } from "../HeldTool";
import { handSpaceLeft } from "../Person";
import { findFeedableOperation } from "../machine-helpers";
import { GameAction } from "../GameState";
import {
  defaultParametersFor,
  isSameMachine,
  Machine,
  ParameterValues,
  MACHINE_TYPES,
} from "../Machine";
import { MaterialInstance } from "../Materials";
import { availableOperations, getOperationPhases } from "../skill-helpers";
import { isNight } from "../time-flow";
import { emitSound } from "./sound-actions";

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
    if (heldTool(gameState) !== null) {
      console.warn("Tried to take materials while holding a tool");
      return gameState;
    }
    if (materials.length > handSpaceLeft(gameState.player)) {
      console.warn("Tried to take more than the hands can carry");
      return gameState;
    }
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
      machine.materialStorage - machine.storedMaterials.length;
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
    if (heldTool(gameState) !== null) {
      console.warn("Tried to take materials while holding a tool");
      return gameState;
    }
    if (materials.length > handSpaceLeft(gameState.player)) {
      console.warn("Tried to take more than the hands can carry");
      return gameState;
    }
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

/**
 * Flip a machine's power switch. Only meaningful on types with
 * `powerSwitch`; switching off mid-operation pauses the cut (the wood
 * stays put) until the machine is switched back on.
 */
/**
 * Record whether the player is holding the operate key. Attended work
 * reads this every tick, so releasing the key pauses the cut exactly like
 * walking away from it does.
 */
export function setOperatingAction(operating: boolean): GameAction {
  return (gameState) =>
    gameState.player.operating === operating
      ? gameState
      : { ...gameState, player: { ...gameState.player, operating } };
}

/**
 * A tool-first start from the bench view: the held tool applied to the
 * very piece under it. Names the operation (chosen by tool + piece, see
 * bench-work/tool-work.ts), the one material to claim, and any
 * parameters the gesture itself decided (the saw's mark).
 */
export interface BenchToolClaim {
  readonly operationId: string;
  readonly materialId: string;
  readonly parameters?: ParameterValues;
}

export function operateMachineAction(
  machine: Machine,
  toolClaim?: BenchToolClaim,
): GameAction {
  return (gameState) => {
    const machineState = machine.state;
    // Can't start a new operation if one is in progress
    if (machineState.operationProgress.status === "inProgress") {
      console.warn("Machine is already operating");
      return gameState;
    }

    // After 5 PM nothing new starts — what's already running may finish,
    // but the next cut belongs to tomorrow (see time-flow.ts)
    if (isNight(gameState)) {
      console.warn("Shop's closed for the night");
      return gameState;
    }

    // Flipping the switch is its own step — no power, no cut
    if (!machine.isPowered) {
      console.warn("Machine is switched off");
      return gameState;
    }

    // The bench-top mirror of the direct-feed branch below: the tool in
    // hand and the piece under it decided the operation, so the claim
    // takes exactly that piece — never the first match, which with spare
    // stock lying around would sand a board nobody was touching. The
    // inferred operation is recorded so completion knows what it's
    // finishing, same as a direct-feed cut.
    if (toolClaim) {
      const operation = availableOperations(
        machine,
        gameState.progression,
      ).find((op) => op.id === toolClaim.operationId);
      // The piece may be staged stock or finished work still lying on the
      // bench (a saw's offcut) — the tool doesn't care which bay it's in,
      // it works the piece where it lies.
      const material = [
        ...machineState.inputMaterials,
        ...machineState.outputMaterials,
      ].find((m) => m.id === toolClaim.materialId);
      if (!operation || !material) {
        console.warn("No such operation or piece to start tool work on");
        return gameState;
      }
      const parameters: ParameterValues = {
        ...machineState.selectedParameters,
        ...toolClaim.parameters,
      };
      const input = operation.getInputMaterials({
        ...defaultParametersFor(operation),
        ...parameters,
      })[0];
      if (!input || !materialMeetsInput(material, input)) {
        console.warn("The piece under the tool doesn't take this work");
        return gameState;
      }
      const consumableCosts = operation.requiredConsumables ?? [];
      if (!hasConsumables(gameState.consumables, consumableCosts)) {
        console.warn("Tried to perform operation without required supplies");
        return gameState;
      }
      if (
        clampsFor(operation) > clampsFree(gameState.clamps, gameState.machines)
      ) {
        console.warn("Tried to perform operation without enough free clamps");
        return gameState;
      }
      const [firstPhase] = getOperationPhases(
        operation,
        gameState.progression,
        machineDustMultiplier(gameState.dust, machine, gameState.shopInfo.size),
        stationWorkSpeed(machine, gameState),
      );
      return {
        ...gameState,
        consumables: subtractConsumables(
          gameState.consumables,
          consumableCosts,
        ),
        machines: gameState.machines.map((m) =>
          isSameMachine(m, machineState)
            ? {
                ...m,
                selectedOperationId: operation.id,
                selectedParameters: parameters,
                inputMaterials: machineState.inputMaterials.filter(
                  (candidate) => candidate.id !== material.id,
                ),
                outputMaterials: machineState.outputMaterials.filter(
                  (candidate) => candidate.id !== material.id,
                ),
                processingMaterials: [material],
                operationProgress: {
                  status: "inProgress" as const,
                  phaseIndex: 0,
                  ticksRemaining: firstPhase.duration,
                },
              }
            : m,
        ),
      };
    }

    // Direct-feed machines run whatever is sitting on them — set down
    // first (F), triggered after (Space) — and that stock decides which
    // operation runs (see findFeedableOperation)
    if (machine.type.directFeed) {
      const match = findFeedableOperation(
        machine,
        availableOperations(machine, gameState.progression),
        machineState.inputMaterials,
      );
      if (!match) {
        console.warn("Nothing on the machine that it is set up to take");
        return gameState;
      }
      // Long stock needs clear lane to travel through the machine — see
      // feed-clearance.ts. The chips explain the shortfall; this is the
      // backstop that keeps the cut from running anyway.
      if (
        feedClearanceShortfall(
          machine,
          match.materials,
          CellMap.fromGameState(gameState),
        )
      ) {
        console.warn("No room to run the stock through the machine");
        return gameState;
      }
      const consumableCosts = match.operation.requiredConsumables ?? [];
      if (!hasConsumables(gameState.consumables, consumableCosts)) {
        console.warn("Tried to perform operation without required supplies");
        return gameState;
      }
      if (
        clampsFor(match.operation) >
        clampsFree(gameState.clamps, gameState.machines)
      ) {
        console.warn("Tried to perform operation without enough free clamps");
        return gameState;
      }
      const [firstPhase] = getOperationPhases(
        match.operation,
        gameState.progression,
        machineDustMultiplier(gameState.dust, machine, gameState.shopInfo.size),
        stationWorkSpeed(machine, gameState),
      );
      return {
        ...gameState,
        consumables: subtractConsumables(
          gameState.consumables,
          consumableCosts,
        ),
        machines: gameState.machines.map((m) =>
          isSameMachine(m, machineState)
            ? {
                ...m,
                // The inferred operation is recorded (with its resolved
                // parameters) so completion knows what it's finishing
                selectedOperationId: match.operation.id,
                selectedParameters: match.parameters,
                // Anything on the table the cut didn't claim stays there
                inputMaterials: [...match.remaining],
                processingMaterials: [...match.materials],
                operationProgress: {
                  status: "inProgress" as const,
                  phaseIndex: 0,
                  ticksRemaining: firstPhase.duration,
                },
              }
            : m,
        ),
      };
    }

    const inventory = [...machineState.inputMaterials];
    const materialsToConsume: MaterialInstance[] = [];

    // A selection the machine no longer knows (a tool was unmounted, an
    // old save) refuses quietly — the getter's throw must never escape a
    // reducer and take the shop down with it.
    const selectedOperation = machine.selectedOperationOrNull;
    if (!selectedOperation) {
      console.warn("No known operation selected to start");
      return gameState;
    }

    // A blueprint build consumes the very boards seated on its outlines —
    // with spare matching stock lying on the bench, first-match would take
    // the spares and leave the seated boards under the finished piece. A
    // slot nobody seated (the ShopDriver skips the mini-game) still fills
    // by first match, in slot order so the bill of materials lines up.
    const interaction = selectedOperation.interaction;
    const blueprint =
      interaction?.kind === "assembly"
        ? productBlueprintFor(interaction.blueprint)
        : null;
    if (blueprint) {
      const seatedBySlot = seatedAssemblyPieces(machine, blueprint);
      // Every seated board is claimed before any unseated slot goes
      // looking, in two passes: one pass in slot order would let an
      // unseated slot's first match take the very board a *later* slot
      // has seated, and that slot then finds nothing and the build
      // refuses with stock lying right there on its outline.
      const picked = new Map<string, MaterialInstance>();
      const take = (slotId: string, index: number): boolean => {
        if (index === -1) {
          return false;
        }
        picked.set(slotId, inventory[index]);
        inventory.splice(index, 1);
        return true;
      };
      for (const slot of blueprint.slots) {
        const seatedId = seatedBySlot.get(slot.id)?.id;
        if (seatedId === undefined) {
          continue;
        }
        if (
          !take(
            slot.id,
            inventory.findIndex((m) => m.id === seatedId),
          )
        ) {
          console.warn("Tried to perform operation without required materials");
          return gameState;
        }
      }
      for (const slot of blueprint.slots) {
        if (picked.has(slot.id)) {
          continue;
        }
        const index = inventory.findIndex((m) =>
          materialMeetsInput(m, slot.requirement),
        );
        if (!take(slot.id, index)) {
          console.warn("Tried to perform operation without required materials");
          return gameState;
        }
      }
      // Slot order, so the bill of materials lines up with the blueprint.
      for (const slot of blueprint.slots) {
        materialsToConsume.push(picked.get(slot.id)!);
      }
    } else {
      // Validate that we have all required materials
      const inputMaterials = selectedOperation.getInputMaterials(
        machine.resolvedParameters(selectedOperation),
      );

      for (const inputMaterial of inputMaterials) {
        for (let i = 0; i < inputMaterial.quantity; i++) {
          const index = inventory.findIndex((m) =>
            materialMeetsInput(m, inputMaterial),
          );
          if (index === -1) {
            console.warn(
              "Tried to perform operation without required materials",
            );
            return gameState;
          }
          materialsToConsume.push(inventory[index]);
          inventory.splice(index, 1);
        }
      }
    }

    // Supplies are spent up front — once the operation starts, the glue is
    // out of the bottle and the nails are in the wood.
    const consumableCosts = selectedOperation.requiredConsumables ?? [];
    if (!hasConsumables(gameState.consumables, consumableCosts)) {
      console.warn("Tried to perform operation without required supplies");
      return gameState;
    }

    // Clamps are borrowed, not spent: a glue-up holds them until it's
    // cured, so what matters is how many are off the rack right now.
    // Nothing is deducted here — the count in use is derived from the
    // machines running (see Clamp.ts), so this operation starting IS the
    // checkout, and finishing is the return.
    if (
      clampsFor(selectedOperation, materialsToConsume) >
      clampsFree(gameState.clamps, gameState.machines)
    ) {
      console.warn("Tried to perform operation without enough free clamps");
      return gameState;
    }

    // Start the operation - move materials to processing and enter phase 0
    const [firstPhase] = getOperationPhases(
      selectedOperation,
      gameState.progression,
      machineDustMultiplier(gameState.dust, machine, gameState.shopInfo.size),
      stationWorkSpeed(machine, gameState),
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
