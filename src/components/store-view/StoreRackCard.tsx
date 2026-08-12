import React from "react";
import { LumberRack, SheetRack } from "../../game/store-layout";
import { BoardSelector } from "../shopping/BoardSelector";
import { SheetGoodsShelf } from "../shopping/SheetGoodsShelf";
import { Tooltip } from "../Tooltip";
import { rackTitle } from "./StoreOverlayLayer";

/**
 * A rack's card: the size picker, spread open the way a station sheet
 * is. You walked for the category — this is where you click for the
 * size, because nobody should walk an aisle to compare a 6-footer
 * against an 8-footer. A lumber rack opens its channel's run of standing
 * boards (the same racks the website draws); the sheet rack opens the
 * sheet-good tiles. Closes on Escape, Tab, the ✕, or walking away.
 */
export const StoreRackCard: React.FC<{
  rack: LumberRack | SheetRack;
  onClose: () => void;
}> = ({ rack, onClose }) => (
  <div className="pointer-events-none absolute inset-x-0 top-14 bottom-4 z-40 grid place-items-center px-4">
    <section
      data-testid="store-rack-card"
      className="paper-card pointer-events-auto flex max-h-full max-w-full flex-col gap-2 overflow-hidden"
    >
      <header className="flex shrink-0 items-baseline justify-between gap-6 border-b-2 border-ink-black/40 pb-1">
        <h3 className="font-condensed text-lg font-bold uppercase tracking-wide">
          {rackTitle(rack)}
        </h3>
        <Tooltip content="Back to the aisle" shortcut="close-sheet">
          <button
            className="button-paper text-xs leading-none"
            onClick={onClose}
            aria-label="Close rack card"
          >
            ✕
          </button>
        </Tooltip>
      </header>
      <div className="min-h-0 overflow-auto p-1">
        {rack.kind === "lumberRack" ? (
          <BoardSelector store={rack.channel.store} channel={rack.channel} />
        ) : (
          <SheetGoodsShelf className="grid grid-cols-3 gap-2" />
        )}
      </div>
    </section>
  </div>
);
