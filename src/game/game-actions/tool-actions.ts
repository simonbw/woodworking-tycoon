import { GameAction } from "../GameState";
import { Machine, MachineState } from "../Machine";
import { TOOL_TYPES, ToolId } from "../Tool";

/** Buys a tool at its listed cost; it goes into tool storage. */
export function buyToolAction(toolId: ToolId): GameAction {
  return (gameState) => {
    const cost = TOOL_TYPES[toolId].cost;
    if (gameState.money < cost) {
      console.warn("Tried to buy tool without enough money");
      return gameState;
    }
    return {
      ...gameState,
      money: gameState.money - cost,
      storage: {
        ...gameState.storage,
        tools: [...gameState.storage.tools, toolId],
      },
    };
  };
}

/**
 * Mounts a tool from storage into a station's free tool slot, making the
 * tool's operations available there. Refused while the station is working,
 * like unmounting.
 */
export function mountToolAction(machine: Machine, toolId: ToolId): GameAction {
  return (gameState) => {
    if (!gameState.storage.tools.includes(toolId)) {
      console.warn(`Tried to mount ${toolId} but it's not in storage`);
      return gameState;
    }
    if (machine.state.tools.length >= machine.toolSlots) {
      console.warn(`No free tool slots on ${machine.type.name}`);
      return gameState;
    }
    const compatible = TOOL_TYPES[toolId].compatibleMachines;
    if (compatible && !compatible.includes(machine.state.machineTypeId)) {
      console.warn(`${toolId} doesn't mount on a ${machine.type.name}`);
      return gameState;
    }
    // Nor bolt one on mid-cut: a new tool re-picks the selected operation,
    // which would cancel the running one out from under the stock
    if (machine.operationProgress.status === "inProgress") {
      console.warn("Can't mount tools while the station is working");
      return gameState;
    }

    const storageIndex = gameState.storage.tools.indexOf(toolId);
    const updatedTools = [
      ...gameState.storage.tools.slice(0, storageIndex),
      ...gameState.storage.tools.slice(storageIndex + 1),
    ];

    return {
      ...gameState,
      storage: { ...gameState.storage, tools: updatedTools },
      machines: gameState.machines.map((machineState) =>
        machineState === machine.state
          ? withValidSelectedOperation({
              ...machineState,
              tools: [...machineState.tools, toolId],
            })
          : machineState,
      ),
    };
  };
}

/** Unmounts a tool from a station back into tool storage. */
export function unmountToolAction(
  machine: Machine,
  toolId: ToolId,
): GameAction {
  return (gameState) => {
    const toolIndex = machine.state.tools.indexOf(toolId);
    if (toolIndex === -1) {
      console.warn(`Tried to unmount ${toolId} but it's not mounted`);
      return gameState;
    }
    // Don't yank a tool out from under a running operation
    if (machine.operationProgress.status === "inProgress") {
      console.warn("Can't unmount tools while the station is working");
      return gameState;
    }

    return {
      ...gameState,
      storage: {
        ...gameState.storage,
        tools: [...gameState.storage.tools, toolId],
      },
      machines: gameState.machines.map((machineState) =>
        machineState === machine.state
          ? withValidSelectedOperation({
              ...machineState,
              tools: [
                ...machineState.tools.slice(0, toolIndex),
                ...machineState.tools.slice(toolIndex + 1),
              ],
            })
          : machineState,
      ),
    };
  };
}

/**
 * Keeps selectedOperationId pointing at an operation that actually exists
 * after the tool list changes; falls back to the first available operation,
 * or "none" for a station with no operations left.
 */
function withValidSelectedOperation(machineState: MachineState): MachineState {
  const machine = new Machine(machineState);
  const operations = machine.operations;
  if (operations.some((op) => op.id === machineState.selectedOperationId)) {
    return machineState;
  }
  return {
    ...machineState,
    selectedOperationId: operations[0]?.id ?? "none",
    selectedParameters: undefined,
    operationProgress: {
      status: "notStarted",
      phaseIndex: 0,
      ticksRemaining: 0,
    },
  };
}
