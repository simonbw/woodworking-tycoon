import { Game } from "../../core/Game";
import { stationWorkSpeed } from "../../game/bench-mounting";
import { CellMap } from "../../game/CellMap";
import { clampsFor, clampsFree } from "../../game/Clamp";
import { hasConsumables, subtractConsumables } from "../../game/Consumable";
import { machineDustMultiplier } from "../../game/Dust";
import { feedClearanceShortfall } from "../../game/feed-clearance";
import {
  canPickUpMachine,
  canPlaceMachine,
  carriedMachinePlacement,
  getMachineOccupiedCells,
} from "../../game/game-actions/machine-actions";
import { completeOperation } from "../../game/game-actions/operation-actions";
import { GameState } from "../../game/GameState";
import { heldTool } from "../../game/HeldTool";
import {
  defaultParametersFor,
  isBenchType,
  isSameMachine,
  Machine,
  MachineState,
  Operation,
  ParameterValues,
  MACHINE_TYPES,
} from "../../game/Machine";
import {
  findFeedableOperation,
  playerAttendsMachine,
} from "../../game/machine-helpers";
import { materialMeetsInput } from "../../game/material-helpers";
import { MaterialInstance } from "../../game/Materials";
import { handSpaceLeft } from "../../game/Person";
import { productBlueprintFor } from "../../game/bench-work/blueprint";
import { seatedAssemblyPieces } from "../../game/bench-work/assembly";
import { unlockedBenchPlans } from "../../game/bench-work/plan-registry";
import {
  availableOperations,
  getOperationPhases,
} from "../../game/skill-helpers";
import { isNight } from "../../game/time-flow";
import { carryingShopVac } from "../../game/ShopVac";
import { chebyshevDistance, Direction } from "../../game/Vectors";
import { MachineCrateEntity } from "../entities/MachineCrateEntity";
import { MachineEntity } from "../entities/MachineEntity";
import { Player } from "../entities/Player";
import { projectGameState } from "../projection";
import { Consumables } from "../singletons/Consumables";
import { applyCompletionGrants } from "../systems/grants";
import { BenchToolClaim } from "../../game/game-actions/player-actions";

/**
 * The machine command surface: every mutation input can make against a
 * machine, ported from the old machine/player/operation actions. Each
 * command validates through the same shared helpers the old world used
 * (against a projection snapshot), then writes onto the entities.
 * Refusals log and return false, matching the old actions' quiet-refusal
 * contract — the dispatcher's chips explain; the command is the
 * backstop.
 */

export function findMachineEntity(
  game: Game,
  machineState: MachineState,
): MachineEntity | null {
  for (const entity of game.entities.byConstructor(MachineEntity)) {
    if (isSameMachine(entity.state, machineState)) {
      return entity;
    }
  }
  return null;
}

function player(game: Game): Player {
  return game.entities.getSingleton(Player);
}

function emitSound(game: Game, kind: string): void {
  game.dispatch("sound", { sound: { kind } as never });
}

/** The player's hands are genuinely free: no machine, no boards, no vac. */
function handsFree(gameState: GameState): boolean {
  return (
    gameState.player.carriedMachine == null &&
    gameState.player.inventory.length === 0 &&
    !carryingShopVac(gameState)
  );
}

// ---------------------------------------------------------------------
// Carrying machines (shop layout management)
// ---------------------------------------------------------------------

/** Hoists a placed machine onto the player's shoulders. */
export function pickUpMachine(game: Game, entity: MachineEntity): boolean {
  const gameState = projectGameState(game);
  if (!canPickUpMachine(gameState, entity.state)) {
    console.warn("Tried to pick up a machine that can't be carried");
    return false;
  }
  player(game).carriedMachine = entity.state;
  entity.destroy();
  emitSound(game, "material-pickup");
  return true;
}

/** Unpacks the crate at hand (underfoot or a neighboring cell). */
export function pickUpCrate(game: Game): boolean {
  const gameState = projectGameState(game);
  const thePlayer = player(game);
  let crate: MachineCrateEntity | null = null;
  for (const candidate of game.entities.byConstructor(MachineCrateEntity)) {
    if (chebyshevDistance(candidate.position, thePlayer.cell) <= 1) {
      crate = candidate;
      break;
    }
  }
  if (!crate || !handsFree(gameState)) {
    console.warn("No crate underfoot, or hands are full");
    return false;
  }
  thePlayer.carriedMachine = crate.machine;
  crate.destroy();
  emitSound(game, "material-pickup");
  return true;
}

