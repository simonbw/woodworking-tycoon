import React, { useMemo } from "react";
import { buyMaterialAction } from "../../game/game-actions/store-actions";
import {
  describeStockDimensionsPlain,
  getMaterialName,
  makeMaterial,
  materialMeetsInput,
} from "../../game/material-helpers";
import { getSheetBuyPrice } from "../../game/material-values";
import { SheetGood } from "../../game/Materials";
import { SheetSku, unlockedSheetSkus } from "../../game/sheetStock";
import { Tooltip } from "../Tooltip";
import { useApplyGameAction, useGameState } from "../useGameState";

/**
 * The sheet-good rack (see sheetStock.ts). One card per SKU, cheapest
 * first; locked SKUs are completely absent until reputation reveals them.
 */
export const StoreSheetGoodsSection: React.FC = () => {
  const gameState = useGameState();
  const skus = unlockedSheetSkus(gameState.reputation);

  return (
    <section>
      <h2 className="aisle-heading">Sheet Goods</h2>
      <ul className="space-y-2">
        {skus.map((sku) => (
          <SheetSkuCard key={sku.kind} sku={sku} />
        ))}
      </ul>
    </section>
  );
};

const SheetSkuCard: React.FC<{ sku: SheetSku }> = ({ sku }) => {
  const applyAction = useApplyGameAction();
  const gameState = useGameState();

  const makeSheet = () =>
    makeMaterial<SheetGood>({
      type: "plywood",
      kind: sku.kind,
      length: sku.length,
      width: sku.width,
      thickness: sku.thickness,
    });

  const material = useMemo(makeSheet, [sku]);
  const price = getSheetBuyPrice(material);

  const numberOwned = gameState.player.inventory.filter((m) =>
    materialMeetsInput(m, {
      type: ["plywood"],
      kind: [sku.kind],
      length: [sku.length],
      width: [sku.width],
      thickness: [sku.thickness],
    }),
  ).length;

  return (
    <li className="product-card flex items-center gap-3">
      <div className="grow">
        <Tooltip content={describeStockDimensionsPlain(material)}>
          <div className="font-condensed font-bold text-base uppercase tracking-wide text-ink-black">
            {getMaterialName(material)}
          </div>
        </Tooltip>
        <div className="text-xs text-ink-fade">{sku.tagline}</div>
        {numberOwned > 0 && (
          <div className="text-xs text-store-orange-dark font-semibold tabular-nums">
            {numberOwned} owned
          </div>
        )}
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="price-tag tabular-nums">${price.toFixed(2)}</span>
        <button
          className="bg-store-orange hover:bg-store-orange-dark disabled:bg-store-concrete-dark disabled:text-ink-fade text-white font-condensed font-bold uppercase tracking-widest text-xs px-3 py-1 rounded-sm shadow"
          disabled={gameState.money < price}
          data-sfx="ui-purchase"
          onClick={() => applyAction(buyMaterialAction(makeSheet(), price))}
        >
          Buy
        </button>
      </div>
    </li>
  );
};
