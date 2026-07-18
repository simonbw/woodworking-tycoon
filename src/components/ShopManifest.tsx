import React from "react";
import { useCellMap } from "../game/CellMap";
import { FloorListSection } from "./current-cell-info/FloorListSection";
import { InventorySection } from "./current-cell-info/InventorySection";
import { useGameState } from "./useGameState";

/**
 * One manila folder holding the shop's material paperwork: what's in hand
 * and what's underfoot, both always visible. Long lists scroll inside the
 * folder rather than growing the panel.
 */
export const ShopManifest: React.FC = () => {
  const gameState = useGameState();
  const cellMap = useCellMap();

  const inventoryCount = gameState.player.inventory.length;
  const floorCount =
    cellMap.at(gameState.player.position)?.materialPiles.length ?? 0;

  return (
    <section className="bg-paper-manila rounded-sm shadow-md p-3 space-y-3 shrink-0 max-h-[45%] overflow-y-auto">
      <div>
        <SheetLabel title="Inventory" count={inventoryCount} />
        <InventorySection />
      </div>
      <div>
        <SheetLabel title="Floor" count={floorCount} />
        <FloorListSection />
      </div>
    </section>
  );
};

const SheetLabel: React.FC<{ title: string; count: number }> = ({
  title,
  count,
}) => (
  <div className="flex items-baseline justify-between px-1 pb-1">
    <h2 className="font-condensed uppercase tracking-[0.2em] text-[0.65rem] text-ink-black/60">
      {title}
    </h2>
    {count > 0 && (
      <span className="font-ink text-base leading-none text-ink-black/50">
        ×{count}
      </span>
    )}
  </div>
);
