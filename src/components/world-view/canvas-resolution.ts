/**
 * The device resolution the world canvas renders at: the display's real
 * pixel ratio, capped at 2 — above that the extra raster work buys
 * nothing the eye can find. Shared so everything that rasterizes at
 * canvas resolution agrees with the renderer: filters that render their
 * target into an intermediate texture (targetHighlight.ts) must run at
 * this resolution too, or the filtered object comes back CSS-stretched
 * from a 1x texture and blurs.
 */
export const CANVAS_RESOLUTION = Math.min(
  (typeof window !== "undefined" && window.devicePixelRatio) || 1,
  2,
);
