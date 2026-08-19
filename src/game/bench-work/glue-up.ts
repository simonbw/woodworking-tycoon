import {
  Board,
  EndGrainSlice,
  MaterialInstance,
  Panel,
  PanelStrip,
  panelWidth,
} from "../Materials";
import { BenchPlacement } from "./bench-layout";

/**
 * Plan-free glue-ups on the bench scene (docs/bench-work.md): there
 * is no "Glue Up Panel" sheet to pull. The player sets bar clamps out on
 * the bench, lays stock across them edge to edge, spreads glue down each
 * open seam, and tightens the clamps — and whatever contiguous run of
 * glueable stock sits in the clamps IS the glue-up, the same way the
 * stock on a direct-feed machine decides the cut. This module is the
 * pure geometry and inference under that: which lying pieces form a run,
 * which recipe the run amounts to (for XP, sounds, and the manual), how
 * many clamps the run calls for, and what a bare-handed press on a bar
 * comes to (`pressClamp`).
 *
 * The recipes in benchOperations.ts keep their fixed shapes as the
 * canonical declarations (previews, the manual, the ShopDriver's legacy
 * path), but their outputs accept any strip count — the scene decides
 * the composition.
 */

/** Clamps go one per foot of glue-up length, and never fewer than two —
 * boards lie across the clamp bars, so it's the length being spanned
 * that sets the count, not how wide the panel gets. */
export const CLAMP_SPACING_IN = 12;

export const MIN_CLAMPS = 2;

export function clampsForGlueSpan(lengthIn: number): number {
  return Math.max(MIN_CLAMPS, Math.ceil(lengthIn / CLAMP_SPACING_IN));
}

/** How far a laid edge can sit from its neighbor and still read as a
 * seam — squeeze-out closes small gaps, and the tighten pulls it home. */
const SEAM_GAP_TOLERANCE_IN = 1.25;

/** A hair of overlap from a generous drag still counts as butted. */
const SEAM_OVERLAP_TOLERANCE_IN = 0.35;

/** Ends must line up within this much along the length axis. */
const SEAM_END_TOLERANCE_IN = 1.0;

/** Two pieces must lie parallel within this many degrees to join. */
const SEAM_ANGLE_TOLERANCE_DEG = 8;

/** How far off square a placed clamp can lie and still hold the run. */
export const CLAMP_ANGLE_TOLERANCE_DEG = 25;

/** A clamp bar this close to a ghost position snaps onto it. */
export const CLAMP_SNAP_IN = 4;

/** A bar clamp lying on the bench, in bench inches. The bar runs along
 * `angleDeg`'s cross axis — the same convention as a piece's width. */
export interface ClampPlacement {
  readonly xIn: number;
  readonly yIn: number;
  /** The run angle the bar serves: the bar itself lies across it. */
  readonly angleDeg: number;
}

/** One open joint between two neighboring pieces in a run, with its
 * midline in bench inches — where the bead is drawn and stroked. */
export interface GlueSeam {
  readonly aId: string;
  readonly bId: string;
  /** Stable identity for coverage grids across renders. */
  readonly key: string;
  readonly x0In: number;
  readonly y0In: number;
  readonly x1In: number;
  readonly y1In: number;
  readonly lengthIn: number;
}

/** A contiguous edge-to-edge run of glueable stock, ordered across. */
// ---- How the bead is paced (the gesture's own tunables) ----

/** How wide the glue bottle's bead paints along a seam, in inches. */
export const BEAD_RADIUS_IN = 1;

/** Glue laid per second of active spreading, in²/s — one tunable. */
export const SPREAD_PER_SECOND = 14;

/**
 * How much of a seam the bead must cover. Deliberately short of the
 * sanding mask's 98%: squeeze-out closes small gaps, and pixel-hunting
 * the last half-inch of a glue line is nobody's idea of joinery.
 */
export const SPREAD_COMPLETE = 0.85;

/** How close a bare-hand press must land to a clamp bar to grab it. */
export const CLAMP_HIT_IN = 1.6;

export interface GlueRun {
  readonly pieces: ReadonlyArray<MaterialInstance>;
  readonly seams: ReadonlyArray<GlueSeam>;
  /** The length being clamped, along the pieces. */
  readonly lengthIn: number;
  /** The run's length-axis angle (the first piece's placement angle). */
  readonly angleDeg: number;
  readonly center: { xIn: number; yIn: number };
  /** Total width across the run, all pieces and gaps included. */
  readonly spanIn: number;
  /** The recipe this composition amounts to — XP, sound, and the
   * manual all follow it (see inferGlueOperationId). */
  readonly operationId: string;
}

export type GlueRunResult =
  | { readonly run: GlueRun; readonly reason: null }
  | { readonly run: null; readonly reason: string | null };

