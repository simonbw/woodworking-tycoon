import React from "react";
import { ToolItem } from "../../game/Materials";
import { omitUndefined } from "../../utils/objectUtils";
import { IDS_WITHOUT_ICON_ART, toolIconSrc } from "../../utils/uiImages";
import { useTexture } from "../../utils/useTexture";
import { PIXELS_PER_CELL } from "../shop-view/shop-scale";
import { DefaultMaterialPileSprite } from "./DefaultMaterialPileSprite";

/** A hand tool lying on the floor — well inside its cell, like a pile. */
const TOOL_SPRITE_SIZE = PIXELS_PER_CELL * 0.55;

/**
 * A tool as a physical object in the world: the same pixel-art icon the
 * tool wall and racks use, so the thing in the bed is the thing on the
 * shelf. Tools whose icon hasn't been drawn yet fall back to the default
 * pile square (see docs/asset-backlog.md).
 */
export const ToolItemSprite: React.FC<{
  tool: ToolItem;
  alpha?: number;
  tint?: number;
}> = ({ tool, alpha, tint }) => {
  if (IDS_WITHOUT_ICON_ART.tools.includes(tool.toolId)) {
    return <DefaultMaterialPileSprite alpha={alpha} tint={tint} />;
  }
  return <LoadedToolItemSprite tool={tool} alpha={alpha} tint={tint} />;
};

/** Split out so the icon-less fallback never calls useTexture on a 404. */
const LoadedToolItemSprite: React.FC<{
  tool: ToolItem;
  alpha?: number;
  tint?: number;
}> = ({ tool, alpha, tint }) => {
  const texture = useTexture(toolIconSrc(tool.toolId));
  return (
    <pixiSprite
      texture={texture}
      anchor={0.5}
      width={TOOL_SPRITE_SIZE}
      height={TOOL_SPRITE_SIZE}
      {...omitUndefined({ alpha, tint })}
    />
  );
};
