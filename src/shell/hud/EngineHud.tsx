import React from "react";
import { useShopOpen } from "../useShell";
import { FloorSheet } from "./overlay/FloorSheet";
import { StationSheet } from "./station/StationSheet";
import { TopBar } from "./TopBar";

/**
 * The HUD chrome over the engine shell's canvas — the successor of
 * HomePage's overlay frame. The same layout contract holds: the canvas
 * runs edge to edge underneath, every strip here passes clicks through
 * (`pointer-events-none`) and only the chips re-enable them, and panels
 * never shove the canvas around.
 *
 * The spine carries the top bar; the rest of the frame — the coach's
 * column, the hands strip, the supplies fold-out, the modal layer —
 * lands with the phase-5 fan-out.
 */
export const EngineHud: React.FC = () => {
  const open = useShopOpen();
  if (!open) return null;

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-40 px-6 pt-6">
        <TopBar />
      </div>
      {/* The screen-anchored cards: whole-window surfaces, below the top
          bar's z-40 on purpose so its buttons stay clickable over them. */}
      <StationSheet />
      <FloorSheet />
    </>
  );
};
