/**
 * How far down the lot the view has scrolled past the interior framing,
 * in world pixels. Zero whenever the player is indoors — the interior
 * framing is exactly the fitted, centered view — and it grows as they
 * walk down the driveway (see CameraLayer).
 *
 * A mutable singleton for the same reason playerMotionStore is one: the
 * camera moves every render frame, and going through React state would
 * re-render the world 60 times a second. CameraLayer writes it; the
 * pointer-to-cell mapping in ShopView reads it.
 */
export const camera = {
  scroll: 0,
};
