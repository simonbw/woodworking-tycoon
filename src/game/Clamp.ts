import {
  defaultParametersFor,
  Machine,
  MachineState,
  Operation,
} from "./Machine";
import { MaterialInstance } from "./Materials";
import { CLAMP_SPACING_IN, clampsForGlueSpan } from "./bench-work/glue-up";

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
 * How many a glue-up ties up is derived too: one clamp per foot of the
 * length being glued, never fewer than two (bench-work/glue-up.ts) — the
 * boards lie ACROSS the clamp bars, so it's their length that sets the
 * count. Longer stock is hungrier for clamps, and owning more is what
 * buys parallel glue-ups: one bench's panel can cure while another bench
 * starts the next one. (Clamps are deliberately not a Consumable — see
 * Consumable.ts — a pool that returns, not a stock that depletes.)
 *
 * `GameState.clamps` is therefore the number OWNED.
 */

export const CLAMP_NAME = "Bar Clamp";

export const CLAMP_DESCRIPTION =
  "A steel bar clamp. A glue-up holds several until the glue cures, then releases them.";

/** Bought one at a time from the store's supplies aisle. */
export const CLAMP_COST = 22;

/** The clamp span a piece asks for, along its glued length. */
function glueSpanIn(material: MaterialInstance): number | null {
  switch (material.type) {
    case "board":
    case "panel":
      return material.length;
    case "endGrainSlice":
      return material.strips.reduce((sum, strip) => sum + strip.width, 0);
    default:
      return null;
  }
}

/**
 * How many clamps an operation ties up while it runs (0 for anything but
 * a glue-up). With the very materials in hand — a running operation's
 * processing bay, the scene's detected run — the count follows their
 * length; without, it follows the recipe's declared stock (previews and
 * the legacy recipe path, which pins its lengths anyway).
 */
export function clampsFor(
  operation: Operation,
  materials?: ReadonlyArray<MaterialInstance>,
): number {
  // A flat count, for work that pins something down rather than gluing
  // it: the circular saw's straightedge has to be clamped to the sheet
  // for the length of the cut, so a shop mid-glue-up can't also be
  // breaking sheets down.
  if (operation.clampsHeld !== undefined) {
    return operation.clampsHeld;
  }
  if (operation.interaction?.kind !== "glue") {
    return 0;
  }
  if (materials && materials.length > 0) {
    const spans = materials
      .map(glueSpanIn)
      .filter((span): span is number => span !== null);
    if (spans.length > 0) {
      return clampsForGlueSpan(Math.max(...spans));
    }
  }
  const declared = operation.getInputMaterials(
    defaultParametersFor(operation),
  )[0];
  const declaredLength =
    declared && "length" in declared ? declared.length?.[0] : undefined;
  return clampsForGlueSpan(declaredLength ?? CLAMP_SPACING_IN * 2);
}

/**
 * Clamps currently tied up in glue-ups. An operation holds its clamps for
 * its whole run — the attended Glue & Clamp phase AND the long hands-free
 * cure — so any machine mid-operation counts, at the count its own
 * processing stock derives.
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
    return (
      sum +
      (operation ? clampsFor(operation, machineState.processingMaterials) : 0)
    );
  }, 0);
}

/** Clamps on the rack right now: owned minus the ones holding a glue-up. */
export function clampsFree(
  owned: number,
  machines: ReadonlyArray<MachineState>,
): number {
  return owned - clampsInUse(machines);
}