/** Sets the carried machine down with its operator cell underfoot. */
export function putDownCarriedMachine(game: Game): boolean {
  const gameState = projectGameState(game);
  const thePlayer = player(game);
  const carried = thePlayer.carriedMachine;
  const placement = carriedMachinePlacement(gameState);
  if (!carried || !placement) {
    console.warn("No machine on the shoulders to set down");
    return false;
  }
  const { machineType, position, rotation } = placement;
  const occupied = getMachineOccupiedCells(machineType, position, rotation);
  const fits =
    !occupied.some(
      (cell) =>
        cell[0] === gameState.player.position[0] &&
        cell[1] === gameState.player.position[1],
    ) &&
    canPlaceMachine(
      CellMap.fromGameState(gameState),
      machineType,
      position,
      rotation,
    );
  if (!fits) {
    console.warn("No room to set the machine down here");
    return false;
  }
  game.addEntity(new MachineEntity({ ...carried, position, rotation }));
  thePlayer.carriedMachine = null;
  emitSound(game, "material-drop");
  return true;
}

/** Spins the carried machine a quarter turn around the player. */
export function rotateCarriedMachine(game: Game): void {
  const thePlayer = player(game);
  const carried = thePlayer.carriedMachine;
  if (!carried) {
    return;
  }
  thePlayer.carriedMachine = {
    ...carried,
    rotation: ((carried.rotation + 1) % 4) as Direction,
  };
}

// ---------------------------------------------------------------------
// Moving materials between hands and machine bays
// ---------------------------------------------------------------------

export function moveMaterialsToMachine(
  game: Game,
  materials: ReadonlyArray<MaterialInstance>,
  entity: MachineEntity,
): boolean {
  const thePlayer = player(game);
  const machineState = entity.state;
  const machineType = MACHINE_TYPES[machineState.machineTypeId];
  const spacesRemaining =
    machineType.inputSpaces - machineState.inputMaterials.length;
  if (materials.length > spacesRemaining) {
    console.warn("Tried to move too many materials to machine");
    return false;
  }
  for (const material of materials) {
    if (!thePlayer.inventory.includes(material)) {
      console.warn("Tried to move material not in inventory");
      return false;
    }
  }
  thePlayer.inventory = thePlayer.inventory.filter(
    (item) => !materials.includes(item),
  );
  entity.state = {
    ...machineState,
    inputMaterials: [...machineState.inputMaterials, ...materials],
  };
  emitSound(game, "material-drop");
  return true;
}

function takeFromBay(
  game: Game,
  materials: ReadonlyArray<MaterialInstance>,
  entity: MachineEntity,
  bay: "inputMaterials" | "outputMaterials" | "storedMaterials",
): boolean {
  const gameState = projectGameState(game);
  const thePlayer = player(game);
  if (heldTool(gameState) !== null) {
    console.warn("Tried to take materials while holding a tool");
    return false;
  }
  if (materials.length > handSpaceLeft(gameState.player)) {
    console.warn("Tried to take more than the hands can carry");
    return false;
  }
  const source = entity.state[bay] ?? [];
  for (const material of materials) {
    if (!source.includes(material)) {
      console.warn("Tried to move material not in machine");
      return false;
    }
  }
  thePlayer.inventory = [...thePlayer.inventory, ...materials];
  entity.state = {
    ...entity.state,
    [bay]: source.filter((item) => !materials.includes(item)),
  };
  emitSound(game, "material-pickup");
  return true;
}

export function takeInputsFromMachine(
  game: Game,
  materials: ReadonlyArray<MaterialInstance>,
  entity: MachineEntity,
): boolean {
  return takeFromBay(game, materials, entity, "inputMaterials");
}

export function takeOutputsFromMachine(
  game: Game,
  materials: ReadonlyArray<MaterialInstance>,
  entity: MachineEntity,
): boolean {
  return takeFromBay(game, materials, entity, "outputMaterials");
}

export function takeStoredMaterialsFromMachine(
  game: Game,
  materials: ReadonlyArray<MaterialInstance>,
  entity: MachineEntity,
): boolean {
  return takeFromBay(game, materials, entity, "storedMaterials");
}

/** Parks carried materials on a station's shelf. */
export function stowMaterialsInMachine(
  game: Game,
  materials: ReadonlyArray<MaterialInstance>,
  entity: MachineEntity,
): boolean {
  const thePlayer = player(game);
  const machine = entity.view();
  const spacesRemaining =
    machine.materialStorage - machine.storedMaterials.length;
  if (materials.length > spacesRemaining) {
    console.warn("Tried to stow more materials than the shelf holds");
    return false;
  }
  for (const material of materials) {
    if (!thePlayer.inventory.includes(material)) {
      console.warn("Tried to stow material not in inventory");
      return false;
    }
  }
  thePlayer.inventory = thePlayer.inventory.filter(
    (item) => !materials.includes(item),
  );
  entity.state = {
    ...entity.state,
    storedMaterials: [...(entity.state.storedMaterials ?? []), ...materials],
  };
  emitSound(game, "material-drop");
  return true;
}

