import { Machine, MachineState } from "../Machine";

/**
 * The rule a station's tool rail has to keep: whatever is mounted, the
 * station's selected operation must be one the station can actually run.
 * The tool commands in `sim/commands/tool-commands.ts` call this after
 * every mount and unmount.
 */

/**
 * Keeps selectedOperationId pointing at an operation that actually exists
 * after the tool list changes; falls back to the first available operation,
 * or "none" for a station with no operations left.
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
