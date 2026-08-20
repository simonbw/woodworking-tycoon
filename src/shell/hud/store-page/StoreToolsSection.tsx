import React from "react";
import {
  BroomIcon,
  ShopVacIcon,
  ToolIcon,
  UpgradeIcon,
} from "../../../components/ItemIcon";
import { ProductTile } from "../../../components/shopping/ProductTile";
import { CartLine } from "../../../game/cart";
import { BROOM_COST, BROOM_NAME } from "../../../game/HeldTool";
import { makeToolItem } from "../../../game/material-helpers";
import { ownedToolIds } from "../../../game/progression-helpers";
import { SHOP_VAC_COST, SHOP_VAC_NAME } from "../../../game/ShopVac";
import { TOOL_TYPES, ToolId, ToolType } from "../../../game/Tool";
import { UPGRADE_TYPES, UpgradeId, UpgradeType } from "../../../game/Upgrade";
import { addToCart } from "../../../sim/commands/cart-commands";
import { ShellStore } from "../../ShellStore";
import { useGame, useShopState } from "../../useShell";
import { useCartCount } from "../trips/useStoreTrip";
import { AisleSection } from "./AisleSection";

export const StoreToolsSection: React.FC<{ className?: string }> = ({
  className,
}) => {
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

/** Puts one in the cart and tells the DOM layer to re-read the world. */
function useAddToCart(): (line: CartLine) => void {
  const game = useGame();
  return (line) => {
    addToCart(game, line);
    game.entities.tryGetSingleton(ShellStore)?.bump();
  };
}

/**
 * The shop broom isn't a tool-slot tool — it leans on the floor wherever
 * it was last set down. One to a shop, so the tile leaves the wall once
 * it's bought.
 */
const BroomProductTile: React.FC = () => {
  const add = useAddToCart();
  const gameState = useShopState();
  const line: CartLine = { kind: "broom", price: BROOM_COST };
  const inCart = useCartCount(line);

  if (gameState.broomOwned) {
    return null;
  }

  return (
    <ProductTile
      name={BROOM_NAME}
      icon={<BroomIcon />}
      price={BROOM_COST}
      info="A push broom with a dustpan. Sweeps sawdust off the floor; empty the pan at the garbage can."
      inCart={inCart}
      onAdd={() => add(line)}
      tutorialTarget="store-tool-broom"
    />
  );
};

const UpgradeProductTile: React.FC<{ upgrade: UpgradeType }> = ({
  upgrade,
}) => {
  const add = useAddToCart();
  const gameState = useShopState();

  const numberOwned =
    gameState.storage.upgrades.filter((id) => id === upgrade.id).length +
    gameState.machines.reduce(
      (sum, machine) =>
        sum + (machine.upgrades ?? []).filter((id) => id === upgrade.id).length,
      0,
    );
  const line: CartLine = {
    kind: "upgrade",
    upgradeId: upgrade.id as UpgradeId,
    price: upgrade.cost,
  };
  const inCart = useCartCount(line);

  return (
    <ProductTile
      name={upgrade.name}
      icon={<UpgradeIcon upgradeId={upgrade.id as UpgradeId} />}
      price={upgrade.cost}
      info={`${upgrade.description} Installs into a worktable's upgrade slot.`}
      owned={numberOwned > 0 ? `${numberOwned} owned` : undefined}
      inCart={inCart}
      onAdd={() => add(line)}
    />
  );
};

/**
 * The shop vac isn't a tool-slot tool — it's a canister you drag around
 * the shop floor. A one-time purchase, so the tile leaves the wall once
 * it's bought.
 */
const ShopVacProductTile: React.FC = () => {
  const add = useAddToCart();
  const gameState = useShopState();
  const line: CartLine = { kind: "shopVac", price: SHOP_VAC_COST };
  const inCart = useCartCount(line);

  if (gameState.shopVac !== null) {
    return null;
  }

  return (
    <ProductTile
      name={SHOP_VAC_NAME}
      icon={<ShopVacIcon />}
      price={SHOP_VAC_COST}
      info="A canister vacuum on casters. Clears sawdust from the floor, including under machines. Drag it with you and empty it at the garbage can."
      inCart={inCart}
      onAdd={() => add(line)}
    />
  );
};

const ToolProductTile: React.FC<{ tool: ToolType }> = ({ tool }) => {
  const add = useAddToCart();
  const gameState = useShopState();

  const numberOwned = ownedToolIds(gameState).filter(
    (id) => id === tool.id,
  ).length;
  // A tool is bought as the object it is, same as a board — the cart
  // stamps each one its own id on the way in (see addToCart).
  const line: CartLine = {
    kind: "material",
    material: makeToolItem(tool.id as ToolId),
    price: tool.cost,
  };
  const inCart = useCartCount(line);

  return (
    <ProductTile
      name={tool.name}
      icon={<ToolIcon toolId={tool.id as ToolId} />}
      price={tool.cost}
      info={`${tool.description} Rides home in the truck's bed; carry it to a workstation and hang it on a bench's rail, or fit it in a machine's accessory slot.`}
      owned={numberOwned > 0 ? `${numberOwned} owned` : undefined}
      inCart={inCart}
      onAdd={() => add(line)}
      tutorialTarget={`store-tool-${tool.id}`}
    />
  );
};
