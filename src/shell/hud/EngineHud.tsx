import React from "react";
import { useShopOpen } from "../useShell";
import { ManualProvider } from "./manual/ManualProvider";
import { NavBar } from "./NavBar";
import { StartMenu } from "./StartMenu";

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
 * The top strip is the NavBar (clock, balances, Skills, the manual's ?,
 * Menu — with the journal, binder, and pause menu behind them); the rest
 * of the frame — the coach's column, the hands strip, the supplies
 * fold-out — lands with the rest of the phase-5 fan-out.
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
    </ManualProvider>
  );
};
