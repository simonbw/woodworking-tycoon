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
import { ClampIcon, ConsumableIcon } from "../ItemIcon";
import { useApplyGameAction, useGameState } from "../useGameState";
import { AisleSection } from "./AisleSection";
import { ProductTile } from "./ProductTile";

export const StoreSuppliesSection: React.FC<{ className?: string }> = ({
  className,
}) => (
  <AisleSection title="Shop Supplies" className={className}>
    {(Object.keys(CONSUMABLE_TYPES) as ConsumableId[]).map((id) => (
      <ConsumablePackTile key={id} consumableId={id} />
    ))}
    <ClampTile />
  </AisleSection>
);

/**
 * Clamps hang in the supplies aisle but aren't a consumable: they come
 * back off the glue-up, so they're sold one bar at a time and the tile
 * reports how many are tied up right now rather than a pack size.
 */
const ClampTile: React.FC = () => {
  const applyAction = useApplyGameAction();
  const gameState = useGameState();
  const inUse = clampsInUse(gameState.machines);

  return (
    <ProductTile
      name={CLAMP_NAME}
      icon={<ClampIcon />}
      price={CLAMP_COST}
      info={`${CLAMP_DESCRIPTION} Sold one bar at a time.`}
      owned={
        gameState.clamps > 0
          ? `${gameState.clamps} owned${inUse > 0 ? ` (${inUse} in use)` : ""}`
          : undefined
      }
      canAfford={gameState.money >= CLAMP_COST}
      onBuy={() => applyAction(buyClampAction())}
    />
  );
};

/**
 * One consumable SKU: buy by the pack, stock lands in the shop-wide supply
 * (no carrying jugs around the shop).
 */
const ConsumablePackTile: React.FC<{ consumableId: ConsumableId }> = ({
  consumableId,
}) => {
  const applyAction = useApplyGameAction();
  const gameState = useGameState();
  const type = CONSUMABLE_TYPES[consumableId];
  const owned = gameState.consumables[consumableId] ?? 0;

  return (
    <ProductTile
      name={type.packName}
      icon={<ConsumableIcon consumableId={consumableId} />}
      price={type.packPrice}
      info={`${type.description} ${type.packSize} ${type.unit} per pack.`}
      owned={owned > 0 ? `${owned} ${type.unit} in shop` : undefined}
      canAfford={gameState.money >= type.packPrice}
      onBuy={() => applyAction(buyConsumablePackAction(consumableId))}
    />
  );
};