type Glueable = Board | Panel | EndGrainSlice;

function isGlueable(material: MaterialInstance): material is Glueable {
  return (
    material.type === "board" ||
    material.type === "panel" ||
    material.type === "endGrainSlice"
  );
}

/** A flat glueable piece's footprint: width across, length along. */
function glueSize(material: Glueable): { widthIn: number; lengthIn: number } {
  switch (material.type) {
    case "board":
      return { widthIn: material.width, lengthIn: material.length };
    case "panel":
      return { widthIn: panelWidth(material), lengthIn: material.length };
    case "endGrainSlice":
      // A crosscut slice lying flat: glue-face width by strip run
      return {
        widthIn: material.thickness / 4,
        lengthIn: material.strips.reduce((sum, s) => sum + s.width, 0),
      };
  }
}

/** Why this one piece can't join a glue-up, or null if it can. */
export function gluePrepShortfall(material: MaterialInstance): string | null {
  if (!isGlueable(material)) {
    return "Only boards, panels, and end-grain slices glue up.";
  }
  if (material.type === "board") {
    if (material.jointedEdges < 2) {
      return "Rough edges won't glue — joint both edges first.";
    }
    if (material.surface !== "smooth" && material.surface !== "sanded") {
      return "Rough faces make bad glue joints — plane the stock first.";
    }
  }
  return null;
}

interface Laid {
  readonly material: Glueable;
  readonly placement: BenchPlacement;
  readonly widthIn: number;
  readonly lengthIn: number;
}

/** B's center in A's local frame (x across A, y along A's length). */
function inLocalFrame(
  a: { xIn: number; yIn: number; angleDeg: number },
  xIn: number,
  yIn: number,
): { xIn: number; yIn: number } {
  const rad = (-a.angleDeg * Math.PI) / 180;
  const dx = xIn - a.xIn;
  const dy = yIn - a.yIn;
  return {
    xIn: dx * Math.cos(rad) - dy * Math.sin(rad),
    yIn: dx * Math.sin(rad) + dy * Math.cos(rad),
  };
}

/** A local point carried back to bench coordinates. */
function fromLocalFrame(
  a: { xIn: number; yIn: number; angleDeg: number },
  localX: number,
  localY: number,
): { xIn: number; yIn: number } {
  const rad = (a.angleDeg * Math.PI) / 180;
  return {
    xIn: a.xIn + localX * Math.cos(rad) - localY * Math.sin(rad),
    yIn: a.yIn + localX * Math.sin(rad) + localY * Math.cos(rad),
  };
}

function anglesParallel(a: number, b: number, tolerance: number): boolean {
  const diff = Math.abs(((a - b) % 180) + 180) % 180;
  return diff <= tolerance || diff >= 180 - tolerance;
}

/**
 * The recipe a run's composition amounts to. Five recipes were only ever
 * one operation — concatenate the strips of what lies edge to edge — so
 * the credited id is bookkeeping: XP, the completion sound, the manual
 * page. Null when the composition is no glue-up at all.
 */
export function inferGlueOperationId(
  pieces: ReadonlyArray<MaterialInstance>,
): string | null {
  if (pieces.length < 2 || !pieces.every(isGlueable)) {
    return null;
  }
  const slices = pieces.filter((p) => p.type === "endGrainSlice");
  if (slices.length > 0) {
    // End grain only glues to end grain, and the blank is a fixed shape
    return slices.length === pieces.length && slices.length === 4
      ? "glueUpEndGrain"
      : null;
  }
  const panels = pieces.filter((p) => p.type === "panel");
  if (panels.length >= 2) {
    return "joinPanels";
  }
  if (panels.length === 1) {
    return "extendPanel";
  }
  if (pieces.length === 2) {
    return "glueUpPair";
  }
  return "glueUpPanel";
}

/**
 * The contiguous edge-to-edge run lying among these pieces, or the
 * reason the near-miss doesn't count. Geometry first (parallel, butted,
 * ends aligned), then compatibility (prepped edges, one thickness, one
 * length) — the largest connected group wins, so spare stock lying
 * elsewhere on the bench never interferes.
 */
