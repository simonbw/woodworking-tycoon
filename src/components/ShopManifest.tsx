import React, { useState } from "react";
import { useCellMap } from "../game/CellMap";
import { classNames } from "../utils/classNames";
import { FloorListSection } from "./current-cell-info/FloorListSection";
import { InventorySection } from "./current-cell-info/InventorySection";
import { useGameState } from "./useGameState";

type TabId = "inventory" | "floor";

/**
 * One manila folder holding the shop's material paperwork. File-folder
 * tabs switch between what's in hand and what's underfoot; the count on
 * each tab keeps the hidden sheet glanceable. The machine spec sheet
 * stays outside the folder because loading a machine needs the inventory
 * list visible alongside it.
 */
export const ShopManifest: React.FC = () => {
  const gameState = useGameState();
  const cellMap = useCellMap();
  const [tab, setTab] = useState<TabId>("inventory");

  const inventoryCount = gameState.player.inventory.length;
  const floorCount =
    cellMap.at(gameState.player.position)?.materialPiles.length ?? 0;

  return (
    <section>
      <div className="flex items-end gap-1 pl-3">
        <FolderTab
          label="Inventory"
          count={inventoryCount}
          active={tab === "inventory"}
          onClick={() => setTab("inventory")}
        />
        <FolderTab
          label="Floor"
          count={floorCount}
          active={tab === "floor"}
          onClick={() => setTab("floor")}
        />
      </div>
      <div className="bg-paper-manila rounded-b-sm rounded-tr-sm p-2 shadow-md">
        {tab === "inventory" ? <InventorySection /> : <FloorListSection />}
      </div>
    </section>
  );
};

const FolderTab: React.FC<{
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}> = ({ label, count, active, onClick }) => (
  <button
    onClick={onClick}
    data-sfx="ui-tab"
    className={classNames(
      "relative px-3 pt-1 pb-0.5 rounded-t-md font-condensed uppercase tracking-[0.15em] text-xs transition-colors",
      active
        ? "bg-paper-manila text-ink-black font-bold z-10"
        : "bg-paper-manila/40 text-paper-manila hover:bg-paper-manila/60 hover:text-ink-black",
    )}
  >
    {label}
    {count > 0 && (
      <span className="ml-1.5 font-mono text-[0.65rem] tabular-nums">
        {count}
      </span>
    )}
  </button>
);
