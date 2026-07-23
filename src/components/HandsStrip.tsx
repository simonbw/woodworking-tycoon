import React from "react";
import { useCellMap } from "../game/CellMap";
import { FloorListSection } from "./current-cell-info/FloorListSection";
import { InventorySection } from "./current-cell-info/InventorySection";
import { SuppliesSection } from "./SuppliesSection";
import { useGameState } from "./useGameState";

/**
 * The strip under the shop view: the player's own paperwork — what's in
 * hand, what's underfoot, and the supply cabinet — kept directly below
 * where the eyes already are. Long lists scroll inside their column
 * rather than growing the strip.
 */
export const HandsStrip: React.FC = () => {
  const gameState = useGameState();
  const cellMap = useCellMap();

  if (gameState.player.away) return null;

  const inventoryCount = gameState.player.inventory.length;
  const floorCount =
    cellMap.at(gameState.player.position)?.grabbablePiles.length ?? 0;

  return (
    <div
      className="bg-paper-manila rounded-sm shadow-md p-3 grid grid-cols-3 gap-3 max-h-48 min-h-0 h-full max-h-full overflow-y-auto"
      data-testid="hands-strip"
    >
      <section className="min-h-0 overflow-y-auto">
        <SheetLabel title="In Hand" count={inventoryCount} />
        <InventorySection />
      </section>
      <section className="min-h-0 overflow-y-auto">
        <SheetLabel title="Underfoot" count={floorCount} />
        <FloorListSection />
      </section>
      <section className="min-h-0 overflow-y-auto">
        <SuppliesSection />
      </section>
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
