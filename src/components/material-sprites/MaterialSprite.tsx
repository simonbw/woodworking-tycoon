import React from "react";
import { FinishedProduct, MaterialInstance } from "../../game/Materials";
import { BoardSprite } from "./BoardSprite";
import { CuttingBoardSprite } from "./CuttingBoardSprite";
import { DefaultMaterialPileSprite } from "./DefaultMaterialPileSprite";
import { EndGrainSliceSprite } from "./EndGrainSliceSprite";
import { FinishedBoxSprite } from "./FinishedBoxSprite";
import { PalletSprite } from "./PalletSprite";
import { PanelSprite } from "./PanelSprite";
import { PictureFrameSprite } from "./PictureFrameSprite";
import { PlanterBoxSprite } from "./PlanterBoxSprite";
import { SawdustPileSprite } from "./SawdustPileSprite";
import { SheetGoodSprite } from "./SheetGoodSprite";

// Just choose the correct sprite for a material
export const MaterialSprite: React.FC<{
  material: MaterialInstance;
  alpha?: number;
  tint?: number;
}> = ({ material, alpha, tint }) => {
  switch (material.type) {
    case "board":
      return (
        <BoardSprite
          board={material}
          seed={material.id}
          alpha={alpha}
          tint={tint}
        />
      );

    case "pallet":
      return <PalletSprite pallet={material} alpha={alpha} tint={tint} />;

    case "plywood":
      return (
        <SheetGoodSprite
          sheet={material}
          seed={material.id}
          alpha={alpha}
          tint={tint}
        />
      );

    case "jewelryBox":
    case "birdhouse":
    case "crate":
    case "stepStool":
      return (
        <FinishedBoxSprite
          material={material as FinishedProduct}
          alpha={alpha}
          tint={tint}
        />
      );

    case "panel":
      return <PanelSprite panel={material} alpha={alpha} tint={tint} />;

    case "pictureFrame":
    case "hexFrame":
      return (
        <PictureFrameSprite
          material={material as FinishedProduct}
          alpha={alpha}
          tint={tint}
        />
      );

    case "planterBox":
      return (
        <PlanterBoxSprite
          material={material as FinishedProduct}
          alpha={alpha}
          tint={tint}
        />
      );

    case "endGrainSlice":
      return <EndGrainSliceSprite slice={material} alpha={alpha} tint={tint} />;

    case "sawdustPile":
      return <SawdustPileSprite pile={material} alpha={alpha} tint={tint} />;

    case "simpleCuttingBoard":
    case "stripedCuttingBoard":
    case "sunriseCuttingBoard":
    case "endGrainCuttingBoard":
    case "checkerboardCuttingBoard":
    case "servingTray":
      return (
        <CuttingBoardSprite material={material} alpha={alpha} tint={tint} />
      );

    default:
      return <DefaultMaterialPileSprite alpha={alpha} tint={tint} />;
  }
};
