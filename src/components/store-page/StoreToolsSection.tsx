import React from "react";
import { buyBroomAction } from "../../game/game-actions/dust-actions";
import { buyShopVacAction } from "../../game/game-actions/shop-vac-actions";
import { buyToolAction } from "../../game/game-actions/tool-actions";
import { buyUpgradeAction } from "../../game/game-actions/upgrade-actions";
import { BROOM_COST } from "../../game/HeldTool";
import { ownedToolIds } from "../../game/progression-helpers";
import { SHOP_VAC_COST } from "../../game/ShopVac";
import { TOOL_TYPES, ToolId, ToolType } from "../../game/Tool";
import { UPGRADE_TYPES, UpgradeId, UpgradeType } from "../../game/Upgrade";
import { BroomIcon, ShopVacIcon, ToolIcon, UpgradeIcon } from "../ItemIcon";
import { useApplyGameAction, useGameState } from "../useGameState";
import { AisleSection } from "./AisleSection";
import { ProductTile } from "./ProductTile";

export const StoreToolsSection: React.FC<{ className?: string }> = ({
  className,
}) => {
  const gameState = useGameState();
  return (
    <AisleSection title="Tools" className={className}>
      {Object.values(TOOL_TYPES)
        // Shop-made jigs aren't for sale — you build those.
        .filter((tool) => !tool.craftedOnly)
        .map((tool) => (
          <ToolProductTile key={tool.id} tool={tool} />
        ))}
      {/* Bought worktable upgrades hang on the tool wall too — only the
          vise today; drawers and shelves are shop-built */}
      {Object.values(UPGRADE_TYPES)
        .filter((upgrade) => !upgrade.craftedOnly)
        .map((upgrade) => (
          <UpgradeProductTile key={upgrade.id} upgrade={upgrade} />
        ))}
      <BroomProductTile />
      <ShopVacProductTile />
    </AisleSection>
  );
};

/**
 * The shop broom isn't a tool-slot tool — it leans on the floor wherever
 * it was last set down. One to a shop, so the tile leaves the wall once
 * it's bought.
 */
const BroomProductTile: React.FC = () => {
  const applyAction = useApplyGameAction();
  const gameState = useGameState();

  if (gameState.broomOwned) {
    return null;
  }

  return (
    <ProductTile
      name="Shop Broom"
      icon={<BroomIcon />}
      price={BROOM_COST}
      info="A push broom with a dustpan. Sweeps sawdust off the floor; empty the pan at the garbage can."
      canAfford={gameState.money >= BROOM_COST}
      onBuy={() => applyAction(buyBroomAction())}
    />
  );
};

const UpgradeProductTile: React.FC<{ upgrade: UpgradeType }> = ({
  upgrade,
}) => {
  const applyAction = useApplyGameAction();
  const gameState = useGameState();

  const numberOwned =
    gameState.storage.upgrades.filter((id) => id === upgrade.id).length +
    gameState.machines.reduce(
      (sum, machine) =>
        sum + (machine.upgrades ?? []).filter((id) => id === upgrade.id).length,
      0,
    );

  return (
    <ProductTile
      name={upgrade.name}
      icon={<UpgradeIcon upgradeId={upgrade.id as UpgradeId} />}
      price={upgrade.cost}
      info={`${upgrade.description} Installs into a worktable's upgrade slot.`}
      owned={numberOwned > 0 ? `${numberOwned} owned` : undefined}
      canAfford={gameState.money >= upgrade.cost}
      onBuy={() => applyAction(buyUpgradeAction(upgrade.id as UpgradeId))}
    />
  );
};

/**
 * The shop vac isn't a tool-slot tool — it's a canister you drag around
 * the shop floor. A one-time purchase, so the tile leaves the wall once
 * it's bought.
 */
const ShopVacProductTile: React.FC = () => {
  const applyAction = useApplyGameAction();
  const gameState = useGameState();

  if (gameState.shopVac !== null) {
    return null;
  }

  return (
    <ProductTile
      name="Shop Vac"
      icon={<ShopVacIcon />}
      price={SHOP_VAC_COST}
      info="A canister vacuum on casters. Clears sawdust from the floor, including under machines. Drag it with you and empty it at the garbage can."
      canAfford={gameState.money >= SHOP_VAC_COST}
      onBuy={() => applyAction(buyShopVacAction())}
    />
  );
};

const ToolProductTile: React.FC<{ tool: ToolType }> = ({ tool }) => {
  const applyAction = useApplyGameAction();
  const gameState = useGameState();

  const numberOwned = ownedToolIds(gameState).filter(
    (id) => id === tool.id,
  ).length;

  return (
    <ProductTile
      name={tool.name}
      icon={<ToolIcon toolId={tool.id as ToolId} />}
      price={tool.cost}
      info={`${tool.description} Rides home in the truck's bed; carry it to a workstation and mount it in a tool slot.`}
      owned={numberOwned > 0 ? `${numberOwned} owned` : undefined}
      canAfford={gameState.money >= tool.cost}
      onBuy={() => applyAction(buyToolAction(tool.id as ToolId))}
    />
  );
};
