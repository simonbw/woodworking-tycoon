import React from "react";
import { FinishedProduct, MaterialInstance } from "../../game/Materials";
import { BoardSprite } from "./BoardSprite";
import { DefaultMaterialPileSprite } from "./DefaultMaterialPileSprite";
import { FinishedBoxSprite } from "./FinishedBoxSprite";
import { PalletSprite } from "./PalletSprite";

// Just choose the correct sprite for a material
export const MaterialSprite: React.FC<{
  material: MaterialInstance;
}> = ({ material }) => {
  switch (material.type) {
    case "board":
      return <BoardSprite board={material} />;

    case "pallet":
      return <PalletSprite pallet={material} />;

    case "jewelryBox":
      return <FinishedBoxSprite material={material as FinishedProduct} />;

    default:
      return <DefaultMaterialPileSprite />;
  }
};
