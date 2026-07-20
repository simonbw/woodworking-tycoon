import React from "react";
import { buyShopVacAction } from "../../game/game-actions/shop-vac-actions";
import { buyToolAction } from "../../game/game-actions/tool-actions";
import { SHOP_VAC_COST } from "../../game/ShopVac";
import { TOOL_TYPES, ToolId, ToolType } from "../../game/Tool";
import { useApplyGameAction, useGameState } from "../useGameState";

export const StoreToolsSection: React.FC = () => {
  const gameState = useGameState();
  return (
    <section>
      <h2 className="aisle-heading">Tool Wall</h2>
      <ul className="space-y-2">
        {Object.values(TOOL_TYPES)
          // Shop-made jigs aren't for sale — you build those. The dust
          // bag stays off the wall until sawdust is a revealed problem.
          .filter((tool) => !tool.craftedOnly)
          .filter(
            (tool) =>
              tool.id !== "dustBag" || gameState.progression.sweepingUnlocked,
          )
          .map((tool) => (
            <ToolProductCard key={tool.id} tool={tool} />
          ))}
        <ShopVacProductCard />
      </ul>
      <p className="text-xs text-ink-fade font-typewriter mt-2">
        Handheld tools mount into a workstation's tool slots. Better tools do
        the same work faster.
      </p>
    </section>
  );
};

/**
 * The shop vac isn't a tool-slot tool — it's a canister you drag around
 * the shop floor. Hidden until the sawdust tutorial has fired (nothing
 * cleaning-related exists before then), and it's a one-time purchase.
 */
const ShopVacProductCard: React.FC = () => {
  const applyAction = useApplyGameAction();
  const gameState = useGameState();

  if (!gameState.progression.sweepingUnlocked || gameState.shopVac !== null) {
    return null;
  }
  const canAfford = gameState.money >= SHOP_VAC_COST;

  return (
    <li className="product-card flex items-center gap-3">
      <div className="grow">
        <div className="font-condensed font-bold text-base uppercase tracking-wide text-ink-black">
          Shop Vac
        </div>
        <div className="text-xs text-ink-fade">
          A canister vac on casters. Cleans right down to the concrete — even
          under machines — but you'll be dragging it around and emptying it at
          the garbage can.
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="price-tag tabular-nums">
          ${SHOP_VAC_COST.toFixed(2)}
        </span>
        <button
          className="bg-store-orange hover:bg-store-orange-dark disabled:bg-store-concrete-dark disabled:text-ink-fade text-white font-condensed font-bold uppercase tracking-widest text-xs px-3 py-1 rounded-sm shadow"
          disabled={!canAfford}
          onClick={() => applyAction(buyShopVacAction())}
        >
          Buy
        </button>
      </div>
    </li>
  );
};

const ToolProductCard: React.FC<{ tool: ToolType }> = ({ tool }) => {
  const applyAction = useApplyGameAction();
  const gameState = useGameState();

  const numberOwned =
    gameState.storage.tools.filter((id) => id === tool.id).length +
    gameState.machines.reduce(
      (sum, machine) =>
        sum + machine.tools.filter((id) => id === tool.id).length,
      0,
    );

  const canAfford = gameState.money >= tool.cost;

  return (
    <li className="product-card flex items-center gap-3">
      <div className="grow">
        <div className="font-condensed font-bold text-base uppercase tracking-wide text-ink-black">
          {tool.name}
        </div>
        <div className="text-xs text-ink-fade">
          {numberOwned > 0 && (
            <span className="text-store-orange-dark font-semibold">
              {numberOwned} owned ·{" "}
            </span>
          )}
          {tool.description}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="price-tag tabular-nums">${tool.cost.toFixed(2)}</span>
        <button
          className="bg-store-orange hover:bg-store-orange-dark disabled:bg-store-concrete-dark disabled:text-ink-fade text-white font-condensed font-bold uppercase tracking-widest text-xs px-3 py-1 rounded-sm shadow"
          disabled={!canAfford}
          onClick={() => applyAction(buyToolAction(tool.id as ToolId))}
        >
          Buy
        </button>
      </div>
    </li>
  );
};
