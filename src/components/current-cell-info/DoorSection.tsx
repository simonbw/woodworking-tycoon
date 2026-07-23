import React from "react";
import {
  canLeaveShop,
  goToStoreAction,
} from "../../game/game-actions/door-actions";
import { startScavengingAction } from "../../game/game-actions/scavenge-actions";
import { MACHINE_TYPES } from "../../game/Machine";
import { isAtShopDoor } from "../../game/ShopInfo";
import { ShortcutId } from "../../game/shortcuts";
import { useShortcut } from "../shortcuts/ShortcutProvider";
import { Tooltip } from "../Tooltip";
import { useApplyGameAction, useGameState } from "../useGameState";

/**
 * The garage door's panel, shown while the player stands at (or beside)
 * the entrance cell — the door works like a machine whose operations are
 * the places you can go. Each unlocked destination gets a row; more get
 * added as the world opens up.
 */
export const DoorSection: React.FC = () => {
  const gameState = useGameState();
  const applyAction = useApplyGameAction();

  const { storeUnlocked, lumberyardUnlocked, marketplaceUnlocked } =
    gameState.progression;
  const atDoor =
    !gameState.player.away &&
    isAtShopDoor(gameState.shopInfo, gameState.player.position);
  const anywhereToGo =
    storeUnlocked || lumberyardUnlocked || marketplaceUnlocked;
  const handsFree = canLeaveShop(gameState);
  const carried = gameState.player.carriedMachine ?? null;

  useShortcut(
    "go-to-store",
    () => applyAction(goToStoreAction("orangeBox")),
    atDoor && storeUnlocked && handsFree,
  );
  useShortcut(
    "go-to-lumberyard",
    () => applyAction(goToStoreAction("lumberyard")),
    atDoor && lumberyardUnlocked && handsFree,
  );
  useShortcut(
    "scavenge",
    () => applyAction(startScavengingAction()),
    atDoor && marketplaceUnlocked && handsFree,
  );

  if (!atDoor || !anywhereToGo) {
    return null;
  }

  return (
    <section className="paper-card space-y-2" data-testid="door-panel">
      <header className="flex items-baseline justify-between border-b-2 border-ink-black/40 pb-1">
        <h3 className="font-condensed font-bold text-lg uppercase tracking-wide">
          Garage Door
        </h3>
        <span className="font-condensed uppercase tracking-[0.2em] text-[0.65rem] text-ink-fade">
          Places to go
        </span>
      </header>
      <ul className="divide-y divide-ink-black/15">
        {storeUnlocked && (
          <Destination
            name="Orange Box"
            description="The big-box store: lumber, tools, machines, and supplies. Takes as long as you spend in the aisles."
            shortcut="go-to-store"
            enabled={handsFree}
            onGo={() => applyAction(goToStoreAction("orangeBox"))}
          />
        )}
        {lumberyardUnlocked && (
          <Destination
            name="Sawyer & Sons"
            description="The hardwood lumberyard: rough and S2S stock, priced for people who mill their own. Takes as long as you spend in the racks."
            shortcut="go-to-lumberyard"
            enabled={handsFree}
            onGo={() => applyAction(goToStoreAction("lumberyard"))}
          />
        )}
        {marketplaceUnlocked && (
          <Destination
            name="Scavenge for pallets"
            description="About a quarter-day poking around loading docks. Come back with 1-2 pallets in whatever shape you find them."
            shortcut="scavenge"
            enabled={handsFree}
            onGo={() => applyAction(startScavengingAction())}
          />
        )}
      </ul>
      {carried && (
        <p className="font-condensed text-xs text-ink-fade">
          Set the {MACHINE_TYPES[carried.machineTypeId].name} down before
          heading out.
        </p>
      )}
    </section>
  );
};

const Destination: React.FC<{
  name: string;
  description: string;
  shortcut: ShortcutId;
  enabled: boolean;
  onGo: () => void;
}> = ({ name, description, shortcut, enabled, onGo }) => (
  <li className="flex items-center gap-3 py-2">
    <div className="grow">
      <div className="font-condensed font-semibold text-sm uppercase tracking-wide">
        {name}
      </div>
      <div className="text-xs text-ink-fade">{description}</div>
    </div>
    <Tooltip content={`Head out: ${name}`} shortcut={shortcut}>
      <button
        className="button-paper text-xs whitespace-nowrap"
        disabled={!enabled}
        onClick={onGo}
      >
        Go
      </button>
    </Tooltip>
  </li>
);
