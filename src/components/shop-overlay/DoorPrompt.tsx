import React from "react";
import {
  canLeaveShop,
  goToStoreAction,
} from "../../game/game-actions/door-actions";
import { startScavengingAction } from "../../game/game-actions/scavenge-actions";
import { GameAction } from "../../game/GameState";
import { MACHINE_TYPES } from "../../game/Machine";
import { isAtShopDoor } from "../../game/ShopInfo";
import { ShortcutId } from "../../game/shortcuts";
import { PIXELS_PER_CELL } from "../shop-view/shop-scale";
import { HintSurfaceContext, Kbd } from "../shortcuts/Kbd";
import { useShortcut } from "../shortcuts/ShortcutProvider";
import { useTargetedMachine } from "../TargetedMachineContext";
import { Tooltip } from "../Tooltip";
import { useApplyGameAction, useGameState } from "../useGameState";

const DOOR_OPTION_SHORTCUTS: readonly ShortcutId[] = [
  "door-option-1",
  "door-option-2",
  "door-option-3",
];

/**
 * The garage door's prompt, pinned to the door while the player stands
 * at (or beside) the entrance cell — the door works like a machine whose
 * operations are the places you can go. Each unlocked destination gets a
 * numbered row; the row numbers are the keys (they only mean "head out"
 * while you're standing here — everywhere else 1/2/3 set the game
 * speed).
 *
 * When a machine placard is up on the same spot (an operator cell beside
 * the door), the door yields the space: it collapses to a slim strip
 * tucked under the canvas edge instead of a full card.
 */
export const DoorPrompt: React.FC<{
  canvasWidth: number;
  canvasHeight: number;
}> = ({ canvasWidth, canvasHeight }) => {
  const gameState = useGameState();
  const applyAction = useApplyGameAction();
  const { machine: targetedMachine } = useTargetedMachine();

  const { storeUnlocked, lumberyardUnlocked, marketplaceUnlocked } =
    gameState.progression;
  const carried = gameState.player.carriedMachine ?? null;
  const atDoor =
    !gameState.player.away &&
    isAtShopDoor(gameState.shopInfo, gameState.player.position);
  const handsFree = canLeaveShop(gameState);

  const destinations: Array<{
    name: string;
    description: string;
    action: () => GameAction;
  }> = [];
  if (storeUnlocked) {
    destinations.push({
      name: "Orange Box",
      description:
        "The big-box store: lumber, tools, machines, and supplies. Takes as long as you spend in the aisles.",
      action: () => goToStoreAction("orangeBox"),
    });
  }
  if (lumberyardUnlocked) {
    destinations.push({
      name: "Sawyer & Sons",
      description:
        "The hardwood lumberyard: rough and S2S stock, priced for people who mill their own. Takes as long as you spend in the racks.",
      action: () => goToStoreAction("lumberyard"),
    });
  }
  if (marketplaceUnlocked) {
    destinations.push({
      name: "Scavenge for pallets",
      description:
        "About a quarter-day poking around loading docks. Come back with 1-2 pallets in whatever shape you find them.",
      action: () => startScavengingAction(),
    });
  }

  // The digits answer to the rows shown: 1 is always the first listed
  // destination. Registered unconditionally (hooks), enabled per row.
  for (const [index, shortcutId] of DOOR_OPTION_SHORTCUTS.entries()) {
    const destination = destinations[index];
    // eslint-disable-next-line react-hooks/rules-of-hooks -- fixed-length list
    useShortcut(
      shortcutId,
      () => destination && applyAction(destination.action()),
      atDoor && handsFree && destination != null,
    );
  }

  if (!atDoor || destinations.length === 0) {
    return null;
  }

  // A machine placard on this spot outranks the door card — collapse to
  // the strip form under the canvas.
  if (targetedMachine != null && carried == null) {
    return (
      <div
        className="absolute z-20 pointer-events-auto"
        style={{
          left: canvasWidth / 2,
          top: canvasHeight + 4,
          transform: "translate(-50%, 0)",
        }}
      >
        <HintSurfaceContext.Provider value="chrome">
          <ul
            className="flex items-center gap-4 whitespace-nowrap rounded bg-ink-black/80 px-3 py-1 font-condensed text-[0.65rem] uppercase tracking-[0.1em] text-paper-manila/90"
            data-testid="door-panel"
          >
            <li className="text-paper-manila/60">Garage door:</li>
            {destinations.map((destination, index) => (
              <li
                key={destination.name}
                className="flex items-center gap-1.5"
              >
                <Kbd>{index + 1}</Kbd>
                <span>{destination.name}</span>
                <button
                  className="button-ghost px-1 py-0 text-[0.65rem]"
                  disabled={!handsFree}
                  onClick={() => applyAction(destination.action())}
                >
                  Go
                </button>
              </li>
            ))}
          </ul>
        </HintSurfaceContext.Provider>
      </div>
    );
  }

  const [doorX, doorY] = gameState.shopInfo.entrancePosition;
  const centerX = (doorX + 0.5) * PIXELS_PER_CELL;
  const halfCard = 168;
  const left = Math.min(
    Math.max(centerX, Math.min(halfCard, canvasWidth / 2)),
    Math.max(canvasWidth - halfCard, canvasWidth / 2),
  );
  const roomAbove = doorY * PIXELS_PER_CELL;
  const above = roomAbove >= canvasHeight - (doorY + 1) * PIXELS_PER_CELL;

  return (
    <div
      className="absolute z-20 w-[336px] pointer-events-auto"
      style={{
        left,
        top: above
          ? doorY * PIXELS_PER_CELL - 8
          : (doorY + 1) * PIXELS_PER_CELL + 8,
        transform: above ? "translate(-50%, -100%)" : "translate(-50%, 0)",
      }}
    >
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
          {destinations.map((destination, index) => (
            <li key={destination.name} className="flex items-center gap-3 py-2">
              <Kbd>{index + 1}</Kbd>
              <div className="grow">
                <div className="font-condensed font-semibold text-sm uppercase tracking-wide">
                  {destination.name}
                </div>
                <div className="text-xs text-ink-fade">
                  {destination.description}
                </div>
              </div>
              <Tooltip
                content={`Head out: ${destination.name}`}
                shortcut={DOOR_OPTION_SHORTCUTS[index]}
              >
                <button
                  className="button-paper text-xs whitespace-nowrap"
                  disabled={!handsFree}
                  onClick={() => applyAction(destination.action())}
                >
                  Go
                </button>
              </Tooltip>
            </li>
          ))}
        </ul>
        {carried && (
          <p className="font-condensed text-xs text-ink-fade">
            Set the {MACHINE_TYPES[carried.machineTypeId].name} down before
            heading out.
          </p>
        )}
      </section>
    </div>
  );
};
