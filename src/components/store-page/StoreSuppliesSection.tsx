import React from "react";
import { CONSUMABLE_TYPES, ConsumableId } from "../../game/Consumable";
import { buyConsumablePackAction } from "../../game/game-actions/store-actions";
import { ConsumableIcon } from "../ItemIcon";
import { useApplyGameAction, useGameState } from "../useGameState";

export const StoreSuppliesSection: React.FC = () => {
  return (
    <section>
      <h2 className="aisle-heading">Shop Supplies</h2>
      <ul className="space-y-2">
        {(Object.keys(CONSUMABLE_TYPES) as ConsumableId[]).map((id) => (
          <ConsumablePackCard key={id} consumableId={id} />
        ))}
      </ul>
    </section>
  );
};

/**
 * One consumable SKU: buy by the pack, stock lands in the shop-wide supply
 * (no carrying jugs around the shop).
 */
const ConsumablePackCard: React.FC<{ consumableId: ConsumableId }> = ({
  consumableId,
}) => {
  const applyAction = useApplyGameAction();
  const gameState = useGameState();
  const type = CONSUMABLE_TYPES[consumableId];
  const owned = gameState.consumables[consumableId] ?? 0;
  const canAfford = gameState.money >= type.packPrice;

  return (
    <li className="product-card flex items-center gap-3">
      <ConsumableIcon consumableId={consumableId} />
      <div className="grow">
        <div className="font-condensed font-bold text-base uppercase tracking-wide text-ink-black">
          {type.packName}
        </div>
        <div className="text-xs text-ink-fade">
          {type.description} {type.packSize} {type.unit} per pack.
        </div>
        <div className="text-xs text-ink-fade">
          In your shop:{" "}
          <span className="font-mono tabular-nums">
            {owned} {type.unit}
          </span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="price-tag tabular-nums">
          ${type.packPrice.toFixed(2)}
        </span>
        <button
          className="bg-store-orange hover:bg-store-orange-dark disabled:bg-store-concrete-dark disabled:text-ink-fade text-white font-condensed font-bold uppercase tracking-widest text-xs px-3 py-1 rounded-sm shadow"
          disabled={!canAfford}
          onClick={() => applyAction(buyConsumablePackAction(consumableId))}
        >
          Buy
        </button>
      </div>
    </li>
  );
};
