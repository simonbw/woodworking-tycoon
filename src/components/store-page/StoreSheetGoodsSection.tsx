import React, { useMemo } from "react";
import { buyMaterialAction } from "../../game/game-actions/store-actions";
import {
  describeStockDimensionsPlain,
  makeMaterial,
  materialMeetsInput,
  sheetKindLabel,
} from "../../game/material-helpers";
import { getSheetBuyPrice } from "../../game/material-values";
import { SheetGood } from "../../game/Materials";
import { SheetSku, unlockedSheetSkus } from "../../game/sheetStock";
import { useApplyGameAction, useGameState } from "../useGameState";
import { AisleSection } from "./AisleSection";
import { ProductTile } from "./ProductTile";
import { SheetFaceSvg } from "./SheetFaceSvg";

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
    <AisleSection title="Sheet Goods" className={className}>
      {skus.map((sku) => (
        <SheetSkuTile key={sku.kind} sku={sku} />
      ))}
    </AisleSection>
  );
};

const SheetSkuTile: React.FC<{ sku: SheetSku }> = ({ sku }) => {
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
    <ProductTile
      // The kind alone on the shelf tag — every SKU of a kind is one
      // size, so the dimensions only have to be in the hover copy
      name={sheetKindLabel(sku.kind)}
      icon={<SheetFaceSvg kind={sku.kind} className="size-9" />}
      price={price}
      info={`${sku.tagline} ${describeStockDimensionsPlain(material)}.`}
      owned={numberOwned > 0 ? `${numberOwned} owned` : undefined}
      canAfford={gameState.money >= price}
      sfx="ui-purchase"
      onBuy={() => applyAction(buyMaterialAction(makeSheet(), price))}
    />
  );
};
