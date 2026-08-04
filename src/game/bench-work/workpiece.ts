import {
  Machine,
  Operation,
  OperationInteraction,
  ParameterValues,
} from "../Machine";
import { ProgressionState } from "../GameState";
import {
  Board,
  MaterialInstance,
  Pallet,
  PalletNail,
  Panel,
  panelWidth,
} from "../Materials";
import { PALLET_HEIGHT_IN, PALLET_WIDTH_IN } from "./pallet-geometry";
import { ProductBlueprint, productBlueprintFor } from "./blueprint";
import { materialMeetsInput } from "../material-helpers";
import { availableOperations } from "../skill-helpers";

/**
 * Pure geometry and script selection for the bench view (see
 * docs/bench-minigames.md): which interactive script a station should be
 * running right now, and how big the workpiece under the tool is. Kept
 * out of the components so the numbers are unit-testable and the panel
 * and the driver can never disagree about what work is on offer.
 */

/** The face a stroke works, in workpiece inches. */
export interface WorkSurfaceSize {
  readonly widthIn: number;
  readonly heightIn: number;
}

/**
 * The stroked surface of a board or panel: the full face for sanding and
 * face-planing, the narrow strip along the side for edge work.
 */
export function strokeSurfaceSize(
  material: MaterialInstance,
  band: "face" | "edge" = "face",
): WorkSurfaceSize {
  if (material.type === "board") {
    const board = material as Board;
    return band === "edge"
      ? {
          widthIn: board.thickness / 4,
          heightIn: board.length,
        }
      : { widthIn: board.width, heightIn: board.length };
  }
  if (material.type === "panel") {
    const panel = material as Panel;
    return {
      widthIn: panelWidth(panel),
      heightIn: panel.length,
    };
  }
  // Anything else strokes over its bounding cell — shouldn't happen for
  // the declared recipes, but a sane fallback beats a throw in a renderer.
  return { widthIn: 12, heightIn: 12 };
}

/** A saw cut's cross-section (width × thickness), in in². */
export function sawCrossSection(board: Board): {
  widthIn: number;
  thicknessIn: number;
} {
  return { widthIn: board.width, thicknessIn: board.thickness / 4 };
}

/** Every nail still holding the pallet together — real pallet state
 * (Pallet.nails), one per crossing of two present boards. */
export function pryTargets(pallet: Pallet): ReadonlyArray<PalletNail> {
  return pallet.nails;
}

/**
 * What the bench view should put under the player's hands at this
 * station, derived entirely from game state so a refresh lands back in
 * the same script (with ephemeral progress reset, per decision 3).
 */
export interface StrokeScript {
  /** Coverage work over a face or edge band; `started` false means the
   * first gesture starts the operation (claiming the piece) through
   * operateMachineAction, true means the mask (re)starts from zero. */
  readonly kind: "stroke";
  readonly operation: Operation;
  readonly interaction: Extract<OperationInteraction, { kind: "stroke" }>;
  readonly workpiece: MaterialInstance;
  readonly started: boolean;
}

export interface SawScript {
  /** The marked line and the kerf strokes that deepen it. */
  readonly kind: "saw";
  readonly operation: Operation;
  readonly interaction: Extract<OperationInteraction, { kind: "saw" }>;
  readonly workpiece: Board;
  readonly started: boolean;
}

export interface PryScript {
  /** A staged pallet with nails to pull — never "starts". */
  readonly kind: "pry";
  readonly operation: Operation;
  readonly pallet: Pallet;
}

export interface GlueScript {
  /** Spread, butt, clamp: the staged pieces matched to the plan's
   * slots; the last clamp fires the single commit. */
  readonly kind: "glue";
  readonly operation: Operation;
  readonly pieces: ReadonlyArray<MaterialInstance>;
}

