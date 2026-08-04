import React from "react";
import { Machine } from "../../game/Machine";
import { MaterialShelf, UpgradeRack } from "../station/racks";

/**
 * What's literally under the bench top: a worktable's storage shelf and
 * its upgrade slots, folded into a small corner drawer. Benches without
 * either (the makeshift workbench) render nothing — the bench view owes
 * them no paperwork at all. Tools hang on the top rail (BenchToolRail)
 * and plans pile up in the opposite corner (BlueprintCorner); this
 * drawer is only the furniture's own underside.
 */
export const UnderBenchPanel: React.FC<{ machine: Machine }> = ({
  machine,
}) => {
  const hasShelf = machine.materialStorage > 0;
  const hasUpgrades = (machine.type.upgradeSlots ?? 0) > 0;
  if (!hasShelf && !hasUpgrades) {
    return null;
  }
  return (
    <details
      className="pointer-events-auto absolute bottom-5 left-4 z-10 w-80 max-w-[80vw]"
      data-testid="under-bench"
    >
      <summary className="ml-0 inline-block cursor-pointer select-none rounded bg-ink-black/70 px-2.5 py-1.5 font-condensed uppercase tracking-[0.15em] text-[0.65rem] text-paper-manila/80 shadow-lg hover:text-paper-manila">
        Under the bench
      </summary>
      <div className="paper-card mt-1.5 max-h-[45vh] space-y-3 overflow-y-auto shadow-xl">
        <UpgradeRack machine={machine} />
        <MaterialShelf machine={machine} />
      </div>
    </details>
  );
};
