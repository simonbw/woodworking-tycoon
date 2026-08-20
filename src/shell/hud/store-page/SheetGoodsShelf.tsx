import React, { useMemo } from "react";
import { ProductTile } from "../../../components/shopping/ProductTile";
import { SheetFaceSvg } from "../../../components/shopping/SheetFaceSvg";
import { CartLine } from "../../../game/cart";
import {
  describeStockDimensionsPlain,
  makeMaterial,
  materialMeetsInput,
  sheetKindLabel,
} from "../../../game/material-helpers";
import { getSheetBuyPrice } from "../../../game/material-values";
import { SheetGood } from "../../../game/Materials";
import {
  SHEET_SIZES,
  SheetSize,
  SheetSku,
  unlockedSheetSkus,
} from "../../../game/sheetStock";
import { addToCart } from "../../../sim/commands/cart-commands";
import { ShellStore } from "../../ShellStore";
import { useGame, useShopState } from "../../useShell";
import { useCartCount } from "../trips/useStoreTrip";

/**
 * The sheet-good shelf itself: one tile per kind and size, cheapest kind
 * first, locked kinds completely absent until reputation reveals them
 * (see sheetStock.ts). The grid alone, with no heading — the website's
 * aisle section hangs its own signage over it.
 */
export const SheetGoodsShelf: React.FC<{ className?: string }> = ({
  className,
}) => {
  const gameState = useShopState();
  const skus = unlockedSheetSkus(gameState.reputation);

  return (
    <ul
      className={className ?? "grid grid-cols-3 gap-2"}
      data-testid="sheet-goods-shelf"
    >
      {skus.flatMap((sku) =>
        SHEET_SIZES.map((size) => (
          <SheetSkuTile key={`${sku.kind}-${size.id}`} sku={sku} size={size} />
        )),
      )}
    </ul>
  );
};

const SheetSkuTile: React.FC<{ sku: SheetSku; size: SheetSize }> = ({
  sku,
  size,
}) => {
  const game = useGame();
  const gameState = useShopState();

  const material = useMemo(
    () =>
      makeMaterial<SheetGood>({
        type: "plywood",
        kind: sku.kind,
        length: size.length,
        width: size.width,
        thickness: sku.thickness,
      }),
    [sku, size],
  );
  const price = getSheetBuyPrice(material);
  const line: CartLine = { kind: "material", material, price };
  const inCart = useCartCount(line);

  const numberOwned = gameState.player.inventory.filter((m) =>
    materialMeetsInput(m, {
      type: ["plywood"],
      kind: [sku.kind],
      length: [size.length],
      width: [size.width],
      thickness: [sku.thickness],
    }),
  ).length;

  return (
    <ProductTile
      // The kind is the product; the size goes on the line below with
      // the count, so a rack of three sizes doesn't set every tile in
      // the store as wide as its longest tag
      name={sheetKindLabel(sku.kind)}
      icon={<SheetFaceSvg kind={sku.kind} className="size-9" />}
      price={price}
      info={`${sku.tagline} ${describeStockDimensionsPlain(material)}.`}
      owned={
        numberOwned > 0 ? `${size.label} · ${numberOwned} owned` : size.label
      }
      inCart={inCart}
      onAdd={() => {
        addToCart(game, line);
        game.entities.tryGetSingleton(ShellStore)?.bump();
      }}
    />
  );
};
