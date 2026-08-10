import React, { useMemo } from "react";
import { CartLine } from "../../game/cart";
import { addToCartAction } from "../../game/game-actions/cart-actions";
import {
  describeStockDimensionsPlain,
  makeMaterial,
  materialMeetsInput,
  sheetKindLabel,
} from "../../game/material-helpers";
import { getSheetBuyPrice } from "../../game/material-values";
import { SheetGood } from "../../game/Materials";
import {
  SHEET_SIZES,
  SheetSize,
  SheetSku,
  unlockedSheetSkus,
} from "../../game/sheetStock";
import { useApplyGameAction, useGameState } from "../useGameState";
import { AisleSection } from "./AisleSection";
import { ProductTile } from "./ProductTile";
import { SheetFaceSvg } from "./SheetFaceSvg";
import { useCartCount } from "./useStoreTrip";

/**
 * The sheet-good rack (see sheetStock.ts). One tile per SKU, cheapest
 * first; locked SKUs are completely absent until reputation reveals them.
 */
export const StoreSheetGoodsSection: React.FC<{ className?: string }> = ({
  className,
}) => {
  const gameState = useGameState();
  const skus = unlockedSheetSkus(gameState.reputation);

  return (
    // Two rows of three under the lumber racks: sheets are the widest
    // thing the store sells and their tiles get the room to say so,
    // rather than a single thin shelf running the rack's whole width
    <AisleSection
      title="Sheet Goods"
      template="repeat(3, minmax(0, 1fr))"
      className={className}
    >
      {skus.flatMap((sku) =>
        SHEET_SIZES.map((size) => (
          <SheetSkuTile key={`${sku.kind}-${size.id}`} sku={sku} size={size} />
        )),
      )}
    </AisleSection>
  );
};

const SheetSkuTile: React.FC<{ sku: SheetSku; size: SheetSize }> = ({
  sku,
  size,
}) => {
  const applyAction = useApplyGameAction();
  const gameState = useGameState();

  const makeSheet = () =>
    makeMaterial<SheetGood>({
      type: "plywood",
      kind: sku.kind,
      length: size.length,
      width: size.width,
      thickness: sku.thickness,
    });

  const material = useMemo(makeSheet, [sku, size]);
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
      onAdd={() => applyAction(addToCartAction(line))}
    />
  );
};
