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
  lunchboxPlaner: { min: [-0.25, -0.41], max: [0.328, 0.391] },
  jointer: { min: [-0.168, -0.633], max: [0.328, 0.633] },
  miterSaw: { min: [-0.437, -0.332], max: [0.438, 0.309] },
  jobsiteTableSaw: { min: [-0.331, -0.303], max: [0.428, 0.303] },
  workspace: { min: [-0.488, -0.367], max: [0.484, 0.301] },
} satisfies Record<string, CollisionBox>;
