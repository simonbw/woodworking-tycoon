/**
 * How far the view has scrolled past the fitted framing, in world
 * pixels. `scroll` is the vertical axis — zero whenever the shop's
 * player is indoors (the interior framing is exactly the fitted,
 * centered view), growing as they walk down the driveway. `scrollX` is
 * the horizontal axis, used only by venues wider than the screen (the
 * store); the shop leaves it at zero.
 *
 * A mutable singleton for the same reason playerMotionStore is one: the
 * camera moves every render frame, and going through React state would
 * re-render the world 60 times a second. CameraLayer writes it; the
 * pointer-to-cell mapping in ShopView reads it.
 */
export const camera = {
  scroll: 0,
  scrollX: 0,
};
