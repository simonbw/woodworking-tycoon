import React from "react";
import { FinishedProduct, MaterialInstance } from "../../game/Materials";
import { AssembledProductSprite } from "./AssembledProductSprite";
import { BoardOnEdgeSprite } from "./BoardOnEdgeSprite";
import { BoardSprite } from "./BoardSprite";
import { CuttingBoardSprite } from "./CuttingBoardSprite";
import { DefaultMaterialPileSprite } from "./DefaultMaterialPileSprite";
import { EndGrainSliceSprite } from "./EndGrainSliceSprite";
import { FinishedBoxSprite } from "./FinishedBoxSprite";
import { FurnitureSprite, FurnitureType } from "./FurnitureSprite";
import { PalletSprite } from "./PalletSprite";
import { PanelSprite } from "./PanelSprite";
import { PictureFrameSprite } from "./PictureFrameSprite";
import { PlanterBoxSprite } from "./PlanterBoxSprite";
import { SheetGoodSprite } from "./SheetGoodSprite";
import { ToolItemSprite } from "./ToolItemSprite";

// Just choose the correct sprite for a material
export const MaterialSprite: React.FC<{
  material: MaterialInstance;
  alpha?: number;
  tint?: number;
  /** The piece's bench placement has it standing on its long edge —
   * boards draw edge-up (BoardOnEdgeSprite); other types ignore it. */
  onEdge?: boolean;
}> = ({ material, alpha, tint, onEdge }) => {
  switch (material.type) {
    case "board":
      return onEdge ? (
        <BoardOnEdgeSprite
          board={material}
          seed={material.id}
          alpha={alpha}
          tint={tint}
        />
      ) : (
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

    // Blueprint-assembled products draw from their bill of materials —
    // the same slots the bench view assembled them on
    case "rusticShelf":
      return (
        <AssembledProductSprite
          material={material as FinishedProduct}
          alpha={alpha}
          tint={tint}
        />
      );

    case "shelf":
    case "bookshelf":
    case "sideTable":
      return (
        <FurnitureSprite
          material={material as FinishedProduct & { type: FurnitureType }}
          alpha={alpha}
          tint={tint}
        />
      );

    case "endGrainSlice":
      return <EndGrainSliceSprite slice={material} alpha={alpha} tint={tint} />;

    case "tool":
      return <ToolItemSprite tool={material} alpha={alpha} tint={tint} />;

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
