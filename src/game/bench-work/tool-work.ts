import { ProgressionState } from "../GameState";
import { Machine, Operation, ParameterValues } from "../Machine";
import { Board, MaterialInstance } from "../Materials";
import { CUT_POSITIONS } from "../machines/miterSaw";
import { materialMeetsInput } from "../material-helpers";
import { availableOperations } from "../skill-helpers";
import { TOOL_TYPES, ToolId } from "../Tool";
import { BenchPlacement } from "./bench-layout";
import { benchPlanForOperationId } from "./plan-registry";

/**
 * Tool-first work selection: the tool in hand plus the piece under it IS
 * the operation — the direct-feed treatment (the stock deciding the cut)
 * carried to the bench top, completing bench-minigames decision 0. No
 * plan is selected for single-piece tool work; the sanding block strokes
 * the board it's over, the saw marks the board it's over, and how the
 * piece lies chooses between a plane's jobs (flat offers the face, stood
 * on edge offers the edge). Pure and unit-tested, like workpiece.ts, so
 * the view and the claim `operateMachine` receives can never disagree
 * about what a tool offers.
 */

/**
 * A tool-first start from the bench view: the held tool applied to the
 * very piece under it. Names the operation (chosen by tool + piece, see
 * `toolOperationFor` below), the one material to claim, and any
 * parameters the gesture itself decided (the saw's mark).
 */
export interface BenchToolClaim {
  readonly operationId: string;
  readonly materialId: string;
  readonly parameters?: ParameterValues;
}

/**
 * The interaction kinds that are tool work rather than a plan: the piece
 * and the gesture pick them, and they carry their own parameters out of
 * the gesture (the saw's mark measures the kept length, R swings the
 * miter box). Only assembly builds are pulled off the blueprint pile.
 */
const TOOL_WORK_KINDS = ["pry", "stroke", "saw", "glue"];

/** Whether this operation is tool work rather than a plan off the pile. */
export function isToolWork(operation: Operation): boolean {
  return TOOL_WORK_KINDS.includes(operation.interaction?.kind ?? "");
}

/**
 * The plan a bench has pulled off its blueprint pile, or null.
 * `selectedOperationId` doubles as the record of the last tool work
 * claimed (`operateMachine` writes it), so it only names a plan when
 * it names an assembly build — a bench that just crosscut a board has no
 * drawing out, whatever the id says. Old saves may carry a stale one.
 *
 * Resolution falls through to the plan registry so a pulled drawing
 * survives its driving tool being unmounted (the plan browser lists by
 * skill, not by what's on the rail); the missing tool then reads as a
 * supply shortfall rather than the drawing vanishing.
 */
export function selectedBenchPlan(machine: Machine): Operation | null {
  const selected = machine.selectedOperationOrNull;
  if (selected) {
    return isToolWork(selected) ? null : selected;
  }
  return (
    benchPlanForOperationId(machine.state.selectedOperationId)?.operation ??
    null
  );
}

/**
 * The operation this held tool offers on this piece as it lies, or null.
 * Order follows the tool's own operation list, so a tool with a ladder
 * of jobs (sanding rough → smooth → sanded) offers the piece's next rung
 * via its input requirements.
 */
export function toolOperationFor(
  machine: Machine,
  progression: ProgressionState,
  toolId: ToolId,
  material: MaterialInstance,
  placement: BenchPlacement,
): Operation | null {
  if (!machine.state.tools.includes(toolId)) {
    return null;
  }
  const toolOpIds = new Set(TOOL_TYPES[toolId].operations.map((op) => op.id));
  const operations = availableOperations(machine, progression).filter((op) =>
    toolOpIds.has(op.id),
  );
  for (const operation of operations) {
    const interaction = operation.interaction;
    if (!interaction) continue;
    if (interaction.kind === "stroke") {
      // Face work wants the face up (lying flat); edge work wants the
      // edge up (stood on edge, F) — the arrangement is the mode picker.
      const band = interaction.band ?? "face";
      if ((band === "edge") !== (placement.onEdge === true)) continue;
      const input = operation.getInputMaterials(
        machine.resolvedParameters(operation),
      )[0];
      if (input && materialMeetsInput(material, input)) {
        return operation;
      }
    }
    if (interaction.kind === "saw") {
      if (placement.onEdge || material.type !== "board") continue;
      const marks = sawMarkPositions(material as Board);
      if (marks.length === 0) continue;
      // The requirement reads the marked length, which isn't chosen yet —
      // probe it at the shortest detent that fits.
      const input = operation.getInputMaterials({
        ...machine.resolvedParameters(operation),
        targetLength: marks[0],
      })[0];
      if (input && materialMeetsInput(material, input)) {
        return operation;
      }
    }
  }
  return null;
}

/** The saw detents that land inside this board — the same half-foot
 * marks the miter saw stops at. Empty means the stock is too short. */
export function sawMarkPositions(board: Board): ReadonlyArray<number> {
  return CUT_POSITIONS.filter((position) => position < board.length);
}

/**
 * The detent nearest a pointer position along the board (local inches
 * from the board's top end), or null when no cut fits. The mark measures
 * the kept length from the top end, so the cut parameters are always
 * `targetLength: mark, cutEnd: "right"` — the piece above the line keeps
 * its length, the offcut falls below it.
 */
export function nearestSawMark(board: Board, localYIn: number): number | null {
  const positions = sawMarkPositions(board);
  if (positions.length === 0) {
    return null;
  }
  return positions.reduce((best, position) =>
    Math.abs(position - localYIn) < Math.abs(best - localYIn) ? position : best,
  );
}

/** The cut a mark at this detent commits, ready for the claim. */
export function sawMarkParameters(
  markIn: number,
  angle: number,
): ParameterValues {
  return { targetLength: markIn, cutEnd: "right", angle };
}

/** Which mounted tool owns this operation — the hand the work needs. */
export function toolForOperation(
  machine: Machine,
  operation: Operation,
): ToolId | null {
  for (const toolId of machine.state.tools) {
    if (TOOL_TYPES[toolId].operations.some((op) => op.id === operation.id)) {
      return toolId;
    }
  }
  return null;
}