export interface AssemblyScript {
  /** Snap components onto ghosts, drive fasteners, commit at the end.
   * With a blueprint, the work happens on the bench scene itself: the
   * ghosts are the blueprint's slots, the pieces are whatever is staged
   * (complete or not — parts arrive as the player sets them down), and
   * the hammer drives a nail at each armed crossing. Without one, the
   * legacy row surface mounts. */
  readonly kind: "assembly";
  readonly operation: Operation;
  readonly pieces: ReadonlyArray<MaterialInstance>;
  readonly blueprint?: ProductBlueprint;
}

export interface CuringScript {
  /** The hands-free remainder (a cure) running on the clock. */
  readonly kind: "curing";
  readonly operation: Operation;
}

export type BenchScript =
  | StrokeScript
  | SawScript
  | PryScript
  | GlueScript
  | AssemblyScript
  | CuringScript;

/**
 * The first staged material meeting each of the operation's input slots,
 * in slot order — or null if any slot is short.
 */
export function stagedPieces(
  machine: Machine,
  operation: Operation,
): ReadonlyArray<MaterialInstance> | null {
  const pool = [...machine.inputMaterials];
  const picked: MaterialInstance[] = [];
  for (const input of operation.getInputMaterials(
    machine.resolvedParameters(operation),
  )) {
    for (let i = 0; i < input.quantity; i++) {
      const index = pool.findIndex((m) => materialMeetsInput(m, input));
      if (index === -1) {
        return null;
      }
      picked.push(pool[index]);
      pool.splice(index, 1);
    }
  }
  return picked;
}

/** The script this station offers right now, or null (legacy/idle). */
export function benchScriptFor(
  machine: Machine,
  progression: ProgressionState,
): BenchScript | null {
  const operations = availableOperations(machine, progression);
  const selected = machine.selectedOperationOrNull;
  const inProgress = machine.operationProgress.status === "inProgress";

  if (inProgress && selected?.interaction) {
    const interaction = selected.interaction;
    const phases = selected.phases;
    const attendedNow =
      !phases || phases[machine.operationProgress.phaseIndex]?.attended;
    if (!attendedNow) {
      return { kind: "curing", operation: selected };
    }
    if (interaction.kind === "stroke") {
      const workpiece = machine.processingMaterials[0];
      return workpiece
        ? {
            kind: "stroke",
            operation: selected,
            interaction,
            workpiece,
            started: true,
          }
        : null;
    }
    if (interaction.kind === "saw") {
      const workpiece = machine.processingMaterials[0];
      return workpiece && workpiece.type === "board"
        ? {
            kind: "saw",
            operation: selected,
            interaction,
            workpiece,
            started: true,
          }
        : null;
    }
    // A glue/assembly op mid-attended-phase shouldn't happen through the
    // bench view (its commit skips straight past), but a legacy start
    // could get here; let the hands finish it.
    if (interaction.kind === "glue" || interaction.kind === "assembly") {
      return {
        kind: interaction.kind,
        operation: selected,
        pieces: machine.processingMaterials,
      };
    }
    return null;
  }

  if (inProgress) {
    return null;
  }

  // Idle: a staged pallet offers prying whenever dismantling is known —
  // no plan is picked for tool work; the pallet's own nails are the offer.
  // The pallet wins over a lingering plan selection: it physically covers
  // the bench, and clearing it off (E takes it back) restores the plan.
  const dismantle = operations.find((op) => op.interaction?.kind === "pry");
  const pallet = machine.inputMaterials.find(
    (material): material is Pallet => material.type === "pallet",
  );
  if (dismantle && pallet) {
    return { kind: "pry", operation: dismantle, pallet };
  }

  if (!selected?.interaction || !operations.includes(selected)) {
    return null;
  }
  const interaction = selected.interaction;
  // Blueprint assembly runs on the scene, ghosts first: it doesn't wait
  // for a full load — the outlines show what's missing, and parts join
  // the build as the player sets them down (F) and lays them on.
  if (interaction.kind === "assembly" && interaction.blueprint) {
    const blueprint = productBlueprintFor(interaction.blueprint);
    if (blueprint) {
      return {
        kind: "assembly",
        operation: selected,
        pieces: machine.inputMaterials,
        blueprint,
      };
    }
  }
  // Stroke and saw work is tool-first (bench-work/tool-work.ts): the
  // held tool over a staged piece offers it — no plan, so an idle bench
  // never mounts those scripts from a selection. Only builds are plans.
  const pieces = stagedPieces(machine, selected);
  if (!pieces || pieces.length === 0) {
    return null;
  }
  if (interaction.kind === "glue" || interaction.kind === "assembly") {
    return { kind: interaction.kind, operation: selected, pieces };
  }
  return null;
}

