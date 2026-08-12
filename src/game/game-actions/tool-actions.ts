import { benchGroupAt } from "../bench-work/bench-group";
import { GameAction } from "../GameState";
import { getMachines, isSameMachine, Machine, MachineState } from "../Machine";
import { makeToolItem } from "../material-helpers";
import { ToolItem } from "../Materials";
import { handSpaceLeft } from "../Person";
import { TOOL_TYPES, ToolId } from "../Tool";
import { buyMaterialAction } from "./store-actions";

/**
 * Buys a tool off the tool wall at its listed cost. Like every other
 * purchase it's a physical thing from here on: it rides home in the
 * truck's bed, gets lifted out at the tailgate, and is carried to the
 * station it'll mount on.
 */
export function buyToolAction(toolId: ToolId): GameAction {
  return buyMaterialAction(makeToolItem(toolId), TOOL_TYPES[toolId].cost);
}

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

/** Takes a tool off a station's rack into the player's hands. */
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
    // The tool comes off into the arms, so they need room for it
    if (handSpaceLeft(gameState.player) < 1) {
      console.warn("Can't unmount a tool with full hands");
      return gameState;
    }

    return {
      ...gameState,
      player: {
        ...gameState.player,
        inventory: [...gameState.player.inventory, makeToolItem(toolId)],
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
 * Slides a tool mounted on a neighbouring table in the same bench run
 * onto this one — the tool-rack half of what gatherBenchPiecesAction does
 * for stock. Tables pushed together are one bench
 * (bench-work/bench-group.ts) and the view shows the run's tools on one
 * rail, but an operation still resolves tools off a single machine's
 * rack (completeOperation reads `Machine.operations`, which sees only its
 * own state) — so reaching for a neighbour's tool moves it here first,
 * then everything downstream runs exactly as if it had always hung here.
 */
export function gatherBenchToolAction(
  target: Machine,
  toolId: ToolId,
): GameAction {
  return (gameState) => {
    const targetState = gameState.machines.find((m) =>
      isSameMachine(m, target.state),
    );
    if (!targetState) {
      console.warn("No such bench to gather a tool onto");
      return gameState;
    }
    const targetMachine = new Machine(targetState);
    if (targetState.tools.length >= targetMachine.toolSlots) {
      console.warn(`No free tool slots on ${targetMachine.type.name}`);
      return gameState;
    }
    const compatible = TOOL_TYPES[toolId].compatibleMachines;
    if (compatible && !compatible.includes(targetState.machineTypeId)) {
      console.warn(`${toolId} doesn't mount on a ${targetMachine.type.name}`);
      return gameState;
    }
    if (targetState.operationProgress.status === "inProgress") {
      console.warn("Can't mount tools while the station is working");
      return gameState;
    }

    // Only within the run this table belongs to — a tool two benches
    // over across the shop stays where it hangs
    const group = benchGroupAt(getMachines(gameState.machines), targetMachine);
    const fromState = group.members
      .map((member) => member.machine.state)
      .find(
        (state) =>
          state !== targetState &&
          state.tools.includes(toolId) &&
          state.operationProgress.status !== "inProgress",
      );
    if (!fromState) {
      console.warn(`No idle table in the run has a ${toolId} to gather`);
      return gameState;
    }

    const toolIndex = fromState.tools.indexOf(toolId);
    return {
      ...gameState,
      machines: gameState.machines.map((machineState) => {
        if (machineState === fromState) {
          return withValidSelectedOperation({
            ...machineState,
            tools: [
              ...machineState.tools.slice(0, toolIndex),
              ...machineState.tools.slice(toolIndex + 1),
            ],
          });
        }
        if (machineState === targetState) {
          return withValidSelectedOperation({
            ...machineState,
            tools: [...machineState.tools, toolId],
          });
        }
        return machineState;
      }),
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
