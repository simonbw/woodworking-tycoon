import React from "react";
import { availableOperations } from "../game/skill-helpers";
import { Hint } from "./shortcuts/Kbd";
import { useHelpOverlay } from "./shortcuts/ShortcutHelpOverlay";
import { useTargetedMachine } from "./TargetedMachineContext";
import { useGameState } from "./useGameState";

/**
 * The shop floor's keyboard legend, mirroring the layout editor's mode card.
 * Only lists what's actionable right now — the machine keys stay hidden until
 * the player is standing at a machine — so it reads as guidance rather than a
 * wall of reference text. The full list lives behind `?`.
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

  return (
    <section className="paper-card-ivory">
      <div className="flex items-baseline justify-between">
        <h2 className="font-condensed uppercase tracking-[0.25em] text-[0.65rem] text-ink-fade leading-none">
          Controls
        </h2>
        <button
          className="font-condensed uppercase tracking-[0.15em] text-[0.65rem] text-ink-blue hover:underline"
          onClick={help.open}
          data-sfx="none"
        >
          All shortcuts
        </button>
      </div>

      <ul className="mt-2 space-y-1 font-typewriter text-xs">
        <Hint keys={[["W"], ["A"], ["S"], ["D"], ["Arrows"]]}>Move</Hint>
        <Hint shortcut="pick-up" showShift={false}>
          Pick up
        </Hint>
        {holding && (
          <Hint shortcut="put-down" showShift={false}>
            Put down
          </Hint>
        )}
        {operable && (
          <>
            <Hint shortcut="operate-machine">Operate {machine!.type.name}</Hint>
            <Hint shortcut="cycle-operation" showShift={false} />
          </>
        )}
        {machines.length > 1 && <Hint shortcut="cycle-machine" />}
      </ul>
    </section>
  );
};