export function detectGlueRun(
  pieces: ReadonlyArray<{
    material: MaterialInstance;
    placement: BenchPlacement;
  }>,
): GlueRunResult {
  const laid: Laid[] = [];
  for (const piece of pieces) {
    if (!isGlueable(piece.material)) continue;
    // A board up on edge or end is being staged for something else
    if (piece.placement.onEdge || piece.placement.onEnd) continue;
    const size = glueSize(piece.material);
    laid.push({
      material: piece.material,
      placement: piece.placement,
      widthIn: size.widthIn,
      lengthIn: size.lengthIn,
    });
  }
  if (laid.length < 2) {
    return { run: null, reason: null };
  }

  // Every butted pair, by geometry alone
  const neighbors = new Map<string, string[]>();
  const pairs: Array<[Laid, Laid]> = [];
  for (let i = 0; i < laid.length; i++) {
    for (let j = i + 1; j < laid.length; j++) {
      const a = laid[i];
      const b = laid[j];
      if (
        !anglesParallel(
          a.placement.angleDeg,
          b.placement.angleDeg,
          SEAM_ANGLE_TOLERANCE_DEG,
        )
      ) {
        continue;
      }
      const local = inLocalFrame(a.placement, b.placement.xIn, b.placement.yIn);
      const gap = Math.abs(local.xIn) - (a.widthIn + b.widthIn) / 2;
      if (
        gap > SEAM_GAP_TOLERANCE_IN ||
        gap < -SEAM_OVERLAP_TOLERANCE_IN ||
        Math.abs(local.yIn) > SEAM_END_TOLERANCE_IN
      ) {
        continue;
      }
      pairs.push([a, b]);
      const aId = a.material.id;
      const bId = b.material.id;
      neighbors.set(aId, [...(neighbors.get(aId) ?? []), bId]);
      neighbors.set(bId, [...(neighbors.get(bId) ?? []), aId]);
    }
  }
  if (pairs.length === 0) {
    return { run: null, reason: null };
  }

  // The largest connected group is the run in the making
  const byId = new Map(laid.map((piece) => [piece.material.id, piece]));
  const seen = new Set<string>();
  let best: string[] = [];
  for (const id of neighbors.keys()) {
    if (seen.has(id)) continue;
    const component: string[] = [];
    const queue = [id];
    seen.add(id);
    while (queue.length > 0) {
      const current = queue.pop()!;
      component.push(current);
      for (const next of neighbors.get(current) ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    if (component.length > best.length) {
      best = component;
    }
  }

  // Order the group across the run: everything measured in the first
  // piece's local frame, sorted by the across coordinate
  const reference = byId.get(best[0])!;
  const ordered = best
    .map((id) => byId.get(id)!)
    .map((piece) => ({
      piece,
      cross: inLocalFrame(
        reference.placement,
        piece.placement.xIn,
        piece.placement.yIn,
      ).xIn,
    }))
    .sort((a, b) => a.cross - b.cross);

  // A run is a chain: each piece butted to the next in across order
  for (const { piece } of ordered) {
    if ((neighbors.get(piece.material.id) ?? []).length > 2) {
      return {
        run: null,
        reason: "That stack laps — a glue-up runs edge to edge, one row.",
      };
    }
  }

  // Compatibility across the whole run
  for (const { piece } of ordered) {
    const shortfall = gluePrepShortfall(piece.material);
    if (shortfall) {
      return { run: null, reason: shortfall };
    }
  }
  const thickness = (p: Glueable) => p.thickness;
  if (
    !ordered.every(
      ({ piece }) =>
        thickness(piece.material) === thickness(ordered[0].piece.material),
    )
  ) {
    return {
      run: null,
      reason: "One thickness per glue-up — plane the stock to match.",
    };
  }
  if (
    !ordered.every(
      ({ piece }) =>
        Math.abs(piece.lengthIn - ordered[0].piece.lengthIn) <= 0.5,
    )
  ) {
    return {
      run: null,
      reason: "The ends have to line up — cut the stock to one length.",
    };
  }

  const operationId = inferGlueOperationId(
    ordered.map(({ piece }) => piece.material),
  );
  if (!operationId) {
    return {
      run: null,
      reason: ordered.some(
        ({ piece }) => piece.material.type === "endGrainSlice",
      )
        ? "An end-grain blank takes exactly four slices, nothing mixed in."
        : null,
    };
  }

  // Seams between across-order neighbors, midline in bench inches
  const seams: GlueSeam[] = [];
  for (let i = 0; i < ordered.length - 1; i++) {
    const a = ordered[i];
    const b = ordered[i + 1];
    const midCross =
      (a.cross + a.piece.widthIn / 2 + (b.cross - b.piece.widthIn / 2)) / 2;
    const seamLength = Math.min(a.piece.lengthIn, b.piece.lengthIn);
    const frame = {
      xIn: reference.placement.xIn,
      yIn: reference.placement.yIn,
      angleDeg: reference.placement.angleDeg,
    };
    const start = fromLocalFrame(frame, midCross, -seamLength / 2);
    const end = fromLocalFrame(frame, midCross, seamLength / 2);
    const aId = a.piece.material.id;
    const bId = b.piece.material.id;
    seams.push({
      aId,
      bId,
      key: `${aId}|${bId}`,
      x0In: start.xIn,
      y0In: start.yIn,
      x1In: end.xIn,
      y1In: end.yIn,
      lengthIn: seamLength,
    });
  }

  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  const spanIn =
    last.cross +
    last.piece.widthIn / 2 -
    (first.cross - first.piece.widthIn / 2);
  const centerCross = first.cross - first.piece.widthIn / 2 + spanIn / 2;
  const center = fromLocalFrame(
    {
      xIn: reference.placement.xIn,
      yIn: reference.placement.yIn,
      angleDeg: reference.placement.angleDeg,
    },
    centerCross,
    0,
  );

  return {
    run: {
      pieces: ordered.map(({ piece }) => piece.material),
      seams,
      lengthIn: ordered[0].piece.lengthIn,
      angleDeg: reference.placement.angleDeg,
      center,
      spanIn,
      operationId,
    },
    reason: null,
  };
}

/**
 * Where the run's clamps belong: evenly spaced along the length being
 * glued, bars lying across the boards. These are the ghost outlines the
 * view invites clamps onto — a placed clamp snaps to the nearest one.
 */
export function clampGhosts(run: GlueRun): ReadonlyArray<ClampPlacement> {
  const needed = clampsForGlueSpan(run.lengthIn);
  const frame = {
    xIn: run.center.xIn,
    yIn: run.center.yIn,
    angleDeg: run.angleDeg,
  };
  return Array.from({ length: needed }, (_, i) => {
    const along = ((i + 0.5) / needed - 0.5) * run.lengthIn;
    const at = fromLocalFrame(frame, 0, along);
    return { xIn: at.xIn, yIn: at.yIn, angleDeg: run.angleDeg };
  });
}

/** Whether one placed clamp is holding this run: lying across it, within
 * its length, near enough to reach the stock. */
export function isClampOnRun(run: GlueRun, clamp: ClampPlacement): boolean {
  if (
    !anglesParallel(clamp.angleDeg, run.angleDeg, CLAMP_ANGLE_TOLERANCE_DEG)
  ) {
    return false;
  }
  const local = inLocalFrame(
    { xIn: run.center.xIn, yIn: run.center.yIn, angleDeg: run.angleDeg },
    clamp.xIn,
    clamp.yIn,
  );
  return (
    Math.abs(local.yIn) <= run.lengthIn / 2 + 1 &&
    Math.abs(local.xIn) <= run.spanIn / 2 + CLAMP_SNAP_IN
  );
}

/** The placed clamps actually holding this run, in the order they were
 * set out. */
export function clampsOnRun(
  run: GlueRun,
  placed: ReadonlyArray<ClampPlacement>,
): ReadonlyArray<ClampPlacement> {
  return placed.filter((clamp) => isClampOnRun(run, clamp));
}

/** What a bare-handed press on a set-out bar comes to. */
export type ClampPress =
  /** The bar comes back into the hand. */
  | { readonly kind: "pickUp" }
  /** The bar winds tight, and this many are now home. */
  | { readonly kind: "tighten"; readonly tightened: number }
  /** The last bar of the run: the cure starts. */
  | { readonly kind: "commit" };

/**
 * What pressing the bar at `index` does. Winding is the run's own move:
 * only a bar holding a run whose seams are all glued and whose clamp
 * count is met winds tight, and the last one there starts the cure. Any
 * other press — a bar lying off the run, a run still short of clamps or
 * glue — picks the bar back up.
 */
export function pressClamp(
  run: GlueRun | null,
  placed: ReadonlyArray<ClampPlacement>,
  index: number,
  state: { readonly tightened: number; readonly seamsGlued: boolean },
): ClampPress {
  const clamp = placed[index];
  if (!run || !clamp || !state.seamsGlued || !isClampOnRun(run, clamp)) {
    return { kind: "pickUp" };
  }
  const onRun = clampsOnRun(run, placed).length;
  if (onRun < clampsForGlueSpan(run.lengthIn)) return { kind: "pickUp" };
  const tightened = state.tightened + 1;
  return tightened >= onRun
    ? { kind: "commit" }
    : { kind: "tighten", tightened };
}

/** The strips of a run, concatenated in across order — what the panel
 * comes out as. Boards contribute one strip, panels all of theirs. */
export function concatenatedStrips(
  pieces: ReadonlyArray<MaterialInstance>,
): ReadonlyArray<PanelStrip> {
  const strips: PanelStrip[] = [];
  for (const piece of pieces) {
    if (piece.type === "board") {
      strips.push({ species: piece.species, width: piece.width });
    } else if (piece.type === "panel") {
      strips.push(...piece.strips);
    }
  }
  return strips;
}
