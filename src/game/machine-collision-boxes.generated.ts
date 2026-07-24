// GENERATED FILE — do not edit by hand.
// Measured from the machine sprite images by scripts/generate-collision-boxes.ts;
// re-run `npm run generate:collision-boxes` after changing machine art.
import type { CollisionBox } from "./Machine";

/**
 * Collision boxes measured from sprite art: the opaque bounding box of each
 * image-based machine's static layers, in cell units relative to its origin
 * cell's center.
 */
export const GENERATED_COLLISION_BOXES = {
  lunchboxPlaner: { min: [-0.667, -1.094], max: [0.875, 1.042] },
  jointer: { min: [-0.448, -1.687], max: [0.875, 1.688] },
  miterSaw: { min: [-1.167, -0.885], max: [1.167, 0.823] },
  jobsiteTableSaw: { min: [-0.883, -0.808], max: [1.142, 0.808] },
  workspace: { min: [-1.302, -0.979], max: [1.292, 0.802] },
} satisfies Record<string, CollisionBox>;
