import React from "react";
import { ConsumableId } from "../game/Consumable";
import { MachineId } from "../game/Machine";
import { ToolId } from "../game/Tool";
import { UpgradeId } from "../game/Upgrade";
import { classNames } from "../utils/classNames";
import {
  BAR_CLAMP_ICON,
  BROOM_ICON,
  IDS_WITHOUT_ICON_ART,
  consumableIconSrc,
  MACHINE_ICON_SRC,
  SHOP_VAC_ICON,
  toolIconSrc,
  upgradeIconSrc,
} from "../utils/uiImages";

/**
 * Pixel-art icons for tools and consumables, keyed by id. Files live in
 * static/images/icons/ as tool-<id>.png / consumable-<id>.png (64×64).
 * Plain <img> tags — these are HTML UI, not PIXI sprites, so they don't
 * go through loadAssets. They are fetched ahead of first use by
 * `preloadUiImages`, which builds its list from the same path helpers
 * these components use; keep every `src` coming from `uiImages.ts` and an
 * icon can't be added without also being preloaded.
 *
 * Machines are the exception: where a machine already has shop-floor art
 * (the smooth 400×400 PNGs the sprites draw from) the icon reuses that
 * file, so the thing on the store shelf is the thing that lands on the
 * floor. The two machines still drawn procedurally carry a pixel-art
 * stand-in under icons/ until their real art lands (see
 * docs/asset-backlog.md).
 */

const ICON_SIZE_CLASSES = "size-10 shrink-0";

/** Nearest-neighbor: the 64×64 icons blur if the browser smooths them. */
const PIXEL_ART_CLASS = "[image-rendering:pixelated]";

const Icon: React.FC<{ src: string; className?: string }> = ({
  src,
  className,
}) => (
  <img
    src={src}
    alt=""
    // The default is an async decode, which paints the element's box a
    // frame before its pixels — so a whole aisle of icons appears a beat
    // after the shelf they sit on, even when every file is already in
    // hand. These are 64×64; decoding one on the spot costs less than the
    // frame it saves.
    decoding="sync"
    className={classNames(
      className ?? ICON_SIZE_CLASSES,
      "object-contain",
      src.startsWith("/images/icons/") && PIXEL_ART_CLASS,
    )}
  />
);

/**
 * A tool whose icon hasn't been drawn yet renders nothing rather than a
 * broken image, the same way a machine without art does — the gap is
 * tracked in `docs/asset-backlog.md`, and a 404 per shelf tag isn't a
 * better reminder than the list is.
 */
export const ToolIcon: React.FC<{ toolId: ToolId; className?: string }> = ({
  toolId,
  className,
}) =>
  IDS_WITHOUT_ICON_ART.tools.includes(toolId) ? null : (
    <Icon src={toolIconSrc(toolId)} className={className} />
  );

export const ConsumableIcon: React.FC<{
  consumableId: ConsumableId;
  className?: string;
}> = ({ consumableId, className }) => (
  <Icon src={consumableIconSrc(consumableId)} className={className} />
);

export const UpgradeIcon: React.FC<{
  upgradeId: UpgradeId;
  className?: string;
}> = ({ upgradeId, className }) => (
  <Icon src={upgradeIconSrc(upgradeId)} className={className} />
);

export const ClampIcon: React.FC<{ className?: string }> = ({ className }) => (
  <Icon src={BAR_CLAMP_ICON} className={className} />
);

export const ShopVacIcon: React.FC<{ className?: string }> = ({
  className,
}) => <Icon src={SHOP_VAC_ICON} className={className} />;

export const BroomIcon: React.FC<{ className?: string }> = ({ className }) => (
  <Icon src={BROOM_ICON} className={className} />
);

export const MachineIcon: React.FC<{
  machineId: MachineId;
  className?: string;
}> = ({ machineId, className }) => {
  const src = MACHINE_ICON_SRC[machineId];
  return src ? <Icon src={src} className={className} /> : null;
};
