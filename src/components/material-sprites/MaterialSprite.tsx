import React from "react";
import { FinishedProduct, MaterialInstance } from "../../game/Materials";
import { BoardSprite } from "./BoardSprite";
import { DefaultMaterialPileSprite } from "./DefaultMaterialPileSprite";
import { FinishedBoxSprite } from "./FinishedBoxSprite";
import { PalletSprite } from "./PalletSprite";

// Just choose the correct sprite for a material
export const MaterialSprite: React.FC<{
  material: MaterialInstance;
  alpha?: number;
  tint?: number;
}> = ({ material, alpha, tint }) => {
  const optionalProps = {
    ...(alpha !== undefined && { alpha }),
    ...(tint !== undefined && { tint }),
  };

  switch (material.type) {
    case "board":
      return <BoardSprite board={material} {...optionalProps} />;

    case "pallet":
      return <PalletSprite pallet={material} {...optionalProps} />;

    case "jewelryBox":
      return <FinishedBoxSprite material={material as FinishedProduct} {...optionalProps} />;

    default:
      return <DefaultMaterialPileSprite {...optionalProps} />;
  }
};
