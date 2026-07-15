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
