import React from "react";
import { ConsumableId } from "../game/Consumable";
import { MachineId } from "../game/Machine";
import { ToolId } from "../game/Tool";
import { UpgradeId } from "../game/Upgrade";
import { classNames } from "../utils/classNames";

/**
 * Pixel-art icons for tools and consumables, keyed by id. Files live in
 * static/images/icons/ as tool-<id>.png / consumable-<id>.png (64×64).
 * Plain <img> tags — these are HTML UI, not PIXI sprites, so they don't
 * go through loadAssets.
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
    className={classNames(
      className ?? ICON_SIZE_CLASSES,
      "object-contain",
      src.startsWith("/images/icons/") && PIXEL_ART_CLASS,
    )}
  />
);

export const ToolIcon: React.FC<{ toolId: ToolId; className?: string }> = ({
  toolId,
  className,
}) => <Icon src={`/images/icons/tool-${toolId}.png`} className={className} />;

export const ConsumableIcon: React.FC<{
  consumableId: ConsumableId;
  className?: string;
}> = ({ consumableId, className }) => (
  <Icon
    src={`/images/icons/consumable-${consumableId}.png`}
    className={className}
  />
);

export const UpgradeIcon: React.FC<{
  upgradeId: UpgradeId;
  className?: string;
}> = ({ upgradeId, className }) => (
  <Icon src={`/images/icons/upgrade-${upgradeId}.png`} className={className} />
);

export const ClampIcon: React.FC<{ className?: string }> = ({ className }) => (
  <Icon src="/images/icons/misc-barClamp.png" className={className} />
);

export const ShopVacIcon: React.FC<{ className?: string }> = ({
  className,
}) => <Icon src="/images/icons/misc-shopVac.png" className={className} />;

/**
 * Shop-floor art first, pixel stand-in second — see the note above. A
 * machine with neither renders nothing rather than a broken image.
 */
const MACHINE_ICON_SRC: Partial<Record<MachineId, string>> = {
  jobsiteTableSaw: "/images/jobsite-table-saw.png",
  miterSaw: "/images/miter-saw.png",
  lunchboxPlaner: "/images/lunchbox-planer.png",
  jointer: "/images/benchtop-jointer.png",
  bandSaw: "/images/icons/machine-bandSaw.png",
  garbageCan: "/images/icons/machine-garbageCan.png",
};

export const MachineIcon: React.FC<{
  machineId: MachineId;
  className?: string;
}> = ({ machineId, className }) => {
  const src = MACHINE_ICON_SRC[machineId];
  return src ? <Icon src={src} className={className} /> : null;
};
