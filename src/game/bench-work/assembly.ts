import type { Machine } from "../Machine";
import { MaterialInstance } from "../Materials";
import { materialMeetsInput } from "../material-helpers";
import {
  benchPlacementFor,
  BenchPlacement,
  benchPointInFrame,
  benchTopSizeIn,
  framePointOnBench,
  FrameSizeIn,
  slotPlacementOnBench,
} from "./bench-layout";
import {
  BlueprintFastener,
  BlueprintSlot,
  ProductBlueprint,
} from "./blueprint";

/**
 * Assembly seating: which staged pieces are lying on their blueprint
 * slots, which fasteners those seats arm, and where a dragged piece
 * should snap. All derived from the pieces' persistent bench placements
 * (MachineState.benchLayout) — seating is never stored, so a refresh
 * mid-assembly finds every part exactly as seated as it was left. Only
 * driven-but-uncommitted fasteners are ephemeral (decision 4 in
 * docs/bench-minigames.md: assembly only spends, so it commits whole).
 */

/** A piece lying on the bench, placement and all (BenchScene's shape). */
export interface PlacedPiece {
  readonly material: MaterialInstance;
  readonly placement: BenchPlacement;
}

/** How close a piece must lie to its slot to count as seated. Snapping
 * commits exact placements, so this is float dust plus a nudge. */
export const SEAT_POSITION_TOLERANCE_IN = 1.25;
export const SEAT_ANGLE_TOLERANCE_DEG = 6;

/** How near a release must land for the piece to snap onto a slot. */
export const SNAP_RADIUS_IN = 6;
export const SNAP_ANGLE_TOLERANCE_DEG = 30;

/** Pointer must land this close (in inches) to drive a fastener. */
export const FASTENER_HIT_RADIUS_IN = 3.5;

/** The blueprint's product frame, for the shared frame transforms. */
export function blueprintFrame(blueprint: ProductBlueprint): FrameSizeIn {
  return { widthIn: blueprint.widthIn, heightIn: blueprint.heightIn };
}

/** A board reads the same end for end, so slot angles match mod 180. */
function angleDiff180(a: number, b: number): number {
  const diff = (((a - b) % 180) + 180) % 180;
  return Math.min(diff, 180 - diff);
}

/** Where a slot lies on the bench, through the product frame's placement. */
export function slotOnBench(
  blueprint: ProductBlueprint,
  productPlacement: BenchPlacement,
  slot: BlueprintSlot,
): BenchPlacement {
  return slotPlacementOnBench(
    productPlacement,
    blueprintFrame(blueprint),
    slot,
  );
}

/** Where a fastener sits on the bench. */
export function fastenerOnBench(
  blueprint: ProductBlueprint,
  productPlacement: BenchPlacement,
  fastener: BlueprintFastener,
): { xIn: number; yIn: number } {
  return framePointOnBench(
    productPlacement,
    blueprintFrame(blueprint),
    fastener.xIn,
    fastener.yIn,
  );
}

function pieceSeatsSlot(
  piece: PlacedPiece,
  requirementMet: boolean,
  slot: BlueprintSlot,
  slotPlace: BenchPlacement,
): boolean {
  return (
    requirementMet &&
    // An on-edge slot only seats a piece that has been tipped on edge
    // (F), and a flat slot only a piece lying flat — the orientation is
    // part of where the part belongs, not a nicety.
    !!piece.placement.onEdge === !!slot.onEdge &&
    Math.hypot(
      piece.placement.xIn - slotPlace.xIn,
      piece.placement.yIn - slotPlace.yIn,
    ) <= SEAT_POSITION_TOLERANCE_IN &&
    angleDiff180(piece.placement.angleDeg, slotPlace.angleDeg) <=
      SEAT_ANGLE_TOLERANCE_DEG
  );
}

/**
 * Which slot each seated piece fills: slot id → material id, greedy in
 * slot order. A piece seats a slot when it meets the slot's requirement
 * and lies on it (position and angle mod 180 — a board reads the same
 * end for end; flip doesn't matter to a board at all).
 */
export function seatedParts(
  blueprint: ProductBlueprint,
  productPlacement: BenchPlacement,
  pieces: ReadonlyArray<PlacedPiece>,
): ReadonlyMap<string, string> {
  const seated = new Map<string, string>();
  const claimed = new Set<string>();
  for (const slot of blueprint.slots) {
    const slotPlace = slotOnBench(blueprint, productPlacement, slot);
    const piece = pieces.find(
      (p) =>
        !claimed.has(p.material.id) &&
        pieceSeatsSlot(
          p,
          materialMeetsInput(p.material, slot.requirement),
          slot,
          slotPlace,
        ),
    );
    if (piece) {
      seated.set(slot.id, piece.material.id);
      claimed.add(piece.material.id);
    }
  }
  return seated;
}

