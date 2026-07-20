import React from "react";
import { buyToolAction } from "../../game/game-actions/tool-actions";
import { TOOL_TYPES, ToolId, ToolType } from "../../game/Tool";
import { useApplyGameAction, useGameState } from "../useGameState";

export const StoreToolsSection: React.FC = () => {
  return (
    <section>
      <h2 className="aisle-heading">Tool Wall</h2>
      <ul className="space-y-2">
        {Object.values(TOOL_TYPES)
          // Shop-made jigs aren't for sale — you build those
          .filter((tool) => !tool.craftedOnly)
          .map((tool) => (
            <ToolProductCard key={tool.id} tool={tool} />
          ))}
      </ul>
      <p className="text-xs text-ink-fade font-typewriter mt-2">
        Handheld tools mount into a workstation's tool slots. Better tools do
        the same work faster.
      </p>
    </section>
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
