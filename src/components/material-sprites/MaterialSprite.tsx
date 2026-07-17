import React from "react";
import { FinishedProduct, MaterialInstance } from "../../game/Materials";
import { BoardSprite } from "./BoardSprite";
import { CuttingBoardSprite } from "./CuttingBoardSprite";
import { DefaultMaterialPileSprite } from "./DefaultMaterialPileSprite";
import { EndGrainSliceSprite } from "./EndGrainSliceSprite";
import { FinishedBoxSprite } from "./FinishedBoxSprite";
import { PalletSprite } from "./PalletSprite";
import { PanelSprite } from "./PanelSprite";

// Just choose the correct sprite for a material
export const MaterialSprite: React.FC<{
  material: MaterialInstance;
  alpha?: number;
  tint?: number;
}> = ({ material, alpha, tint }) => {
  switch (material.type) {
    case "board":
      return <BoardSprite board={material} alpha={alpha} tint={tint} />;

    case "pallet":
      return <PalletSprite pallet={material} alpha={alpha} tint={tint} />;

    case "jewelryBox":
      return <FinishedBoxSprite material={material as FinishedProduct} alpha={alpha} tint={tint} />;

    case "panel":
      return <PanelSprite panel={material} alpha={alpha} tint={tint} />;

    case "endGrainSlice":
      return (
        <EndGrainSliceSprite slice={material} alpha={alpha} tint={tint} />
      );

    case "simpleCuttingBoard":
    case "stripedCuttingBoard":
    case "sunriseCuttingBoard":
    case "endGrainCuttingBoard":
      return (
        <CuttingBoardSprite material={material} alpha={alpha} tint={tint} />
      );

    default:
      return <DefaultMaterialPileSprite alpha={alpha} tint={tint} />;
  }
};
