import React from "react";
import { CLAMP_NAME } from "../../game/Clamp";
import { CartLine } from "../../game/cart";
import { CONSUMABLE_TYPES } from "../../game/Consumable";
import { BROOM_NAME } from "../../game/HeldTool";
import { MACHINE_TYPES, MachineId } from "../../game/Machine";
import { getMaterialFullName } from "../../game/material-helpers";
import { SHOP_VAC_NAME } from "../../game/ShopVac";
import { ToolId } from "../../game/Tool";
import { UPGRADE_TYPES, UpgradeId } from "../../game/Upgrade";
import {
  BroomIcon,
  ClampIcon,
  ConsumableIcon,
  MachineIcon,
  ShopVacIcon,
  ToolIcon,
  UpgradeIcon,
} from "../ItemIcon";
import { BoardFaceSvg } from "./BoardFaceSvg";
import { SheetFaceSvg } from "./SheetFaceSvg";

/**
 * What a line in the cart is called, and what it looks like — the two
 * things every surface that lists a cart needs: the register's receipt,
 * the store's own readout, the lumberyard's till.
 */

export function cartLineName(line: CartLine): string {
  switch (line.kind) {
    case "material":
      return getMaterialFullName(line.material);
    case "machine":
      return MACHINE_TYPES[line.machineTypeId].name;
    case "consumablePack":
      return CONSUMABLE_TYPES[line.consumableId].packName;
    case "upgrade":
      return UPGRADE_TYPES[line.upgradeId].name;
    case "clamp":
      return CLAMP_NAME;
    case "broom":
      return BROOM_NAME;
    case "shopVac":
      return SHOP_VAC_NAME;
  }
}

/** The picture a product goes by wherever a cart line stands for it —
 * the receipt row here, and the walkable store's shelf tags. */
export const CartLineIcon: React.FC<{ line: CartLine }> = ({ line }) => {
  switch (line.kind) {
    case "material": {
      const material = line.material;
      if (material.type === "board") {
        return (
          <BoardFaceSvg board={material} className="h-8 w-auto max-w-none" />
        );
      }
      if (material.type === "plywood") {
        return <SheetFaceSvg kind={material.kind} className="size-7" />;
      }
      if (material.type === "tool") {
        return (
          <ToolIcon toolId={material.toolId as ToolId} className="size-7" />
        );
      }
      return null;
    }
    case "machine":
      return (
        <MachineIcon
          machineId={line.machineTypeId as MachineId}
          className="max-h-8 w-auto"
        />
      );
    case "consumablePack":
      return (
        <ConsumableIcon consumableId={line.consumableId} className="size-7" />
      );
    case "upgrade":
      return (
        <UpgradeIcon
          upgradeId={line.upgradeId as UpgradeId}
          className="size-7"
        />
      );
    case "clamp":
      return <ClampIcon className="size-7" />;
    case "broom":
      return <BroomIcon className="size-7" />;
    case "shopVac":
      return <ShopVacIcon className="size-7" />;
  }
};
