import React from "react";
import { useCellMap } from "../../game/CellMap";
import { Machine } from "../../game/Machine";
import { takeOutputsFromMachineAction } from "../../game/game-actions/player-actions";
import { getMaterialName } from "../../game/material-helpers";
import { groupBy } from "../../utils/arrayUtils";
import { ShiftHint } from "../shortcuts/Kbd";
import { Tooltip } from "../Tooltip";
import { useApplyGameAction, useGameState } from "../useGameState";
import { MaterialIcon } from "./MaterialIcon";

/**
 * Finished stock waiting at the outfeed side of feed-through machines
 * (planer, jointer, table saw). Shown when the player stands on a cell some
 * machine's outfeed points at — the counterpart of the spec sheet, which
 * lives at the infeed and can't collect outputs on these machines.
 */
export const OutfeedSection: React.FC = () => {
  const gameState = useGameState();
  const cellMap = useCellMap();

  if (gameState.player.away) {
    return null;
  }

  const machines = (
    cellMap.at(gameState.player.position)?.outputMachines ?? []
  ).filter((machine) => machine.outputMaterials.length > 0);

  if (machines.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {machines.map((machine) => (
        <OutfeedCard
          key={machine.type.name + machine.position.join(",")}
          machine={machine}
        />
      ))}
    </div>
  );
};

const OutfeedCard: React.FC<{ machine: Machine }> = ({ machine }) => {
  const applyAction = useApplyGameAction();

  const groupedOutputs = [
    ...groupBy(machine.outputMaterials, (material) =>
      getMaterialName(material),
    ).entries(),
  ].sort(([a], [b]) => a.localeCompare(b));

  return (
    <section className="paper-card space-y-2">
      <header className="flex items-baseline justify-between border-b-2 border-ink-black/40 pb-1">
        <h3 className="font-condensed font-bold text-lg uppercase tracking-wide">
          {machine.type.name}
        </h3>
        <span className="font-condensed uppercase tracking-[0.2em] text-[0.65rem] text-ink-fade">
          Outfeed
        </span>
      </header>
      <ul className="divide-y divide-ink-black/15 text-sm">
        {groupedOutputs.map(([name, materials]) => (
          <li key={name} className="flex items-center gap-2 py-1.5">
            <MaterialIcon material={materials[0]} size="small" />
            <span className="grow">{name}</span>
            {materials.length > 1 && (
              <span className="font-ink text-lg leading-none text-ink-fade">
                ×{materials.length}
              </span>
            )}
            <Tooltip
              content={<ShiftHint verb="Take" plural={materials.length > 1} />}
              shortcut="pick-up"
            >
              <button
                className="button-paper text-xs whitespace-nowrap"
                onClick={(event) => {
                  if (event.shiftKey) {
                    applyAction(
                      takeOutputsFromMachineAction(materials, machine),
                    );
                  } else {
                    applyAction(
                      takeOutputsFromMachineAction([materials[0]], machine),
                    );
                  }
                }}
              >
                Take
              </button>
            </Tooltip>
          </li>
        ))}
      </ul>
      {machine.outputMaterials.length > 0 && (
        <div className="flex justify-end">
          <button
            className="button-paper text-xs"
            onClick={() =>
              applyAction(
                takeOutputsFromMachineAction(machine.outputMaterials, machine),
              )
            }
          >
            Take All ({machine.outputMaterials.length})
          </button>
        </div>
      )}
    </section>
  );
};
