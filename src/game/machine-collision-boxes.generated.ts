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
  lunchboxPlaner: { min: [-0.167, -1.094], max: [1.375, 1.042] },
  jointer: { min: [0.052, -1.687], max: [1.375, 1.688] },
  miterSaw: { min: [-1.167, -1.385], max: [1.167, 0.323] },
  jobsiteTableSaw: { min: [-0.883, -1.308], max: [1.142, 0.308] },
  bandSaw: { min: [-1.115, -0.521], max: [1.76, 1.656] },
  workspace: { min: [-1.302, -1.479], max: [1.292, 0.302] },
} satisfies Record<string, CollisionBox>;
