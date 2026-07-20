import React from "react";
import { canSweepAt } from "../game/game-actions/dust-actions";
import { canVacuumAt } from "../game/game-actions/shop-vac-actions";
import { canisterFillFraction, carryingShopVac } from "../game/ShopVac";
import { availableOperations } from "../game/skill-helpers";
import { vectorEquals } from "../game/Vectors";
import { Hint, HintSurfaceContext } from "./shortcuts/Kbd";
import { useHelpOverlay } from "./shortcuts/ShortcutHelpOverlay";
import { useTargetedMachine } from "./TargetedMachineContext";
import { useGameState } from "./useGameState";

/**
 * The shop floor's keyboard legend, drawn straight on the dark background
 * under the shop view — no card. Only lists what's actionable right now —
 * the machine keys stay hidden until the player is standing at a machine —
 * so it reads as guidance rather than a wall of reference text. The full
 * list lives behind `?`.
 */
export const ActionBar: React.FC = () => {
  const gameState = useGameState();
  const { machine, machines } = useTargetedMachine();
  const help = useHelpOverlay();

  if (gameState.player.away) return null;

  const holding = gameState.player.inventory.length > 0;
  // Stations like the sales table hold materials but have nothing to run, so
  // offering Operate / Next operation there would be a lie.
  const operable =
    machine != null &&
    availableOperations(machine, gameState.progression).length > 0;
  const draggingVac = carryingShopVac(gameState);
  const standingOnVac =
    gameState.shopVac?.position != null &&
    vectorEquals(gameState.shopVac.position, gameState.player.position);

  return (
    <HintSurfaceContext.Provider value="chrome">
      <section className="text-paper-manila/90">
        <div className="flex items-baseline justify-between">
          <h2 className="font-condensed uppercase tracking-[0.25em] text-[0.65rem] text-paper-manila/50 leading-none">
            Controls
          </h2>
          <button
            className="font-condensed uppercase tracking-[0.15em] text-[0.65rem] text-paper-manila/50 hover:text-paper-manila"
            onClick={help.open}
            data-sfx="none"
          >
            All shortcuts
          </button>
        </div>

        <ul className="mt-2 grid grid-cols-2 gap-x-8 gap-y-1 text-xs">
          <Hint keys={[["W"], ["A"], ["S"], ["D"]]}>Move</Hint>
          <Hint shortcut="pick-up" showShift={false}>
            Pick up
          </Hint>
          {holding && (
            <Hint shortcut="put-down" showShift={false}>
              Put down
            </Hint>
          )}
          {gameState.progression.sweepingUnlocked &&
            !draggingVac &&
            canSweepAt(gameState) && (
              <Hint shortcut="sweep">Sweep sawdust</Hint>
            )}
          {draggingVac && canVacuumAt(gameState) && (
            <Hint shortcut="sweep">Vacuum</Hint>
          )}
          {standingOnVac && <Hint shortcut="vac-toggle">Grab shop vac</Hint>}
          {draggingVac && (
            <>
              <Hint shortcut="vac-toggle">Set down vac</Hint>
              <li className="font-condensed text-paper-manila/60">
                Canister{" "}
                {Math.round(canisterFillFraction(gameState.shopVac!) * 100)}%
                {canisterFillFraction(gameState.shopVac!) >= 1 &&
                  " — empty it at the garbage can"}
              </li>
            </>
          )}
          {operable && (
            <>
              <Hint shortcut="operate-machine">
                Operate {machine!.type.name}
              </Hint>
              <Hint shortcut="cycle-operation" showShift={false} />
            </>
          )}
          {machines.length > 1 && <Hint shortcut="cycle-machine" />}
        </ul>
      </section>
    </HintSurfaceContext.Provider>
  );
};
