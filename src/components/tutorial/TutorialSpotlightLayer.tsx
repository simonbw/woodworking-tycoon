import React, { useEffect, useState } from "react";
import { TUTORIAL_TARGET_ATTRIBUTE } from "../../game/tutorial";
import { useGameState } from "../useGameState";
import { tutorialTargets } from "./tutorialTargets";

/**
 * The ring the guided opening draws around chrome — the phone button, a
 * tab inside it, a product on the store shelf, a skill's Learn button.
 * In-world things wear an outline shader instead (see targetHighlight);
 * this is for everything that lives in the DOM.
 *
 * Measured rather than positioned: buttons self-mark with
 * `data-tutorial-target` and this layer reads their boxes, the same
 * arrangement reward flights use (see payout/rewardTargets). A target
 * that isn't mounted — the phone is closed, the aisle isn't open — simply
 * has no ring, which is the normal case, not an error.
 *
 * Rings never take pointer events: the button underneath is the thing
 * being pointed at, and it has to stay clickable.
 */

interface Ring {
  readonly id: string;
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

export const TutorialSpotlightLayer: React.FC = () => {
  const gameState = useGameState();
  const { domIds } = tutorialTargets(gameState);
  const [rings, setRings] = useState<ReadonlyArray<Ring>>([]);
  // A stable key for the effect: the id list changes only between steps.
  const domKey = domIds.join(",");

  useEffect(() => {
    if (domKey === "") {
      setRings([]);
      return;
    }
    const ids = domKey.split(",");
    let frame = 0;
    // Overlays open, tabs switch, and the top bar reflows underneath us,
    // so the boxes are re-measured every frame rather than on mount.
    const measure = () => {
      setRings(
        ids.flatMap((id) => {
          const element = document.querySelector(
            `[${TUTORIAL_TARGET_ATTRIBUTE}="${id}"]`,
          );
          if (!element) return [];
          const box = element.getBoundingClientRect();
          if (box.width === 0 || box.height === 0) return [];
          return [
            {
              id,
              top: box.top,
              left: box.left,
              width: box.width,
              height: box.height,
            },
          ];
        }),
      );
      frame = window.requestAnimationFrame(measure);
    };
    measure();
    return () => window.cancelAnimationFrame(frame);
  }, [domKey]);

  if (rings.length === 0) {
    return null;
  }

  return (
    // Above every overlay (modals sit at z-50), because the thing being
    // pointed at is often inside one.
    <div className="pointer-events-none fixed inset-0 z-[60]">
      {rings.map((ring) => (
        <div
          key={ring.id}
          className="tutorial-ring absolute rounded-lg"
          style={{
            top: ring.top - 6,
            left: ring.left - 6,
            width: ring.width + 12,
            height: ring.height + 12,
          }}
          data-testid={`tutorial-ring-${ring.id}`}
        />
      ))}
    </div>
  );
};
