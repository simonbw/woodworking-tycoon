import React from "react";
import { useCellMap } from "../game/CellMap";
import { FloorListSection } from "./current-cell-info/FloorListSection";
import { InventorySection } from "./current-cell-info/InventorySection";
import { SuppliesSection } from "./SuppliesSection";
import { useGameState } from "./useGameState";

/**
 * One manila folder holding the player's material paperwork: what's in
 * hand, what's underfoot, and what's in the supply cabinet — the right
 * rail beside the shop view. Long lists scroll inside the folder rather
 * than growing the panel.
 */
export const ShopManifest: React.FC = () => {
  const gameState = useGameState();
  const cellMap = useCellMap();

  if (gameState.player.away) return null;

  const inventoryCount = gameState.player.inventory.length;
  const floorCount =
    cellMap.at(gameState.player.position)?.grabbablePiles.length ?? 0;

  return (
    <div
      className="bg-paper-manila rounded-sm shadow-md p-3 space-y-3 min-h-0 max-h-full overflow-y-auto"
      data-testid="shop-manifest"
    >
      <section>
        <SheetLabel title="In Hand" count={inventoryCount} />
        <InventorySection />
      </section>
      <section>
        <SheetLabel title="Underfoot" count={floorCount} />
        <FloorListSection />
      </section>
      <SuppliesSection />
    </div>
  );
};

export const SheetLabel: React.FC<{ title: string; count?: number }> = ({
  title,
  count,
}) => (
  <div className="flex items-baseline justify-between px-1 pb-1">
    <h2 className="font-condensed uppercase tracking-[0.2em] text-[0.65rem] text-ink-black/60">
      {title}
    </h2>
    {count != null && count > 0 && (
      <span className="font-ink text-base leading-none text-ink-black/50">
        ×{count}
      </span>
    )}
  </div>
);
