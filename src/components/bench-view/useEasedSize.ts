import { useEffect, useRef, useState } from "react";
import { WorkSurfaceSize } from "../../game/bench-work/workpiece";
import { easeInOutCubic } from "./benchSceneSlot";

/**
 * How long a re-framing takes. Shorter than the dive: the camera is
 * already leaned over the bench and only pulls back (or eases in) far
 * enough to hold the new frame.
 */
const REFRAME_MS = 400;

/**
 * The eased scene frame: when what the bench view must hold changes
 * size mid-lean — an assembly plan bigger than the bench pulled out,
 * or put away again — the framing ramps to the new size instead of
 * cutting. Returns a size that chases the target through a cubic ease
 * in log space (a camera ramp, like the dive's zoom, so pulling back
 * reads at the same rate as easing in). The first framing pins straight
 * to the target — the dive owns the opening move — and reduced motion
 * pins every change.
 *
 * Everything downstream of the frame (the stage fit, the backdrop, the
 * dive anchor, pointer-to-inches) derives from the returned value each
 * render, so the whole picture tracks one motion and hit-testing stays
 * honest mid-ramp.
 */
export function useEasedSize(
  target: WorkSurfaceSize,
  instant: boolean,
): WorkSurfaceSize {
  const [size, setSize] = useState(target);
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const { widthIn, heightIn } = target;
  useEffect(() => {
    const from = sizeRef.current;
    if (from.widthIn === widthIn && from.heightIn === heightIn) return;
    if (instant) {
      setSize({ widthIn, heightIn });
      return;
    }
    const startedAt = performance.now();
    let raf = requestAnimationFrame(function step() {
      const t = Math.min(1, (performance.now() - startedAt) / REFRAME_MS);
      if (t >= 1) {
        setSize({ widthIn, heightIn });
        return;
      }
      const eased = easeInOutCubic(t);
      const ramp = (a: number, b: number) =>
        Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * eased);
      setSize({
        widthIn: ramp(from.widthIn, widthIn),
        heightIn: ramp(from.heightIn, heightIn),
      });
      raf = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(raf);
  }, [widthIn, heightIn, instant]);
  return size;
}
