/**
 * Where the shop view's world sits on the screen: the container's client
 * position, the fitted offsets, and the world scale. ShopView writes it
 * whenever it measures; the bench view reads it once when the zoom-in
 * transition starts, to know exactly where the bench is on screen at
 * shop framing (see bench-view/benchZoom.tsx).
 *
 * A mutable singleton in the cameraStore/playerMotionStore family: the
 * one reader samples it at a moment in time, and nothing should
 * re-render for it.
 */
export const shopFrame = {
  /** The shop container's top-left corner, in client px. */
  left: 0,
  top: 0,
  /** Where the shop floor's origin lands inside the container, in px. */
  offsetX: 0,
  offsetY: 0,
  /** Screen px per world px. */
  scale: 1,
  /** False until ShopView has measured once. */
  ready: false,
};
