import React from "react";
import { ConsumableId } from "../game/Consumable";
import { ToolId } from "../game/Tool";

/**
 * Pixel-art icons for tools and consumables, keyed by id. Files live in
 * static/images/icons/ as tool-<id>.png / consumable-<id>.png (64×64).
 * Plain <img> tags — these are HTML UI, not PIXI sprites, so they don't
 * go through loadAssets.
 */

const ICON_SIZE_CLASSES = "size-10 shrink-0 [image-rendering:pixelated]";

export const ToolIcon: React.FC<{ toolId: ToolId; className?: string }> = ({
  toolId,
  className,
}) => (
  <img
    src={`/images/icons/tool-${toolId}.png`}
    alt=""
    className={className ?? ICON_SIZE_CLASSES}
  />
);

export const ConsumableIcon: React.FC<{
  consumableId: ConsumableId;
  className?: string;
}> = ({ consumableId, className }) => (
  <img
    src={`/images/icons/consumable-${consumableId}.png`}
    alt=""
    className={className ?? ICON_SIZE_CLASSES}
  />
);
