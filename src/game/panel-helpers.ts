import {
  BoardDimension,
  MaterialInstance,
  Panel,
  PanelStrip,
  Species,
  SurfaceCondition,
} from "./Materials";
import { makeMaterial } from "./material-helpers";

/** Syntactic sugar to create a panel material instance */
export function panel(
  strips: ReadonlyArray<PanelStrip>,
  length: BoardDimension,
  thickness: BoardDimension,
  surface: SurfaceCondition = "rough",
): Panel {
  return makeMaterial<Panel>({
    type: "panel",
    strips,
    length,
    thickness,
    surface,
  });
}

/** A single-species panel of equal-width strips, the common case. */
export function uniformPanel(
  species: Species,
  stripCount: number,
  stripWidth: BoardDimension,
  length: BoardDimension,
  thickness: BoardDimension,
  surface: SurfaceCondition = "rough",
): Panel {
  const strips = Array.from({ length: stripCount }, () => ({
    species,
    width: stripWidth,
  }));
  return panel(strips, length, thickness, surface);
}

export function isPanel(material: MaterialInstance): material is Panel {
  return material.type === "panel";
}

/** Species alternates at every glue joint (A,B,A,B,...). */
export function stripsAlternate(strips: ReadonlyArray<PanelStrip>): boolean {
  return strips.every(
    (strip, i) => i === 0 || strip.species !== strips[i - 1].species,
  );
}

/**
 * A sunrise fade: strips in strict alternation, at least three of each wood,
 * where one species' strips get steadily narrower while the other's get
 * steadily wider (e.g. 3W,1M,2W,2M,1W,3M). Assumes exactly two species —
 * with alternation that puts one species on even indices, one on odd.
 */
export function isSunrisePattern(strips: ReadonlyArray<PanelStrip>): boolean {
  if (strips.length < 6 || !stripsAlternate(strips)) {
    return false;
  }
  const evens = strips.filter((_, i) => i % 2 === 0).map((s) => s.width);
  const odds = strips.filter((_, i) => i % 2 === 1).map((s) => s.width);
  const fades = (widths: ReadonlyArray<number>) =>
    widths.every((w, i) => i === 0 || w < widths[i - 1]);
  const grows = (widths: ReadonlyArray<number>) =>
    widths.every((w, i) => i === 0 || w > widths[i - 1]);
  return (fades(evens) && grows(odds)) || (grows(evens) && fades(odds));
}

/** The species covering the most width (ties go to first appearance). */
export function widthDominantSpecies(
  strips: ReadonlyArray<PanelStrip>,
): Species {
  const widths = new Map<Species, number>();
  for (const strip of strips) {
    widths.set(strip.species, (widths.get(strip.species) ?? 0) + strip.width);
  }
  return [...widths.entries()].sort((a, b) => b[1] - a[1])[0][0];
}
