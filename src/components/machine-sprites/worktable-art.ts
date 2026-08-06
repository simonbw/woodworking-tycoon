import { MachineId } from "../../game/Machine";

/**
 * Worktable art, by machine type.
 *
 * Each table ships as three exports off one drawing:
 *
 * - `-top` — the laminated top, filling the footprint edge to edge. This
 *   is the layer that must measure exactly: tables pushed together are
 *   one bench (`docs/worktables.md`), so any inset, rounded corner, or
 *   overhang draws a gap down a seam that isn't there.
 * - `-shadow` — the cast shadow, on a canvas wider than the top so it can
 *   bleed. Drawn in a pass of its own *under every table's top*
 *   (`WorktableShadowLayer`), because a neighbour's shadow falling across
 *   the top you just butted against it is exactly the seam this is
 *   avoiding.
 * - `-complete` — the two flattened together, for icons and anywhere a
 *   table is shown on its own.
 *
 * `@4x` is the close-up export at 32 px/inch against the pipeline's 8,
 * used by the bench view (leaning over a bench puts it on screen at
 * roughly native size instead of an eighth of it). Same drawing, same
 * canvas centre, so swapping one for the other lands the art in the same
 * place.
 *
 * A table with no entry here falls back to the procedural sprite, which
 * is what the shop floor drew for every table until now — so art can land
 * one table at a time. `worktable1x3` (the 6-ft run) has none yet.
 *
 * These are deliberately NOT in `scripts/trim-images.ts`. Trimming crops
 * to the opaque bounds, which would eat exactly the shadow bleed that
 * makes the shadow layer a separate layer, and would shrink each layer by
 * a different amount — the top and its shadow have to stay registered to
 * each other, so both keep the canvas they were drawn on.
 */
const WORKTABLE_ART: Partial<Record<MachineId, string>> = {
  worktable1x1: "workbench-2x2",
  worktable1x2: "workbench-2x4",
  worktable2x2: "workbench-4x4",
};

export type WorktableLayer = "top" | "shadow" | "complete";

/** The art path for one layer of a table, or null when it isn't drawn yet.
 * `zoomed` picks the 32 px/inch export the bench view leans on. */
export function worktableArtSrc(
  machineId: string,
  layer: WorktableLayer,
  zoomed = false,
): string | null {
  const base = WORKTABLE_ART[machineId as MachineId];
  return base ? `/images/${base}-${layer}${zoomed ? "@4x" : ""}.png` : null;
}

/** Every worktable art file, for the texture preloader. */
export function worktableArtPaths(): string[] {
  const layers: WorktableLayer[] = ["top", "shadow", "complete"];
  return Object.keys(WORKTABLE_ART).flatMap((id) =>
    layers.flatMap((layer) => [
      worktableArtSrc(id, layer)!,
      worktableArtSrc(id, layer, true)!,
    ]),
  );
}
