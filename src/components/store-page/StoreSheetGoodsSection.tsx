import React from "react";
import { buyMaterialAction } from "../../game/game-actions/store-actions";
import { makeMaterial } from "../../game/material-helpers";
import { getSellValue } from "../../game/material-values";
import { SheetGood } from "../../game/Materials";
import { useApplyGameAction, useGameState } from "../useGameState";

/** The one sheet-good SKU: jig stock, not furniture wood. */
function makePlywoodSheet(): SheetGood {
  return makeMaterial<SheetGood>({
    type: "plywood",
    kind: "plywoodB",
    length: 4,
    width: 4,
    thickness: 2,
  });
}

// Same markup rule as lumber: buying and flipping always loses money
const PLYWOOD_PRICE =
  Math.round(getSellValue(makePlywoodSheet()) * 3 * 100) / 100;

export const StoreSheetGoodsSection: React.FC = () => {
  const applyAction = useApplyGameAction();
  const gameState = useGameState();
  const canAfford = gameState.money >= PLYWOOD_PRICE;

  return (
    <section>
      <h2 className="aisle-heading">Sheet Goods</h2>
      <ul className="space-y-2">
        <li className="product-card flex items-center gap-3">
          <div className="grow">
            <div className="font-condensed font-bold text-base uppercase tracking-wide text-ink-black">
              Plywood Sheet
            </div>
            <div className="text-xs text-ink-fade">
              4'x4', 2/4 shop grade. Not pretty — perfect for jigs.
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="price-tag tabular-nums">
              ${PLYWOOD_PRICE.toFixed(2)}
            </span>
            <button
              className="bg-store-orange hover:bg-store-orange-dark disabled:bg-store-concrete-dark disabled:text-ink-fade text-white font-condensed font-bold uppercase tracking-widest text-xs px-3 py-1 rounded-sm shadow"
              disabled={!canAfford}
              onClick={() =>
                applyAction(
                  buyMaterialAction(makePlywoodSheet(), PLYWOOD_PRICE),
                )
              }
            >
              Buy
            </button>
          </div>
        </li>
      </ul>
    </section>
  );
};
