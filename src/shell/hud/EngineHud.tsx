import React from "react";
import { useShopOpen } from "../useShell";
import { HandsStrip } from "./HandsStrip";
import { NightfallCard } from "./NightfallCard";
import { SuppliesSection } from "./SuppliesSection";
import { TopBar } from "./TopBar";

/**
 * The HUD chrome over the engine shell's canvas — the successor of
 * HomePage's overlay frame. The same layout contract holds: the canvas
 * runs edge to edge underneath, every strip here passes clicks through
 * (`pointer-events-none`) and only the chips re-enable them, and panels
 * never shove the canvas around.
 *
 * The wrappers are HomePage's, minus the bench-dive fade (that arrives
 * with phase 7's bench scene): the readouts along the top, the coach's
 * column top-left, what's in hand bottom-center, the supply panel folded
 * under the top bar on the right.
 */
export const EngineHud: React.FC = () => {
  const open = useShopOpen();
  if (!open) return null;

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-40 px-6 pt-6">
        <TopBar />
      </div>

      {/* The coach's column: the tutorial cards land at the top of this
          wrapper (phase-5 fan-out), the nightfall note beneath them */}
      <div className="absolute left-6 top-6 z-20 w-80 space-y-3">
        <div className="space-y-3">
          <NightfallCard />
        </div>
      </div>

      {/* pointer-events-none so the full-width strip doesn't eat clicks
          meant for what's underneath (the chip re-enables its buttons) */}
      <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center px-6">
        <div className="pointer-events-auto">
          <HandsStrip />
        </div>
      </div>

      {/* below-top-bar clears the top bar's chip. */}
      <div className="absolute right-6 below-top-bar z-40">
        <SuppliesSection />
      </div>
    </>
  );
};
