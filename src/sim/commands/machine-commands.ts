import { Game } from "../../core/Game";
import { CellMap } from "../../game/CellMap";
import { clampsFor, clampsFree } from "../../game/Clamp";
import { hasConsumables, subtractConsumables } from "../../game/Consumable";
import { feedClearanceShortfall } from "../../game/feed-clearance";
import {
  canPickUpMachine,
  canPlaceMachine,
  carriedMachinePlacement,
  CarryFacts,
  getMachineOccupiedCells,
} from "../../game/game-actions/machine-actions";
import { completeOperation } from "../../game/game-actions/operation-actions";
import { heldTool } from "../../game/HeldTool";
import {
  defaultParametersFor,
  isBenchType,
  isSameMachine,
  MachineState,
  Operation,
  ParameterValues,
  MACHINE_TYPES,
} from "../../game/Machine";
import {
  findFeedableOperation,
  machineCanOperate,
  playerAttendsMachine,
} from "../../game/machine-helpers";
import { materialMeetsInput } from "../../game/material-helpers";
import { MaterialInstance } from "../../game/Materials";
import { handSpaceLeft } from "../../game/Person";
import { productBlueprintFor } from "../../game/bench-work/blueprint";
import { seatedAssemblyPieces } from "../../game/bench-work/assembly";
import { unlockedBenchPlans } from "../../game/bench-work/plan-registry";
import { availableOperations } from "../../game/skill-helpers";
import { isNight } from "../../game/time-flow";
import { carryingShopVac } from "../../game/ShopVac";
import { chebyshevDistance, Direction } from "../../game/Vectors";
import { MachineCrateEntity } from "../entities/MachineCrateEntity";
import { MachineEntity } from "../entities/MachineEntity";
import { Player } from "../entities/Player";
import {
  machineStatesNow,
  operationPhasesNow,
  shopSupplyNow,
} from "../machine-reads";
import { projectPerson, projectProgression } from "../projection";
import { Clock } from "../singletons/Clock";
import { Consumables } from "../singletons/Consumables";
import { ShopGrid } from "../singletons/ShopGrid";
import { cleaningGear } from "./cleaning-commands";
import { emitSound } from "./sound";
import { applyCompletionGrants } from "../systems/grants";
import { BenchToolClaim } from "../../game/bench-work/tool-work";

/**
 * The machine command surface: every mutation input can make against a
 * machine, ported from the old machine/player/operation actions. Each
 * command validates through the same shared helpers the old world used
 * (against a projection snapshot), then writes onto the entities.
 * Refusals log and return false, matching the old actions' quiet-refusal
 * contract — the dispatcher's chips explain; the command is the
 * backstop.
 */

// Pure read helpers re-exported so the shell reads them through the
// command surface, the way trip-commands re-exports its constants.
export {
  canPickUpMachine,
  canPutDownCarriedMachine,
  explainUnpackRefusal,
} from "../../game/game-actions/machine-actions";

/**
 * The live floor index, read through the command surface (the shell may
 * not reach into `sim/singletons` — see import-boundaries.test.ts).
 */
export function shopCellMap(game: Game): CellMap {
  return game.entities.getSingleton(ShopGrid).cellMap();
}

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

/** The carrying rules' read, off the live entities. */
export function carryFacts(game: Game): CarryFacts {
  return {
    machines: machineStatesNow(game),
    player: player(game),
    shopVac: cleaningGear(game).shopVac,
  };
}

/** The player's hands are genuinely free: no machine, no boards, no vac. */
function handsFreeNow(game: Game): boolean {
  const thePlayer = player(game);
  return (
    thePlayer.carriedMachine == null &&
    thePlayer.inventory.length === 0 &&
    !carryingShopVac(cleaningGear(game))
  );
}

/**
 * Whether holding the trigger would start anything on this machine right
 * now — the question the old driver's `canOperate` asked, judged by the
 * shared `machineCanOperate` over the live shop's supply. A read, not a
 * mutation; it lives on the command surface so the driver can ask it
 * without reaching past the boundary.
 */
