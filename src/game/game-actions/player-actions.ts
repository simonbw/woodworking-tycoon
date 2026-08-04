import { materialMeetsInput } from "../material-helpers";
import { seatedAssemblyPieces } from "../bench-work/assembly";
import { productBlueprintFor } from "../bench-work/blueprint";
import { CellMap } from "../CellMap";
import { clampsFor, clampsFree } from "../Clamp";
import { hasConsumables, subtractConsumables } from "../Consumable";
import { machineDustMultiplier } from "../Dust";
import { feedClearanceShortfall } from "../feed-clearance";
import { heldTool } from "../HeldTool";
import { isOutdoors } from "../lot";
import { handSpaceLeft } from "../Person";
import { findFeedableOperation } from "../machine-helpers";
import { GameAction, MaterialPile } from "../GameState";
import {
  defaultParametersFor,
  isSameMachine,
  Machine,
  Operation,
  ParameterValues,
  MACHINE_TYPES,
} from "../Machine";
import { MaterialInstance } from "../Materials";
import { Direction, Vector, vectorEquals } from "../Vectors";
import { cellCenter } from "../player-motion";
import { pileWithinReach } from "../pile-helpers";
import { availableOperations, getOperationPhases } from "../skill-helpers";
import { emitSound } from "./sound-actions";

/**
 * Stamp the cell (and facing) the continuously-moving body currently
 * occupies into the simulation. The motion layer has already handled
 * collision and speed — this is bookkeeping, not movement, so it costs
 * no ticks. Everything cell-based (targeting, sweeping, attendance)
 * reads the position this writes.
 */
export function setPlayerPositionAction(
  position: Vector,
  direction: Direction,
): GameAction {
  return (gameState) => {
    if (
      vectorEquals(gameState.player.position, position) &&
      gameState.player.direction === direction
    ) {
      return gameState;
    }
    return {
      ...gameState,
      player: { ...gameState.player, position, direction },
    };
  };
}

export function pickUpMaterialAction(
  materialPiles: ReadonlyArray<MaterialPile>,
): GameAction {
  return (gameState) => {
    // A tool in hand commits the hands — lean the broom (or park the
    // vac) before picking stock up. Enforced here, not just in the
    // keyboard layer, so sequence tests obey the same physics.
    if (heldTool(gameState) !== null) {
      console.warn("Tried to pick up material while holding a tool");
      return gameState;
    }
    // The arms hold HAND_CAPACITY pieces; a load that doesn't fit is
    // refused whole, the same way a machine's bay refuses an overfill.
    if (materialPiles.length > handSpaceLeft(gameState.player)) {
      console.warn("Tried to pick up more than the hands can carry");
      return gameState;
    }
    for (const materialPile of materialPiles) {
      // Reach is geometric: the piece's resting footprint must come within
      // arm's reach of the player's cell (see pileWithinReach), so long
      // stock is grabbable anywhere along its length.
      if (!pileWithinReach(materialPile, gameState.player.position)) {
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

/**
 * Set materials down where the player stands. Piles sit at continuous
 * positions: `at` is the landing point in cell units — the keyboard layer
 * passes the body's actual position, so a piece lands exactly where the
 * woodworker is, not snapped to the cell underfoot. `rotation` is the
 * orientation the piece lies down in (radians, world frame); the DOM
 * layer passes the carried orientation so a drop keeps it. Callers
 * without a body (sequence tests) omit both and the piece lands square
 * at the cell's center.
 */
export function dropMaterialAction(
  materials: ReadonlyArray<MaterialInstance>,
  at?: Vector,
  rotation: number = 0,
): GameAction {
  return (gameState) => {
    const position = at ?? cellCenter(gameState.player.position);
    // Piles live on the shop floor; the lot is walkable ground and nothing
    // else. What's carried stays in hand until the player is back inside
    // (or at the truck's bed, where F loads instead).
    if (
      isOutdoors(gameState.shopInfo, gameState.player.position) ||
      position[1] >= gameState.shopInfo.size[1]
    ) {
      console.warn("Tried to drop material outside the shop");
      return gameState;
    }
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
          ...materials.map((material) => ({ material, position, rotation })),
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

export function takeOutputsFromMachineAction(
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
  operation: Operation,
  parameters?: ParameterValues,
): GameAction {
  return (gameState) => {
    const machineState = machine.state;
    if (
      !availableOperations(machine, gameState.progression).includes(operation)
    ) {
      throw new Error("Tried to set machine operation to invalid operation");
    }
    // Don't swap the plan out from under a running operation
    if (machineState.operationProgress.status === "inProgress") {
      console.warn("Can't change the plan while the station is working");
      return gameState;
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
 * Record where the mouse is steering the broom head (already clamped to
 * reach by the pointer layer), or null when the cursor stops aiming.
 * Transient pointer state, like the operate key — never persisted.
 */
export function setSweepAimAction(aim: Vector | null): GameAction {
  return (gameState) => {
    const current = gameState.player.sweepAim ?? null;
    if (
      current === aim ||
      (current !== null && aim !== null && vectorEquals(current, aim))
    ) {
      return gameState;
    }
    return { ...gameState, player: { ...gameState.player, sweepAim: aim } };
  };
}

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

/**
 * Adjust a machine's persistent settings (fence position, saw angle, cut
 * height) without touching which operation is selected or running. On
 * direct-feed machines `selectedParameters` is exactly this: the physical
 * state of the machine's cranks and stops, shared by all its operations.
 *
 * The cranks lock while the machine is running. The operation reads its
 * settings again when it finishes — moving the fence mid-cut would have the
 * saw resolve a cut nobody made, and one that the stock may no longer
 * accept (a 4/4 board asked to split at a 8/4 fence).
 */
export function setMachineSettingsAction(
  machine: Machine,
  settings: ParameterValues,
): GameAction {
  return (gameState) => {
    if (machine.operationProgress.status === "inProgress") {
      console.warn("Can't move the settings while the station is working");
      return gameState;
    }

    return {
      ...gameState,
      machines: gameState.machines.map((m) =>
        isSameMachine(m, machine.state)
          ? {
              ...m,
              selectedParameters: { ...m.selectedParameters, ...settings },
            }
          : m,
      ),
    };
  };
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
        machine.workSpeed,
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
        machine.workSpeed,
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
      for (const slot of blueprint.slots) {
        const seatedId = seatedBySlot.get(slot.id)?.id;
        const index = seatedId
          ? inventory.findIndex((m) => m.id === seatedId)
          : inventory.findIndex((m) => materialMeetsInput(m, slot.requirement));
        if (index === -1) {
          console.warn("Tried to perform operation without required materials");
          return gameState;
        }
        materialsToConsume.push(inventory[index]);
        inventory.splice(index, 1);
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
      clampsFor(selectedOperation) >
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
      machine.workSpeed,
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