// ---------------------------------------------------------------------
// Machine configuration
// ---------------------------------------------------------------------

export function setMachineOperation(
  game: Game,
  entity: MachineEntity,
  operation: Operation,
  parameters?: ParameterValues,
): boolean {
  const gameState = projectGameState(game);
  const machine = entity.view();
  const isBenchPlan =
    isBenchType(machine.type) &&
    unlockedBenchPlans(gameState.progression).some(
      (plan) => plan.operation === operation,
    );
  if (
    !isBenchPlan &&
    !availableOperations(machine, gameState.progression).includes(operation)
  ) {
    throw new Error("Tried to set machine operation to invalid operation");
  }
  if (entity.state.operationProgress.status === "inProgress") {
    console.warn("Can't change the plan while the station is working");
    return false;
  }
  entity.state = {
    ...entity.state,
    selectedOperationId: operation.id,
    selectedParameters: parameters,
  };
  return true;
}

export function clearMachineOperation(
  game: Game,
  entity: MachineEntity,
): boolean {
  if (entity.state.operationProgress.status === "inProgress") {
    console.warn("Can't change the plan while the station is working");
    return false;
  }
  entity.state = {
    ...entity.state,
    selectedOperationId: "none",
    selectedParameters: undefined,
  };
  return true;
}

export function toggleMachinePower(game: Game, entity: MachineEntity): void {
  if (!entity.type.powerSwitch) {
    return;
  }
  entity.state = {
    ...entity.state,
    poweredOn: !(entity.state.poweredOn ?? false),
  };
}

export function setMachineSettings(
  game: Game,
  entity: MachineEntity,
  settings: ParameterValues,
): boolean {
  if (entity.state.operationProgress.status === "inProgress") {
    console.warn("Can't move the settings while the station is working");
    return false;
  }
  entity.state = {
    ...entity.state,
    selectedParameters: { ...entity.state.selectedParameters, ...settings },
  };
  return true;
}

// ---------------------------------------------------------------------
// Running operations
// ---------------------------------------------------------------------

/**
 * Start an operation — the old `operateMachineAction`, all three
 * branches: a bench tool claim, a direct-feed match, or the selected
 * operation consuming from the input bay (with the blueprint seating
 * rules).
 */