/**
 * Where a dropped piece should snap: the nearest empty slot it fits,
 * within reach and roughly aligned (mod 180). The returned placement is
 * the slot's exact seat, with the angle expressed nearest the piece's
 * accumulated angle so the settle tween turns the short way, and the
 * piece's own flip kept (flip doesn't matter to a board).
 */
export function snapPlacementFor(
  blueprint: ProductBlueprint,
  productPlacement: BenchPlacement,
  material: MaterialInstance,
  at: BenchPlacement,
  takenSlotIds: ReadonlySet<string>,
): { slotId: string; placement: BenchPlacement } | null {
  let best: { slotId: string; placement: BenchPlacement } | null = null;
  let bestDist = SNAP_RADIUS_IN;
  for (const slot of blueprint.slots) {
    if (takenSlotIds.has(slot.id)) continue;
    if (!materialMeetsInput(material, slot.requirement)) continue;
    // A piece snaps only in the orientation the slot calls for — a flat
    // rail dragged over its on-edge seat stays in hand until it's tipped
    if (!!at.onEdge !== !!slot.onEdge) continue;
    const slotPlace = slotOnBench(blueprint, productPlacement, slot);
    const dist = Math.hypot(at.xIn - slotPlace.xIn, at.yIn - slotPlace.yIn);
    if (dist > bestDist) continue;
    if (
      angleDiff180(at.angleDeg, slotPlace.angleDeg) > SNAP_ANGLE_TOLERANCE_DEG
    ) {
      continue;
    }
    // The seat's angle, unwound to the turn the piece is already at
    const step = Math.round((at.angleDeg - slotPlace.angleDeg) / 180) * 180;
    best = {
      slotId: slot.id,
      placement: {
        xIn: slotPlace.xIn,
        yIn: slotPlace.yIn,
        angleDeg: slotPlace.angleDeg + step,
        flipped: at.flipped,
        onEdge: at.onEdge,
      },
    };
    bestDist = dist;
  }
  return best;
}

/**
 * The ghost frame's seat: squarely centered on the bench top — the same
 * seat the finished product's default placement lands on, so the build
 * never moves at the moment it completes.
 */
export function assemblyFramePlacement(benchSize: FrameSizeIn): BenchPlacement {
  return {
    xIn: benchSize.widthIn / 2,
    yIn: benchSize.heightIn / 2,
    angleDeg: 0,
    flipped: false,
  };
}

/**
 * Which material is seated on each slot at this bench right now, by slot
 * id — the bench view's seating derivation rebuilt from persistent state
 * (MachineState.benchLayout), so the claim that starts a build can
 * consume the very boards lying on the outlines rather than whatever
 * spare stock matches first.
 */
export function seatedAssemblyPieces(
  machine: Machine,
  blueprint: ProductBlueprint,
): ReadonlyMap<string, MaterialInstance> {
  const pieces = machine.state.inputMaterials.map((material) => ({
    material,
    placement: benchPlacementFor(machine, material),
  }));
  const seated = seatedParts(
    blueprint,
    assemblyFramePlacement(benchTopSizeIn(machine.type)),
    pieces,
  );
  const byId = new Map(pieces.map((p) => [p.material.id, p.material] as const));
  const bySlot = new Map<string, MaterialInstance>();
  for (const [slotId, materialId] of seated) {
    const material = byId.get(materialId);
    if (material) bySlot.set(slotId, material);
  }
  return bySlot;
}

/** The fasteners whose both parts are seated — ready for the hammer. */
export function armedFasteners(
  blueprint: ProductBlueprint,
  seated: ReadonlyMap<string, string>,
): ReadonlyArray<BlueprintFastener> {
  return blueprint.fasteners.filter((fastener) =>
    fastener.joins.every((slotId) => seated.has(slotId)),
  );
}

/** The fastener nearest a bench point, among candidates, within reach. */
export function fastenerAt(
  blueprint: ProductBlueprint,
  productPlacement: BenchPlacement,
  candidates: ReadonlyArray<BlueprintFastener>,
  xIn: number,
  yIn: number,
): BlueprintFastener | null {
  const local = benchPointInFrame(
    productPlacement,
    blueprintFrame(blueprint),
    xIn,
    yIn,
  );
  let best: BlueprintFastener | null = null;
  let bestDist = FASTENER_HIT_RADIUS_IN;
  for (const fastener of candidates) {
    const dist = Math.hypot(fastener.xIn - local.xIn, fastener.yIn - local.yIn);
    if (dist <= bestDist) {
      best = fastener;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * Pieces a driven fastener already holds: they don't drag, turn, or
 * leave the bench until the build commits — they're nailed on.
 */
export function fastenedPieceIds(
  seated: ReadonlyMap<string, string>,
  driven: ReadonlyArray<BlueprintFastener>,
): ReadonlySet<string> {
  const locked = new Set<string>();
  for (const fastener of driven) {
    for (const slotId of fastener.joins) {
      const materialId = seated.get(slotId);
      if (materialId) locked.add(materialId);
    }
  }
  return locked;
}
