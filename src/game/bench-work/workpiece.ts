import {
  Machine,
  Operation,
  OperationInteraction,
  ParameterValues,
} from "../Machine";
import { ProgressionState } from "../GameState";
import {
  Board,
  CUTTING_BOARD_FOOTPRINTS,
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
 * docs/bench-work.md): which interactive script a station should be
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
  // Anything else — a finished cutting board under the oil rag — strokes
  // over the face it shows lying on the bench.
  return pieceSize(material);
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
   * `operateMachine`, true means the mask (re)starts from zero. */
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

export interface AssemblyScript {
  /** Assembly on the bench scene itself: the ghosts are the
   * blueprint's slots, the pieces are whatever is staged (complete or
   * not — parts arrive as the player sets them down), and the named
   * tool drives a fastener at each armed point. */
  readonly kind: "assembly";
  readonly operation: Operation;
  readonly pieces: ReadonlyArray<MaterialInstance>;
  readonly blueprint: ProductBlueprint;
}

export interface CuringScript {
  /** The hands-free remainder (a cure) running on the clock. */
  readonly kind: "curing";
  readonly operation: Operation;
}

export type BenchScript =
  StrokeScript | SawScript | PryScript | AssemblyScript | CuringScript;

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
    // A glue-up mid-attended-phase can't happen through the bench view
    // (the tighten commits start and finish back to back); anything in
    // progress here is as good as in the clamps already.
    if (interaction.kind === "glue") {
      return { kind: "curing", operation: selected };
    }
    if (interaction.kind === "assembly") {
      const blueprint = productBlueprintFor(interaction.blueprint);
      return blueprint
        ? {
            kind: "assembly",
            operation: selected,
            pieces: machine.processingMaterials,
            blueprint,
          }
        : null;
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
  // Assembly runs on the scene, ghosts first: it doesn't wait for a
  // full load — the outlines show what's missing, and parts join the
  // build as the player sets them down (F) and lays them on.
  if (interaction.kind === "assembly") {
    const blueprint = productBlueprintFor(interaction.blueprint);
    return blueprint
      ? {
          kind: "assembly",
          operation: selected,
          pieces: machine.inputMaterials,
          blueprint,
        }
      : null;
  }
  // Everything else is plan-free: stroke and saw work is tool-first
  // (bench-work/tool-work.ts), and glue-ups are clamps-first — the run
  // lying in the clamps decides (bench-work/glue-up.ts). No selection
  // mounts a script; only assembly builds are plans.
  return null;
}

/**
 * Which table in a run of pushed-together tables is the one actually
 * working, and what it's working on.
 *
 * Tables share a surface, but an operation still belongs to one of them —
 * the one whose bays hold the stock. So the run offers whatever any
 * member offers, and the commit goes back to that member. In order:
 *
 * 1. A member mid-operation wins. There is only ever one — a curing panel
 *    or a half-sanded board is the run's business until it's done.
 * 2. Otherwise a member with something to offer: a staged pallet to pry,
 *    a plan pulled and parts on the bench. The table the player walked up
 *    to gets first refusal, so a plan picked here doesn't jump next door.
 * 3. Otherwise the table the player walked up to, idle.
 */
export function benchGroupWork(
  members: ReadonlyArray<{ machine: Machine }>,
  opened: Machine,
  progression: ProgressionState,
): { machine: Machine; script: BenchScript | null } {
  const ordered = [
    ...members.filter((member) => member.machine.state === opened.state),
    ...members.filter((member) => member.machine.state !== opened.state),
  ].map((member) => member.machine);

  const busy = ordered.find(
    (machine) => machine.operationProgress.status === "inProgress",
  );
  if (busy) {
    return { machine: busy, script: benchScriptFor(busy, progression) };
  }
  for (const machine of ordered) {
    const script = benchScriptFor(machine, progression);
    if (script) {
      return { machine, script };
    }
  }
  return { machine: opened, script: null };
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
    case "simpleCuttingBoard":
    case "stripedCuttingBoard":
    case "sunriseCuttingBoard":
    case "endGrainCuttingBoard":
    case "checkerboardCuttingBoard":
      // The declaration drawCuttingBoard draws from, so the oil wipe and
      // the grab cover exactly the board on the bench
      return CUTTING_BOARD_FOOTPRINTS[material.type];
    case "tool":
      return { widthIn: 10, heightIn: 10 };
    default: {
      // A blueprint-assembled product's footprint is its blueprint's box
      // — the very frame assembledProduct.ts draws.
      const blueprint = productBlueprintFor(material.type);
      if (blueprint) {
        return { widthIn: blueprint.widthIn, heightIn: blueprint.heightIn };
      }
      return { widthIn: 10, heightIn: 10 };
    }
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
  placement: { onEdge?: boolean; onEnd?: boolean },
): WorkSurfaceSize {
  if (placement.onEnd && material.type === "board") {
    // Standing on its end, the board shows only its cross-section
    const b = material as Board;
    return {
      widthIn: b.width,
      heightIn: b.thickness / 4,
    };
  }
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
