import React from "react";
import { MaterialInstance } from "../game/Materials";
import { dropMaterialAction } from "../game/game-actions/player-actions";
import {
  dustpanFillFraction,
  putDownBroomAction,
} from "../game/game-actions/dust-actions";
import { toggleCarryShopVacAction } from "../game/game-actions/shop-vac-actions";
import { holdingBroom } from "../game/HeldTool";
import { HAND_CAPACITY } from "../game/Person";
import { canisterFillFraction, carryingShopVac } from "../game/ShopVac";
import { getMaterialFullName } from "../game/material-helpers";
import { Vector } from "../game/Vectors";
import { groupBy } from "../utils/arrayUtils";
import { MaterialIcon } from "./current-cell-info/MaterialIcon";
import { playerMotion } from "./shop-view/playerMotionStore";
import { ShiftHint } from "./shortcuts/Kbd";
import { Tooltip } from "./Tooltip";
import { useApplyGameAction, useGameState } from "./useGameState";

/**
 * The player's hands, worn as a HUD strip along the bottom of the screen.
 * One slot per kind of thing carried. Clicking a slot sets one of them
 * down where you stand; shift-click sets the whole group down — the same
 * verb F speaks from the keyboard, minus the machine staging. Hidden
 * while the hands are empty or the player is away: an empty strip is
 * just chrome.
 */
export const HandsStrip: React.FC = () => {
  const gameState = useGameState();

  const broomInHand = holdingBroom(gameState);
  const hoseInHand = carryingShopVac(gameState);
  if (
    gameState.player.away ||
    (gameState.player.inventory.length === 0 && !broomInHand && !hoseInHand)
  ) {
    return null;
  }

  const grouped = [
    ...groupBy(gameState.player.inventory, (material) =>
      getMaterialFullName(material),
    ).entries(),
  ].sort(([a], [b]) => a.localeCompare(b));

  return (
    <div
      data-testid="hands-strip"
      className="hud-chip flex max-w-3xl flex-wrap items-center justify-center gap-1.5 px-2 py-1.5"
    >
      <span className="px-1 font-condensed text-[0.65rem] uppercase tracking-[0.2em] text-paper-manila/60">
        In hand
        {gameState.player.inventory.length > 0 && (
          <span className="ml-1.5 tabular-nums">
            {gameState.player.inventory.length}/{HAND_CAPACITY}
          </span>
        )}
      </span>
      {broomInHand && <BroomSlot fill={dustpanFillFraction(gameState)} />}
      {hoseInHand && (
        <VacHoseSlot fill={canisterFillFraction(gameState.shopVac!)} />
      )}
      {grouped.map(([name, materials]) => (
        <HandSlot key={name} name={name} materials={materials} />
      ))}
    </div>
  );
};

/**
 * The vac hose's slot: shows the canister fill; clicking parks the vac
 * right here, same as V.
 */
const VacHoseSlot: React.FC<{ fill: number }> = ({ fill }) => {
  const applyAction = useApplyGameAction();

  return (
    <Tooltip content="Park the vac" shortcut="vac-toggle">
      <button
        className="flex items-center gap-1.5 rounded border border-workshop-edge bg-workshop-panel px-1.5 py-1 text-left hover:border-gold-dark"
        onClick={() => applyAction(toggleCarryShopVacAction())}
      >
        <span className="font-condensed text-sm leading-tight text-paper-manila">
          Vac hose
        </span>
        <span className="font-ink text-sm leading-none text-gold-light tabular-nums">
          {Math.round(fill * 100)}%
        </span>
      </button>
    </Tooltip>
  );
};

/**
 * The broom's slot: a tool, not a material, so it gets its own chip.
 * Shows the dustpan fill; clicking it leans the broom right here, same
 * as F.
 */
const BroomSlot: React.FC<{ fill: number }> = ({ fill }) => {
  const applyAction = useApplyGameAction();

  return (
    <Tooltip content="Set down" shortcut="put-down">
      <button
        className="flex items-center gap-1.5 rounded border border-workshop-edge bg-workshop-panel px-1.5 py-1 text-left hover:border-gold-dark"
        onClick={() => applyAction(putDownBroomAction())}
      >
        <span className="font-condensed text-sm leading-tight text-paper-manila">
          Broom
        </span>
        <span className="font-ink text-sm leading-none text-gold-light tabular-nums">
          {Math.round(fill * 100)}%
        </span>
      </button>
    </Tooltip>
  );
};

const HandSlot: React.FC<{
  name: string;
  materials: MaterialInstance[];
}> = ({ name, materials }) => {
  const applyAction = useApplyGameAction();

  return (
    <Tooltip
      content={<ShiftHint verb="Set down" plural={materials.length > 1} />}
      shortcut="put-down"
    >
      <button
        className="flex items-center gap-1.5 rounded border border-workshop-edge bg-workshop-panel px-1.5 py-1 text-left hover:border-gold-dark"
        onClick={(event) => {
          // Same landing point as the F key: the body's actual position
          const at: Vector = [...playerMotion.pos];
          if (event.shiftKey) {
            applyAction(dropMaterialAction(materials, at));
          } else {
            applyAction(dropMaterialAction([materials[0]], at));
          }
        }}
      >
        <MaterialIcon material={materials[0]} size="small" />
        <span className="font-condensed text-sm leading-tight text-paper-manila">
          {name}
        </span>
        {materials.length > 1 && (
          <span className="font-ink text-lg leading-none text-gold-light">
            ×{materials.length}
          </span>
        )}
      </button>
    </Tooltip>
  );
};
