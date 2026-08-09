import React, { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { CommissionsSection } from "../CommissionsSection";
import { Modal } from "../Modal";
import { useShortcut } from "../shortcuts/ShortcutProvider";

/** How long the sheet takes to grow out of the corner, or shrink back. */
const CLIPBOARD_ZOOM_MS = 260;

/**
 * Where the sheet sits when it's the tracker in the HUD's corner,
 * expressed as the transform that puts the full-size panel there: the
 * corner's top-left, scaled down to the corner's width. Both sheets are
 * the same paper printed at two densities, so mapping corner to corner
 * lands the headers on each other and the growth reads as one object
 * being picked up — not a card fading in over the world.
 *
 * With no corner to grow from — a work order that arrives while the
 * tracker is gone, straight off a payout — the sheet swells in place
 * instead.
 */
function collapsedOntoTracker(
  panel: HTMLElement,
  anchor: DOMRect | null,
): { transform: string; origin: string } {
  const rect = panel.getBoundingClientRect();
  if (!anchor || anchor.width === 0 || rect.width === 0) {
    return { transform: "scale(0.92)", origin: "center" };
  }
  // One scale for both axes: the two sheets say different amounts, so
  // their heights don't correspond and stretching to match would shear
  // the type. Width does correspond, and the top edges are pinned.
  const scale = anchor.width / rect.width;
  return {
    transform: `translate(${anchor.left - rect.left}px, ${anchor.top - rect.top}px) scale(${scale})`,
    origin: "top left",
  };
}

/**
 * Looking at your clipboard: the full work order — client note, checklist,
 * pay and reputation — on a sheet of paper. The always-on version is the
 * commission tracker in the HUD's corner, the same sheet cropped short;
 * this is what it grows into, and what shrinks back into it on the way
 * out. Pure presentation, and it honors prefers-reduced-motion: with
 * motion reduced the sheet simply is where it is.
 */
export const ClipboardModal: React.FC<{
  /** The put-down is under way: shrink back, then report it landed. */
  closing: boolean;
  onClose: () => void;
  onClosed: () => void;
  getAnchorRect: () => DOMRect | null;
}> = ({ closing, onClose, onClosed, getAnchorRect }) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);

  // A second C (or Escape) during the shrink would only re-close it.
  const requestClose = useCallback(() => {
    if (!closing) onClose();
  }, [closing, onClose]);

  // The clipboard's own key (C) also puts it down; Escape comes with the shell.
  useShortcut("close-clipboard", requestClose);

  const reduceMotion = React.useMemo(
    () =>
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
    [],
  );

  // Growing out of the corner. Layout effect so the first painted frame
  // already wears the collapsed transform — otherwise the full-size sheet
  // flashes for a frame before shrinking to its start.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const backdrop = backdropRef.current;
    if (reduceMotion || !panel || !backdrop) return;

    const start = collapsedOntoTracker(panel, getAnchorRect());
    panel.style.transformOrigin = start.origin;
    panel.style.transform = start.transform;
    panel.style.opacity = "0.4";
    backdrop.style.opacity = "0";

    const frame = requestAnimationFrame(() => {
      panel.style.transition =
        `transform ${CLIPBOARD_ZOOM_MS}ms cubic-bezier(0.22, 1, 0.36, 1), ` +
        `opacity ${CLIPBOARD_ZOOM_MS}ms ease-out`;
      backdrop.style.transition = `opacity ${CLIPBOARD_ZOOM_MS}ms ease-out`;
      panel.style.transform = "none";
      panel.style.opacity = "1";
      backdrop.style.opacity = "1";
    });
    return () => cancelAnimationFrame(frame);
  }, [reduceMotion, getAnchorRect]);

  // Shrinking back into it. The landing is a timer, not a transitionend:
  // a transform that happens to end where it started fires no event, and
  // the sheet must unmount either way.
  useEffect(() => {
    if (!closing) return;
    const panel = panelRef.current;
    const backdrop = backdropRef.current;
    if (reduceMotion || !panel || !backdrop) {
      onClosed();
      return;
    }

    const end = collapsedOntoTracker(panel, getAnchorRect());
    panel.style.transition =
      `transform ${CLIPBOARD_ZOOM_MS}ms cubic-bezier(0.4, 0, 0.8, 1), ` +
      `opacity ${CLIPBOARD_ZOOM_MS}ms ease-in`;
    backdrop.style.transition = `opacity ${CLIPBOARD_ZOOM_MS}ms ease-in`;
    panel.style.transformOrigin = end.origin;
    panel.style.transform = end.transform;
    panel.style.opacity = "0.2";
    backdrop.style.opacity = "0";

    const timer = window.setTimeout(onClosed, CLIPBOARD_ZOOM_MS);
    return () => window.clearTimeout(timer);
  }, [closing, reduceMotion, onClosed, getAnchorRect]);

  return (
    <Modal
      onClose={requestClose}
      label="Clipboard"
      panelRef={panelRef}
      backdropRef={backdropRef}
      // Just the sheet: the paper comes from the work order itself, so the
      // panel only sizes it and casts the shadow of something held up.
      panelClassName="relative w-full max-w-md max-h-[85vh] overflow-y-auto rounded-sm shadow-[0_12px_36px_rgba(0,0,0,0.5)]"
    >
      <CommissionsSection />
    </Modal>
  );
};