/** A piece's footprint on the bench, in inches (sprite-drawing axes:
 * width across, length down). */
export function pieceSize(material: MaterialInstance): WorkSurfaceSize {
  switch (material.type) {
    case "pallet":
      return { widthIn: PALLET_WIDTH_IN, heightIn: PALLET_HEIGHT_IN };
    case "board": {
      const b = material as Board;
      return { widthIn: b.width, heightIn: b.length };
    }
    case "panel": {
      const p = material as Panel;
      return {
        widthIn: panelWidth(p),
        heightIn: p.length,
      };
    }
    case "endGrainSlice":
      // A crosscut slice stood on end: glue-face width by strip run
      return {
        widthIn: material.thickness / 4,
        heightIn: material.strips.reduce((sum, s) => sum + s.width, 0),
      };
    case "plywood":
      return {
        widthIn: material.width,
        heightIn: material.length,
      };
    default:
      return { widthIn: 10, heightIn: 10 };
  }
}

/**
 * A piece's footprint as placed: a board flipped up on edge (F) stands on
 * its edge face, so its footprint narrows from its width to its
 * thickness. Everything that hit-tests or outlines a placed piece reads
 * this rather than pieceSize, so a rail on edge is exactly as grabbable
 * as it looks.
 */
export function placedPieceSize(
  material: MaterialInstance,
  placement: { onEdge?: boolean },
): WorkSurfaceSize {
  if (placement.onEdge && material.type === "board") {
    const b = material as Board;
    return {
      widthIn: b.thickness / 4,
      heightIn: b.length,
    };
  }
  return pieceSize(material);
}

/** One piece's slot in a bench row layout, in inches from the row's
 * top-left. */
export interface RowSlot {
  readonly material: MaterialInstance;
  readonly xIn: number;
  readonly widthIn: number;
  readonly heightIn: number;
}

/**
 * The bench view's generic derived layout: components in a row, gaps
 * between them — glue-ups awaiting their joints, assemblies awaiting
 * their snaps (hand-authored layouts can come later for hero products).
 */
export function rowLayout(
  pieces: ReadonlyArray<MaterialInstance>,
  gapIn: number,
): { slots: ReadonlyArray<RowSlot>; size: WorkSurfaceSize } {
  const slots: RowSlot[] = [];
  let x = 0;
  let tallest = 0;
  for (const material of pieces) {
    const size = pieceSize(material);
    slots.push({
      material,
      xIn: x,
      widthIn: size.widthIn,
      heightIn: size.heightIn,
    });
    x += size.widthIn + gapIn;
    tallest = Math.max(tallest, size.heightIn);
  }
  return {
    slots,
    size: { widthIn: Math.max(x - gapIn, 1), heightIn: Math.max(tallest, 1) },
  };
}

/**
 * Where the saw's marked line falls on the stock, as a fraction of its
 * length from the top (the sprite's left end): the kept length measured
 * from the end that ISN'T cut.
 */
export function sawLineFraction(board: Board, params: ParameterValues): number {
  const target = Number(params.targetLength ?? board.length - 1);
  const fraction = target / board.length;
  return params.cutEnd === "left" ? 1 - fraction : fraction;
}
