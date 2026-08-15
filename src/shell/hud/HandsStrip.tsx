import React from "react";
import { MaterialIcon } from "../../components/current-cell-info/MaterialIcon";
import { ShiftHint } from "../../components/shortcuts/Kbd";
import { Tooltip } from "../../components/Tooltip";
import { holdingBroom } from "../../game/HeldTool";
import { getMaterialFullName } from "../../game/material-helpers";
import { MaterialInstance } from "../../game/Materials";
import { HAND_CAPACITY } from "../../game/Person";
import { headingForDirection } from "../../game/player-motion";
import { canisterFillFraction, carryingShopVac } from "../../game/ShopVac";
import { Vector } from "../../game/Vectors";
import {
  dustpanFillFraction,
  putDownBroom,
  toggleCarryShopVac,
} from "../../sim/commands/cleaning-commands";
import { dropMaterial } from "../../sim/commands/pile-commands";
import { Player } from "../../sim/entities/Player";
import { groupBy } from "../../utils/arrayUtils";
import { useGame, useShopState } from "../useShell";

/**
 * The player's hands, worn as a HUD strip along the bottom of the screen.
 * One slot per kind of thing carried. Clicking a slot sets one of them
 * down where you stand; shift-click sets the whole group down — the same
 * verb F speaks from the keyboard, minus the machine staging. Hidden
 * while the hands are empty or the player is away: an empty strip is
 * just chrome.
 *
 * The engine-shell port of `src/components/HandsStrip.tsx`: same markup,
 * mutations through the command layer. Where the old strip read the
 * `playerMotion` store for the drop's landing point, this one reads the
 * Player entity — the continuous body lives on it now — at click time.
 */
export const HandsStrip: React.FC = () => {
  const gameState = useShopState();

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
  const game = useGame();

  return (
    <Tooltip content="Park the vac" shortcut="vac-toggle">
      <button
        className="flex items-center gap-1.5 rounded border border-workshop-edge bg-workshop-panel px-1.5 py-1 text-left hover:border-gold-dark"
        onClick={() => toggleCarryShopVac(game)}
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
  const game = useGame();

  return (
    <Tooltip content="Set down" shortcut="put-down">
      <button
        className="flex items-center gap-1.5 rounded border border-workshop-edge bg-workshop-panel px-1.5 py-1 text-left hover:border-gold-dark"
        onClick={() => putDownBroom(game)}
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
  const game = useGame();

  return (
    <Tooltip
      content={<ShiftHint verb="Set down" plural={materials.length > 1} />}
      shortcut="put-down"
    >
      <button
        className="flex items-center gap-1.5 rounded border border-workshop-edge bg-workshop-panel px-1.5 py-1 text-left hover:border-gold-dark"
        onClick={(event) => {
          // Same landing point and orientation as the F key: the body's
          // actual position, lying the way it was carried
          const player = game.entities.getSingleton(Player);
          const at: Vector = [...player.position];
          const rotation = headingForDirection(player.direction) + Math.PI / 2;
          if (event.shiftKey) {
            dropMaterial(game, materials, at, rotation);
          } else {
            dropMaterial(game, [materials[0]], at, rotation);
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
