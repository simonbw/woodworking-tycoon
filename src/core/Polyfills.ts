/*
 * Attach debugging conveniences to the global state.
 */

import * as PIXI from "pixi.js";

export function polyfill() {
  // Lets the Pixi devtools extension find the app.
  (window as unknown as { PIXI: typeof PIXI }).PIXI = PIXI;
}
