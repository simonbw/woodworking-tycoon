import React from "react";
import { buyShopVacAction } from "../../game/game-actions/shop-vac-actions";
import { buyToolAction } from "../../game/game-actions/tool-actions";
import { buyUpgradeAction } from "../../game/game-actions/upgrade-actions";
import { SHOP_VAC_COST } from "../../game/ShopVac";
import { TOOL_TYPES, ToolId, ToolType } from "../../game/Tool";
import { UPGRADE_TYPES, UpgradeId, UpgradeType } from "../../game/Upgrade";
import { ShopVacIcon, ToolIcon, UpgradeIcon } from "../ItemIcon";
import { useApplyGameAction, useGameState } from "../useGameState";
import { AisleSection } from "./AisleSection";
import { ProductTile } from "./ProductTile";

export const StoreToolsSection: React.FC<{ className?: string }> = ({
  className,
}) => {
  const gameState = useGameState();
  return (
    <AisleSection title="Tool Wall" className={className}>
      {Object.values(TOOL_TYPES)
        // Shop-made jigs aren't for sale — you build those. The dust
        // bag stays off the wall until sawdust is a revealed problem.
        .filter((tool) => !tool.craftedOnly)
        .filter(
          (tool) =>
            tool.id !== "dustBag" || gameState.progression.sweepingUnlocked,
        )
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
      <ShopVacProductTile />
    </AisleSection>
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
 * the shop floor. Hidden until the sawdust tutorial has fired (nothing
 * cleaning-related exists before then), and it's a one-time purchase.
 */
const ShopVacProductTile: React.FC = () => {
  const applyAction = useApplyGameAction();
  const gameState = useGameState();

  if (!gameState.progression.sweepingUnlocked || gameState.shopVac !== null) {
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

  const numberOwned =
    gameState.storage.tools.filter((id) => id === tool.id).length +
    gameState.machines.reduce(
      (sum, machine) => sum + machine.tools.filter((id) => id === tool.id).length,
      0,
    );

  return (
    <ProductTile
      name={tool.name}
      icon={<ToolIcon toolId={tool.id as ToolId} />}
      price={tool.cost}
      info={`${tool.description} Mounts into a workstation's tool slot.`}
      owned={numberOwned > 0 ? `${numberOwned} owned` : undefined}
      canAfford={gameState.money >= tool.cost}
      onBuy={() => applyAction(buyToolAction(tool.id as ToolId))}
    />
  );
};
