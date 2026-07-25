import React from "react";
import {
  CLAMP_COST,
  CLAMP_DESCRIPTION,
  CLAMP_NAME,
  clampsInUse,
} from "../../game/Clamp";
import { CONSUMABLE_TYPES, ConsumableId } from "../../game/Consumable";
import {
  buyClampAction,
  buyConsumablePackAction,
} from "../../game/game-actions/store-actions";
import { ConsumableIcon } from "../ItemIcon";
import { useApplyGameAction, useGameState } from "../useGameState";
import { BuyButton } from "./BuyButton";

export const StoreSuppliesSection: React.FC = () => {
  return (
    <section>
      <h2 className="aisle-heading">Shop Supplies</h2>
      <ul className="space-y-2">
        {(Object.keys(CONSUMABLE_TYPES) as ConsumableId[]).map((id) => (
          <ConsumablePackCard key={id} consumableId={id} />
        ))}
        <ClampCard />
      </ul>
    </section>
  );
};

/**
 * Clamps hang in the supplies aisle but aren't a consumable: they come
 * back off the glue-up, so they're sold one bar at a time and the card
 * reports how many are tied up right now rather than a pack size.
 */
const ClampCard: React.FC = () => {
  const applyAction = useApplyGameAction();
  const gameState = useGameState();
  const inUse = clampsInUse(gameState.machines);
  const canAfford = gameState.money >= CLAMP_COST;

  return (
    <li className="product-card flex items-center gap-3">
      <div className="grow">
        <div className="font-condensed font-bold text-base uppercase tracking-wide text-ink-black">
          {CLAMP_NAME}
        </div>
        <div className="text-xs text-ink-fade">{CLAMP_DESCRIPTION}</div>
        <div className="text-xs text-ink-fade">
          On your rack:{" "}
          <span className="font-mono tabular-nums">
            {gameState.clamps}
            {inUse > 0 && ` (${inUse} in use)`}
          </span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="price-tag tabular-nums">${CLAMP_COST.toFixed(2)}</span>
        <BuyButton
          disabled={!canAfford}
          onClick={() => applyAction(buyClampAction())}
        >
          Buy
        </BuyButton>
      </div>
    </li>
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
        <BuyButton
          disabled={!canAfford}
          onClick={() => applyAction(buyConsumablePackAction(consumableId))}
        >
          Buy
        </BuyButton>
      </div>
    </li>
  );
};
