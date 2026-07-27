import { Machine, MachineState } from "./Machine";

/**
 * Clamps: the shop's returnable pool. Unlike consumables (nails, oil), a
 * clamp isn't spent — a glue-up ties up some number of them for as long as
 * it's in the clamps, and they come back the moment the glue is cured.
 *
 * There is no "checked out" bookkeeping to keep in sync: the count in use
 * is DERIVED from the machines currently running a clamped operation (see
 * `clampsInUse`), so it can't drift, survives save/load for free, and
 * releases the clamps automatically when the operation finishes — even if
 * the player was away when the cure ended.
 *
 * `GameState.clamps` is therefore the number OWNED, and owning more is what
 * buys parallel glue-ups: one bench's panel can cure while another bench
 * starts the next one. See docs/consumables.md.
 */

export const CLAMP_NAME = "Bar Clamp";

export const CLAMP_DESCRIPTION =
  "A steel bar clamp. A glue-up holds several until the glue cures, then releases them.";

/** Bought one at a time from the store's supplies aisle. */
export const CLAMP_COST = 22;

/** How many clamps an operation ties up while it runs (0 for most work). */
export function clampsFor(operation: { requiredClamps?: number }): number {
  return operation.requiredClamps ?? 0;
}

/**
 * Clamps currently tied up in glue-ups. An operation holds its clamps for
 * its whole run — the attended Glue & Clamp phase AND the long hands-free
 * cure — so any machine mid-operation counts.
 */
export function clampsInUse(machines: ReadonlyArray<MachineState>): number {
  return machines.reduce((sum, machineState) => {
    if (machineState.operationProgress.status !== "inProgress") {
      return sum;
    }
    // Through the Machine view so a tool's operations resolve too.
    const operation = new Machine(machineState).operations.find(
      (op) => op.id === machineState.selectedOperationId,
    );
    return sum + (operation ? clampsFor(operation) : 0);
  }, 0);
}

/** Clamps on the rack right now: owned minus the ones holding a glue-up. */
export function clampsFree(
  owned: number,
  machines: ReadonlyArray<MachineState>,
): number {
  return owned - clampsInUse(machines);
}
