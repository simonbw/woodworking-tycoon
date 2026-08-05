// GENERATED FILE — do not edit by hand.
// Measured from the machine sprite images by scripts/generate-collision-boxes.ts;
// re-run `npm run generate:collision-boxes` after changing machine art.
import type { CollisionShape } from "./Machine";

/**
 * Collision shapes measured from sprite art: a greedy rectangle cover of
 * each image-based machine's static-layer silhouette, in cell units
 * relative to its origin cell's center.
 */
export const GENERATED_COLLISION_SHAPES = {
  lunchboxPlaner: [
    { kind: "box", min: [0.083, -1.083], max: [1, 1.083] },
    { kind: "box", min: [-0.167, -0.5], max: [0.083, 0.417] },
    { kind: "box", min: [1, -0.5], max: [1.25, 0.417] },
    { kind: "box", min: [1.25, 0.083], max: [1.417, 0.417] },
  ],
  jointer: [
    { kind: "box", min: [0.25, -1.75], max: [1, 1.75] },
    { kind: "box", min: [1, -0.917], max: [1.167, 0.917] },
    { kind: "box", min: [0.167, -0.833], max: [0.25, 0.833] },
    { kind: "box", min: [1.167, -0.25], max: [1.417, 0.25] },
  ],
  miterSaw: [
    { kind: "box", min: [-1.167, -0.917], max: [1.167, -0.25] },
    { kind: "box", min: [-0.5, -0.25], max: [0.5, 0.167] },
    { kind: "box", min: [-1.167, -1.417], max: [-0.917, -0.917] },
    { kind: "box", min: [0.917, -1.417], max: [1.167, -0.917] },
    { kind: "box", min: [-0.167, -1.25], max: [0.167, -0.917] },
  ],
  jobsiteTableSaw: [
    { kind: "box", min: [-0.917, -1.333], max: [0.917, 0.333] },
  ],
  bandSaw: [
    { kind: "box", min: [-1.083, -0.25], max: [1.75, 1.25] },
    { kind: "box", min: [-0.75, -0.417], max: [1.75, -0.25] },
    { kind: "box", min: [-0.583, 1.5], max: [1.75, 1.667] },
    { kind: "box", min: [-0.417, 1.25], max: [1.75, 1.417] },
  ],
  workspace: [
    { kind: "box", min: [-1.667, -1.667], max: [1.583, 0.667] },
    { kind: "box", min: [1.583, -0.083], max: [1.917, 0.583] },
    { kind: "box", min: [-1.667, 0.667], max: [0.833, 0.75] },
    { kind: "box", min: [-0.75, -1.75], max: [1.583, -1.667] },
  ],
} satisfies Record<string, ReadonlyArray<CollisionShape>>;