export function machineCanOperateNow(
  game: Game,
  entity: MachineEntity,
): boolean {
  return machineCanOperate(
    entity.view(),
    shopSupplyNow(game),
    projectProgression(game),
  );
}

// ---------------------------------------------------------------------
// Carrying machines (shop layout management)
// ---------------------------------------------------------------------

/** Hoists a placed machine onto the player's shoulders. */
export function pickUpMachine(game: Game, entity: MachineEntity): boolean {
  if (!canPickUpMachine(carryFacts(game), entity.state)) {
    console.warn("Tried to pick up a machine that can't be carried");
    return false;
  }
  player(game).carriedMachine = entity.state;
  entity.destroy();
  game.dispatch("machineRemoved", { machine: entity });
  game.dispatch("playerChanged", {});
  emitSound(game, "material-pickup");
  return true;
}

/** Unpacks the crate at hand (underfoot or a neighboring cell). */
export function pickUpCrate(game: Game): boolean {
  const thePlayer = player(game);
  let crate: MachineCrateEntity | null = null;
  for (const candidate of game.entities.byConstructor(MachineCrateEntity)) {
    if (chebyshevDistance(candidate.position, thePlayer.cell) <= 1) {
      crate = candidate;
      break;
    }
  }
  if (!crate || !handsFreeNow(game)) {
    console.warn("No crate underfoot, or hands are full");
    return false;
  }
  thePlayer.carriedMachine = crate.machine;
  crate.destroy();
  game.dispatch("cratesChanged", {});
  game.dispatch("playerChanged", {});
  emitSound(game, "material-pickup");
  return true;
}

/** Sets the carried machine down with its operator cell underfoot. */
export function putDownCarriedMachine(game: Game): boolean {
  const thePlayer = player(game);
  const person = projectPerson(game);
  const carried = thePlayer.carriedMachine;
  const placement = carriedMachinePlacement({ player: person });
  if (!carried || !placement) {
    console.warn("No machine on the shoulders to set down");
    return false;
  }
  const { machineType, position, rotation } = placement;
  const occupied = getMachineOccupiedCells(machineType, position, rotation);
  const fits =
    !occupied.some(
      (cell) =>
        cell[0] === person.position[0] && cell[1] === person.position[1],
    ) &&
    canPlaceMachine(
      game.entities.getSingleton(ShopGrid).cellMap(),
      machineType,
      position,
      rotation,
    );
  if (!fits) {
    console.warn("No room to set the machine down here");
    return false;
  }
  const placed = game.addEntity(
    new MachineEntity({ ...carried, position, rotation }),
  );
  thePlayer.carriedMachine = null;
  game.dispatch("machineAdded", { machine: placed });
  game.dispatch("playerChanged", {});
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
  game.dispatch("playerChanged", {});
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
  game.dispatch("machineStateChanged", { machine: entity });
  game.dispatch("playerChanged", {});
  emitSound(game, "material-drop");
  return true;
}

