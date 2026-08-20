import { GameAction } from "../GameState";
import { Machine, MachineState } from "../Machine";
import { ToolItem } from "../Materials";
import { TOOL_TYPES } from "../Tool";

/**
 * Mounts a tool the player is carrying into a station's free tool slot,
 * making the tool's operations available there. The tool has to be in
 * hand — there is no shop-wide storage to pull from. Refused while the
 * station is working, like unmounting.
 */
export function mountToolAction(machine: Machine, tool: ToolItem): GameAction {
  return (gameState) => {
    if (!gameState.player.inventory.some((item) => item === tool)) {
      console.warn(`Tried to mount ${tool.toolId} without carrying it`);
      return gameState;
    }
    if (machine.state.tools.length >= machine.toolSlots) {
      console.warn(`No free tool slots on ${machine.type.name}`);
      return gameState;
    }
    const compatible = TOOL_TYPES[tool.toolId].compatibleMachines;
    if (compatible && !compatible.includes(machine.state.machineTypeId)) {
      console.warn(`${tool.toolId} doesn't mount on a ${machine.type.name}`);
      return gameState;
    }
    // Nor bolt one on mid-cut: a new tool re-picks the selected operation,
    // which would cancel the running one out from under the stock
    if (machine.operationProgress.status === "inProgress") {
      console.warn("Can't mount tools while the station is working");
      return gameState;
    }

    return {
      ...gameState,
      player: {
        ...gameState.player,
        inventory: gameState.player.inventory.filter((item) => item !== tool),
      },
      machines: gameState.machines.map((machineState) =>
        machineState === machine.state
          ? withValidSelectedOperation({
              ...machineState,
              tools: [...machineState.tools, tool.toolId],
            })
          : machineState,
      ),
    };
  };
}

/**
 * Keeps selectedOperationId pointing at an operation that actually exists
 * after the tool list changes; falls back to the first available operation,
 * or "none" for a station with no operations left. (Exported for the sim
 * world's tool commands, which share it rather than fork it.)
 */
export function withValidSelectedOperation(
  machineState: MachineState,
): MachineState {
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
