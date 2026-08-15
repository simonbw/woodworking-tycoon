import React from "react";
import { useShopOpen } from "../useShell";
import { HandsStrip } from "./HandsStrip";
import { ManualProvider } from "./manual/ManualProvider";
import { NavBar } from "./NavBar";
import { NightfallCard } from "./NightfallCard";
import { FloorSheet } from "./overlay/FloorSheet";
import { StartMenu } from "./StartMenu";
import { StationSheet } from "./station/StationSheet";
import { SuppliesSection } from "./SuppliesSection";

/**
 * The HUD chrome over the engine shell's canvas — the successor of
 * HomePage's overlay frame. The same layout contract holds: the canvas
 * runs edge to edge underneath, every strip here passes clicks through
 * (`pointer-events-none`) and only the chips re-enable them, and panels
 * never shove the canvas around.
 *
 * Before any shop is live this is the old Main's menu branch: the start
 * menu fills the sheet, and starting a game (its buttons boot the shop)
 * swaps it for the HUD.
 *
 * The wrappers are HomePage's, minus the bench-dive fade (that arrives
 * with phase 7's bench scene): the NavBar along the top (clock, balances,
 * Skills, the manual's ?, Menu — with the journal, binder, and pause menu
 * behind them), the coach's column top-left, what's in hand bottom-center,
 * the supply panel folded under the top bar on the right. The
 * screen-anchored station and floor cards ride below the top bar's z-40
 * so its buttons stay clickable over them; the world-pinned chips and
 * prompts live in OverlayRoot, not here.
 */
export const EngineHud: React.FC = () => {
  const open = useShopOpen();
  if (!open) return <StartMenu />;

  return (
    // ManualProvider wraps the whole frame (old Main.tsx's nesting) so
    // `useManual` reaches every chip and card that points into the binder.
    <ManualProvider>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-40 px-6 pt-6">
        <NavBar />
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

      {/* The screen-anchored cards: whole-window surfaces, below the top
          bar's z-40 on purpose so its buttons stay clickable over them. */}
      <StationSheet />
      <FloorSheet />
    </ManualProvider>
  );
};