export function operateMachine(
  game: Game,
  entity: MachineEntity,
  toolClaim?: BenchToolClaim,
): boolean {
  const gameState = projectGameState(game);
  const machine = entity.view();
  const machineState = entity.state;

  if (machineState.operationProgress.status === "inProgress") {
    console.warn("Machine is already operating");
    return false;
  }
  if (isNight(gameState)) {
    console.warn("Shop's closed for the night");
    return false;
  }
  if (!machine.isPowered) {
    console.warn("Machine is switched off");
    return false;
  }

  const consumables = game.entities.getSingleton(Consumables);

  const startPhases = (
    operation: Operation,
    updates: Partial<MachineState>,
  ) => {
    const [firstPhase] = getOperationPhases(
      operation,
      gameState.progression,
      machineDustMultiplier(gameState.dust, machine, gameState.shopInfo.size),
      stationWorkSpeed(machine, gameState),
    );
    entity.state = {
      ...machineState,
      ...updates,
      operationProgress: {
        status: "inProgress" as const,
        phaseIndex: 0,
        ticksRemaining: firstPhase.duration,
      },
    };
  };

  if (toolClaim) {
    const operation = availableOperations(machine, gameState.progression).find(
      (op) => op.id === toolClaim.operationId,
    );
    const material = [
      ...machineState.inputMaterials,
      ...machineState.outputMaterials,
    ].find((m) => m.id === toolClaim.materialId);
    if (!operation || !material) {
      console.warn("No such operation or piece to start tool work on");
      return false;
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
      return false;
    }
    const consumableCosts = operation.requiredConsumables ?? [];
    if (!hasConsumables(gameState.consumables, consumableCosts)) {
      console.warn("Tried to perform operation without required supplies");
      return false;
    }
    if (
      clampsFor(operation) > clampsFree(gameState.clamps, gameState.machines)
    ) {
      console.warn("Tried to perform operation without enough free clamps");
      return false;
    }
    consumables.stock = subtractConsumables(consumables.stock, consumableCosts);
    startPhases(operation, {
      selectedOperationId: operation.id,
      selectedParameters: parameters,
      inputMaterials: machineState.inputMaterials.filter(
        (candidate) => candidate.id !== material.id,
      ),
      outputMaterials: machineState.outputMaterials.filter(
        (candidate) => candidate.id !== material.id,
      ),
      processingMaterials: [material],
    });
    return true;
  }

  if (machine.type.directFeed) {
    const match = findFeedableOperation(
      machine,
      availableOperations(machine, gameState.progression),
      machineState.inputMaterials,
    );
    if (!match) {
      console.warn("Nothing on the machine that it is set up to take");
      return false;
    }
    if (
      feedClearanceShortfall(
        machine,
        match.materials,
        CellMap.fromGameState(gameState),
      )
    ) {
      console.warn("No room to run the stock through the machine");
      return false;
    }
    const consumableCosts = match.operation.requiredConsumables ?? [];
    if (!hasConsumables(gameState.consumables, consumableCosts)) {
      console.warn("Tried to perform operation without required supplies");
      return false;
    }
    if (
      clampsFor(match.operation) >
      clampsFree(gameState.clamps, gameState.machines)
    ) {
      console.warn("Tried to perform operation without enough free clamps");
      return false;
    }
    consumables.stock = subtractConsumables(consumables.stock, consumableCosts);
    startPhases(match.operation, {
      selectedOperationId: match.operation.id,
      selectedParameters: match.parameters,
      inputMaterials: [...match.remaining],
      processingMaterials: [...match.materials],
    });
    return true;
  }

  const inventory = [...machineState.inputMaterials];
  const materialsToConsume: MaterialInstance[] = [];

  const selectedOperation = machine.selectedOperationOrNull;
  if (!selectedOperation) {
    console.warn("No known operation selected to start");
    return false;
  }

  const interaction = selectedOperation.interaction;
  const blueprint =
    interaction?.kind === "assembly"
      ? productBlueprintFor(interaction.blueprint)
      : null;
  if (blueprint) {
    const seatedBySlot = seatedAssemblyPieces(machine, blueprint);
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
        return false;
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
        return false;
      }
    }
    for (const slot of blueprint.slots) {
      materialsToConsume.push(picked.get(slot.id)!);
    }
  } else {
    const inputMaterials = selectedOperation.getInputMaterials(
      machine.resolvedParameters(selectedOperation),
    );
    for (const inputMaterial of inputMaterials) {
      for (let i = 0; i < inputMaterial.quantity; i++) {
        const index = inventory.findIndex((m) =>
          materialMeetsInput(m, inputMaterial),
        );
        if (index === -1) {
          console.warn("Tried to perform operation without required materials");
          return false;
        }
        materialsToConsume.push(inventory[index]);
        inventory.splice(index, 1);
      }
    }
  }

  const consumableCosts = selectedOperation.requiredConsumables ?? [];
  if (!hasConsumables(gameState.consumables, consumableCosts)) {
    console.warn("Tried to perform operation without required supplies");
    return false;
  }
  if (
    clampsFor(selectedOperation, materialsToConsume) >
    clampsFree(gameState.clamps, gameState.machines)
  ) {
    console.warn("Tried to perform operation without enough free clamps");
    return false;
  }

  consumables.stock = subtractConsumables(consumables.stock, consumableCosts);
  startPhases(selectedOperation, {
    inputMaterials: inventory,
    processingMaterials: materialsToConsume,
  });
  return true;
}

/**
 * The bench view's finish commit — the old `finishAttendedWorkAction`.
 * For a single-phase operation that is the completion itself; for one
 * with a hands-free remainder (a glue-up's cure) it enters the next
 * phase and hands the rest to the tick.
 */
export function finishAttendedWork(game: Game, entity: MachineEntity): boolean {
  const gameState = projectGameState(game);
  const machineState = entity.state;
  if (machineState.operationProgress.status !== "inProgress") {
    console.warn("No interactive work in progress to finish");
    return false;
  }
  const live = entity.view();
  const operation = live.operations.find(
    (op) => op.id === machineState.selectedOperationId,
  );
  if (!operation?.interaction) {
    console.warn("The running operation has no interactive script");
    return false;
  }
  if (
    !playerAttendsMachine(
      live,
      gameState.player.position,
      gameState.player.away !== null,
    )
  ) {
    console.warn("Can't finish hand work from across the shop");
    return false;
  }

  const phases = getOperationPhases(
    operation,
    gameState.progression,
    machineDustMultiplier(gameState.dust, live, gameState.shopInfo.size),
    stationWorkSpeed(live, gameState),
  );
  const { phaseIndex } = machineState.operationProgress;
  if (phases[Math.min(phaseIndex, phases.length - 1)].attended === false) {
    console.warn("The hands-free phase finishes on its own — let it cure");
    return false;
  }

  if (phaseIndex < phases.length - 1) {
    const nextPhase = phases[phaseIndex + 1];
    entity.state = {
      ...machineState,
      operationProgress: {
        status: "inProgress" as const,
        phaseIndex: phaseIndex + 1,
        ticksRemaining: nextPhase.duration,
      },
    };
    return true;
  }

  const completion = completeOperation(machineState);
  entity.state = completion.machine;
  applyCompletionGrants(game, [completion]);
  return true;
}
