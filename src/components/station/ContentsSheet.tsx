import React from "react";
import { takeInputsFromMachineAction } from "../../game/game-actions/player-actions";
import { Machine } from "../../game/Machine";
import { handSpaceLeft } from "../../game/Person";
import { machineCanOperate, shopSupply } from "../../game/machine-helpers";
import { getMaterialFullName } from "../../game/material-helpers";
import { groupBy } from "../../utils/arrayUtils";
import { MaterialLabel } from "../MaterialLabel";
import { useApplyGameAction, useGameState } from "../useGameState";
import {
  MachineManualLink,
  MaterialShelf,
  ToolRack,
  UpgradeRack,
} from "./racks";
import { RunHint } from "./RunHint";

/**
 * Stations that hold rather than make (the sales table, the garbage can):
 * what's in them, and the only way to take any of it back out. A
 * container is opened, not reached into — stock goes in with F on the
 * floor and comes out through this list. Nothing a container swallows is
 * gone until you act on it, and the garbage can's Empty is the only thing
 * in the shop that destroys stock, which is why it's a held key on the
 * floor rather than a button here.
 */
export const ContentsSheet: React.FC<{ machine: Machine }> = ({ machine }) => {
  const applyAction = useApplyGameAction();
  const gameState = useGameState();
  const handSpace = handSpaceLeft(gameState.player);

  const groupedContents = [
    ...groupBy(machine.inputMaterials, (material) =>
      getMaterialFullName(material),
    ).entries(),
  ].sort(([a], [b]) => a.localeCompare(b));

  const capacity = machine.type.inputSpaces;

  return (
    <>
      {capacity > 0 && (
        <div className="font-condensed uppercase tracking-[0.15em] text-[0.65rem] text-ink-fade">
          Contents · {machine.inputMaterials.length}/{capacity}
        </div>
      )}
      <ul className="divide-y divide-ink-black/15 text-sm">
        {groupedContents.map(([materialName, materials]) => (
          <li key={materialName} className="flex items-center gap-2 py-1.5">
            <MaterialLabel material={materials[0]} />
            {materials.length > 1 && (
              <span className="text-ink-fade tabular-nums">
                ×{materials.length}
              </span>
            )}
            <button
              className="button-paper text-xs"
              disabled={handSpace === 0}
              title={handSpace === 0 ? "Hands full" : undefined}
              onClick={(event) => {
                if (handSpace === 0) {
                  return;
                }
                applyAction(
                  takeInputsFromMachineAction(
                    event.shiftKey
                      ? materials.slice(0, handSpace)
                      : [materials[0]],
                    machine,
                  ),
                );
              }}
            >
              Take
            </button>
          </li>
        ))}
        {groupedContents.length === 0 && (
          <li className="py-1 italic text-ink-fade text-sm">Empty</li>
        )}
      </ul>
      {machine.operations.length > 0 && (
        <RunHint
          machine={machine}
          canOperate={machineCanOperate(machine, shopSupply(gameState))}
        />
      )}
      <ToolRack machine={machine} />
      <UpgradeRack machine={machine} />
      <MaterialShelf machine={machine} />
      <MachineManualLink machine={machine} />
    </>
  );
};
