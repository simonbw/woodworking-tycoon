import React, { useState } from "react";
import { MaterialInstance } from "../../game/Materials";
import { buyMaterialAction } from "../../game/game-actions/store-actions";
import { getMaterialName, makePallet } from "../../game/material-helpers";
import { MaterialIcon } from "../current-cell-info/MaterialIcon";
import { useApplyGameAction, useGameState } from "../useGameState";

interface MaterialSaleInfo {
  /** Creates a fresh instance for each purchase */
  makeInstance: () => MaterialInstance;
  /** Display-only sample for the product card */
  material: MaterialInstance;
  price: number;
}

export const StoreMaterialSection: React.FC = () => {
  const [materialsForSale] = useState<ReadonlyArray<MaterialSaleInfo>>(() => {
    return [{ makeInstance: makePallet, material: makePallet(), price: 0 }];
  });
  return (
    <section>
      <h2 className="aisle-heading">Materials</h2>
      <ul className="space-y-2">
        {materialsForSale.map((info) => (
          <MaterialProductCard key={info.material.id} {...info} />
        ))}
      </ul>
    </section>
  );
};

const MaterialProductCard: React.FC<MaterialSaleInfo> = ({
  makeInstance,
  material,
  price,
}) => {
  const applyAction = useApplyGameAction();
  const gameState = useGameState();

  // Count by type: instance fields like a pallet's deckBoards vary per copy
  const numberOwned = gameState.player.inventory.filter(
    (m) => m.type === material.type,
  ).length;

  const canAfford = gameState.money >= price;

  return (
    <li className="product-card flex items-center gap-3">
      <MaterialIcon material={material} />
      <div className="grow">
        <div className="font-stencil text-base uppercase tracking-wide text-ink-black">
          {getMaterialName(material)}
        </div>
        <div className="text-xs text-ink-fade">
          {numberOwned > 0 && (
            <span className="text-store-orange-dark font-semibold">
              {numberOwned} owned ·{" "}
            </span>
          )}
          In stock
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <PriceTag price={price} />
        <button
          className="bg-store-orange hover:bg-store-orange-dark disabled:bg-store-concrete-dark disabled:text-ink-fade text-white font-stencil uppercase tracking-widest text-xs px-3 py-1 rounded-sm shadow"
          disabled={!canAfford}
          onClick={() => applyAction(buyMaterialAction(makeInstance(), price))}
        >
          Buy
        </button>
      </div>
    </li>
  );
};

const PriceTag: React.FC<{ price: number }> = ({ price }) => {
  if (price === 0) {
    return <span className="price-tag text-store-orange-dark">FREE</span>;
  }
  const dollars = Math.floor(price);
  const cents = Math.round((price - dollars) * 100)
    .toString()
    .padStart(2, "0");
  return (
    <span className="price-tag">
      ${dollars}
      <sup className="text-xs ml-0.5">{cents}</sup>
    </span>
  );
};
