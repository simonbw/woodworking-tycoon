import React from "react";
import { ClampIcon, ConsumableIcon } from "../../../components/ItemIcon";
import { ProductTile } from "../../../components/shopping/ProductTile";
import { CartLine } from "../../../game/cart";
import {
  CLAMP_COST,
  CLAMP_DESCRIPTION,
  CLAMP_NAME,
  clampsInUse,
} from "../../../game/Clamp";
import { CONSUMABLE_TYPES, ConsumableId } from "../../../game/Consumable";
import { addToCart } from "../../../sim/commands/cart-commands";
import { ShellStore } from "../../ShellStore";
import { useGame, useShopState } from "../../useShell";
import { useCartCount } from "../trips/useStoreTrip";
import { AisleSection } from "./AisleSection";

export const StoreSuppliesSection: React.FC<{ className?: string }> = ({
  className,
}) => (
  <AisleSection title="Supplies" className={className}>
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
  const game = useGame();
  const gameState = useShopState();
  const inUse = clampsInUse(gameState.machines);
  const line: CartLine = { kind: "clamp", price: CLAMP_COST };
  const inCart = useCartCount(line);

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
      inCart={inCart}
      onAdd={() => {
        addToCart(game, line);
        game.entities.tryGetSingleton(ShellStore)?.bump();
      }}
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
  const game = useGame();
  const gameState = useShopState();
  const type = CONSUMABLE_TYPES[consumableId];
  const owned = gameState.consumables[consumableId] ?? 0;
  const line: CartLine = {
    kind: "consumablePack",
    consumableId,
    price: type.packPrice,
  };
  const inCart = useCartCount(line);

  return (
    <ProductTile
      name={type.packName}
      icon={<ConsumableIcon consumableId={consumableId} />}
      price={type.packPrice}
      info={`${type.description} ${type.packSize} ${type.unit} per pack.`}
      owned={owned > 0 ? `${owned} ${type.unit} in shop` : undefined}
      inCart={inCart}
      onAdd={() => {
        addToCart(game, line);
        game.entities.tryGetSingleton(ShellStore)?.bump();
      }}
    />
  );
};