function takeFromBay(
  game: Game,
  materials: ReadonlyArray<MaterialInstance>,
  entity: MachineEntity,
  bay: "inputMaterials" | "outputMaterials" | "storedMaterials",
): boolean {
  const thePlayer = player(game);
  if (heldTool(cleaningGear(game)) !== null) {
    console.warn("Tried to take materials while holding a tool");
    return false;
  }
  if (materials.length > handSpaceLeft(projectPerson(game))) {
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
  game.dispatch("machineStateChanged", { machine: entity });
  game.dispatch("playerChanged", {});
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
  game.dispatch("machineStateChanged", { machine: entity });
  game.dispatch("playerChanged", {});
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
  const progression = projectProgression(game);
  const machine = entity.view();
  const isBenchPlan =
    isBenchType(machine.type) &&
    unlockedBenchPlans(progression).some(
      (plan) => plan.operation === operation,
    );
  if (
    !isBenchPlan &&
    !availableOperations(machine, progression).includes(operation)
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
  game.dispatch("machineStateChanged", { machine: entity });
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
  game.dispatch("machineStateChanged", { machine: entity });
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
  game.dispatch("machineStateChanged", { machine: entity });
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
  game.dispatch("machineStateChanged", { machine: entity });
  return true;
}

// ---------------------------------------------------------------------
// Running operations
// ---------------------------------------------------------------------

/**
 * Start an operation, in all three branches: a bench tool claim, a
 * direct-feed match, or the selected operation consuming from the input
 * bay (with the blueprint seating rules).
 */
export function operateMachine(
  game: Game,
  entity: MachineEntity,
  toolClaim?: BenchToolClaim,
): boolean {
  const progression = projectProgression(game);
  const machine = entity.view();
  const machineState = entity.state;

  if (machineState.operationProgress.status === "inProgress") {
    console.warn("Machine is already operating");
    return false;
  }
  if (isNight(game.entities.getSingleton(Clock))) {
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
    const [firstPhase] = operationPhasesNow(game, machine, operation);
    entity.state = {
      ...machineState,
      ...updates,
      operationProgress: {
        status: "inProgress" as const,
        phaseIndex: 0,
        ticksRemaining: firstPhase.duration,
      },
    };
    game.dispatch("machineStateChanged", { machine: entity });
  };

  if (toolClaim) {
    const operation = availableOperations(machine, progression).find(
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
    if (!hasConsumables(consumables.stock, consumableCosts)) {
      console.warn("Tried to perform operation without required supplies");
      return false;
    }
    if (
      clampsFor(operation) > clampsFree(consumables.clamps, machineStatesNow(game))
    ) {
      console.warn("Tried to perform operation without enough free clamps");
      return false;
    }
    consumables.stock = subtractConsumables(consumables.stock, consumableCosts);
    if (consumableCosts.length > 0) {
      game.dispatch("suppliesChanged", {});
    }
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
      availableOperations(machine, progression),
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
        game.entities.getSingleton(ShopGrid).cellMap(),
      )
    ) {
      console.warn("No room to run the stock through the machine");
      return false;
    }
    const consumableCosts = match.operation.requiredConsumables ?? [];
    if (!hasConsumables(consumables.stock, consumableCosts)) {
      console.warn("Tried to perform operation without required supplies");
      return false;
    }
    if (
      clampsFor(match.operation) >
      clampsFree(consumables.clamps, machineStatesNow(game))
    ) {
      console.warn("Tried to perform operation without enough free clamps");
      return false;
    }
    consumables.stock = subtractConsumables(consumables.stock, consumableCosts);
    if (consumableCosts.length > 0) {
      game.dispatch("suppliesChanged", {});
    }
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
  if (!hasConsumables(consumables.stock, consumableCosts)) {
    console.warn("Tried to perform operation without required supplies");
    return false;
  }
  if (
    clampsFor(selectedOperation, materialsToConsume) >
    clampsFree(consumables.clamps, machineStatesNow(game))
  ) {
    console.warn("Tried to perform operation without enough free clamps");
    return false;
  }

  consumables.stock = subtractConsumables(consumables.stock, consumableCosts);
  if (consumableCosts.length > 0) {
    game.dispatch("suppliesChanged", {});
  }
  startPhases(selectedOperation, {
    inputMaterials: inventory,
    processingMaterials: materialsToConsume,
  });
  return true;
}

/**
 * The bench view's finish commit.
 * For a single-phase operation that is the completion itself; for one
 * with a hands-free remainder (a glue-up's cure) it enters the next
 * phase and hands the rest to the tick.
 */
export function finishAttendedWork(game: Game, entity: MachineEntity): boolean {
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
  const person = projectPerson(game);
  if (!playerAttendsMachine(live, person.position, person.away !== null)) {
    console.warn("Can't finish hand work from across the shop");
    return false;
  }

  const phases = operationPhasesNow(game, live, operation);
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
    game.dispatch("machineStateChanged", { machine: entity });
    return true;
  }

  const completion = completeOperation(machineState);
  entity.state = completion.machine;
  game.dispatch("machineStateChanged", { machine: entity });
  applyCompletionGrants(game, [completion]);
  return true;
}

// Pure factory re-exported through the same seam the other command files
// give their read helpers — the store's display models are built from it.
export { freshMachineState } from "../../game/game-actions/machine-actions";
