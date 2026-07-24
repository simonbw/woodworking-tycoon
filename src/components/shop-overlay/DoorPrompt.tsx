import React, { useContext } from "react";
import {
  canLeaveShop,
  goToStoreAction,
} from "../../game/game-actions/door-actions";
import { startScavengingAction } from "../../game/game-actions/scavenge-actions";
import { GameAction } from "../../game/GameState";
import { MACHINE_TYPES } from "../../game/Machine";
import { isAtShopDoor } from "../../game/ShopInfo";
import { resolveInteract } from "../../game/interact";
import { ShortcutId } from "../../game/shortcuts";
import { PIXELS_PER_CELL } from "../shop-view/shop-scale";
import { HintSurfaceContext, Kbd, ShortcutKeys } from "../shortcuts/Kbd";
import { useShortcut } from "../shortcuts/ShortcutProvider";
import { useTargetedMachine } from "../TargetedMachineContext";
import { Tooltip } from "../Tooltip";
import { useApplyGameAction, useGameState } from "../useGameState";
import { OverlayScaleContext } from "./ShopOverlayLayer";

const DOOR_OPTION_SHORTCUTS: readonly ShortcutId[] = [
  "door-option-1",
  "door-option-2",
  "door-option-3",
];

/**
 * The garage door: standing at (or beside) the entrance it offers a
 * small "[E] head out" chip, and the keypress spreads open the
 * destination card — each unlocked destination on a numbered row, the
 * row numbers being the keys. The digits only mean "head out" while the
 * card is open; everywhere else 1/2/3 set the game speed.
 */
export const DoorPrompt: React.FC<{
  canvasWidth: number;
  canvasHeight: number;
}> = ({ canvasWidth, canvasHeight }) => {
  const gameState = useGameState();
  const applyAction = useApplyGameAction();
  const { machine: targetedMachine, doorOpen, closeDoor } =
    useTargetedMachine();
  const scale = useContext(OverlayScaleContext);

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

  // The digits answer to the rows the open card shows: 1 is always the
  // first listed destination. Registered unconditionally (hooks),
  // enabled per row while the card is open.
  for (const [index, shortcutId] of DOOR_OPTION_SHORTCUTS.entries()) {
    const destination = destinations[index];
    // eslint-disable-next-line react-hooks/rules-of-hooks -- fixed-length list
    useShortcut(
      shortcutId,
      () => destination && applyAction(destination.action()),
      doorOpen && handsFree && destination != null,
    );
  }

  if (!atDoor || destinations.length === 0) {
    return null;
  }

  const [doorX, doorY] = gameState.shopInfo.entrancePosition;
  const cellPx = PIXELS_PER_CELL * scale;
  const centerX = (doorX + 0.5) * cellPx;

  // Closed: just the chip, the same weight as every other hint — and
  // only when E would actually open the door (something else in reach
  // may claim the key first).
  if (!doorOpen) {
    const interact = resolveInteract(gameState, targetedMachine);
    if (interact?.kind !== "open-door") {
      return null;
    }
    return (
      <div
        className="absolute z-10"
        style={{
          left: Math.min(Math.max(centerX, 70), canvasWidth - 70),
          top: doorY * cellPx - 4,
          transform: "translate(-50%, -100%)",
        }}
      >
        <HintSurfaceContext.Provider value="chrome">
          <ul className="flex flex-col items-center gap-0.5 rounded bg-ink-black/70 px-2 py-1 text-center font-condensed text-[0.65rem] uppercase tracking-[0.1em] text-paper-manila/90 whitespace-nowrap">
            <li className="text-paper-manila/60">Garage door</li>
            <li>
              <ShortcutKeys shortcut="pick-up" /> head out
            </li>
          </ul>
        </HintSurfaceContext.Provider>
      </div>
    );
  }

  const halfCard = 168;
  const left = Math.min(
    Math.max(centerX, Math.min(halfCard, canvasWidth / 2)),
    Math.max(canvasWidth - halfCard, canvasWidth / 2),
  );
  const roomAbove = doorY * cellPx;
  const above = roomAbove >= canvasHeight - (doorY + 1) * cellPx;

  return (
    <div
      className="absolute z-20 w-[336px] pointer-events-auto"
      style={{
        left,
        top: above ? doorY * cellPx - 8 : (doorY + 1) * cellPx + 8,
        transform: above ? "translate(-50%, -100%)" : "translate(-50%, 0)",
      }}
    >
      <section className="paper-card space-y-2" data-testid="door-panel">
        <header className="flex items-baseline justify-between border-b-2 border-ink-black/40 pb-1">
          <h3 className="font-condensed font-bold text-lg uppercase tracking-wide">
            Garage Door
          </h3>
          <span className="flex items-center gap-3">
            <span className="font-condensed uppercase tracking-[0.2em] text-[0.65rem] text-ink-fade">
              Places to go
            </span>
            <Tooltip content="Stay in the shop" shortcut="close-sheet">
              <button
                className="button-paper text-xs leading-none"
                onClick={closeDoor}
                aria-label="Close door card"
              >
                ✕
              </button>
            </Tooltip>
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
