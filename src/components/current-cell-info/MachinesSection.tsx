import React from "react";
import { useCellMap } from "../../game/CellMap";
import { Machine } from "../../game/Machine";
import {
  operateMachineAction,
  setMachineOperationAction,
  takeInputsFromMachineAction,
  takeOutputsFromMachineAction,
} from "../../game/game-actions/player-actions";
import { getMaterialName } from "../../game/material-helpers";
import { groupBy } from "../../utils/arrayUtils";
import { machineCanOperate } from "../useGameHelpers";
import { useApplyGameAction, useGameState } from "../useGameState";
import { MaterialIcon } from "./MaterialIcon";

export const MachinesSection: React.FC = () => {
  const gameState = useGameState();

  const cellMap = useCellMap();
  const playerCell = cellMap.at(gameState.player.position);

  if (!playerCell?.operableMachines.length) {
    return null;
  }

  return (
    <>
      {playerCell.operableMachines.map((machine) => (
        <MachineListItem
          key={machine.type.name + machine.position.join(",")}
          machine={machine}
        />
      ))}
    </>
  );
};

const MachineListItem: React.FC<{ machine: Machine }> = ({ machine }) => {
  const applyAction = useApplyGameAction();

  const inputMaterials = [
    ...groupBy(machine.inputMaterials, (material) =>
      getMaterialName(material)
    ).entries(),
  ].sort(([a], [b]) => a.localeCompare(b));

  const outputMaterials = [
    ...groupBy(machine.outputMaterials, (material) =>
      getMaterialName(material)
    ).entries(),
  ].sort(([a], [b]) => a.localeCompare(b));

  const canOperate = machineCanOperate(machine);

  return (
    <section className="space-y-1">
      <h3 className="section-heading">{machine.type.name}</h3>
      <select
        value={machine.selectedOperation.id}
        onChange={(event) =>
          applyAction(
            setMachineOperationAction(
              machine,
              machine.type.operations.find(
                (operation) => operation.id === event.target.value
              )!
            )
          )
        }
      >
        {machine.type.operations.map((operation) => (
          <option key={operation.id} value={operation.id}>
            {operation.name}
          </option>
        ))}
      </select>

      <div className="flex flex-wrap gap-2 items-center">
        {inputMaterials.map(([name, materials]) => (
          <span
            key={name}
            onClick={(event) => {
              if (event.shiftKey) {
                applyAction(takeInputsFromMachineAction(materials, machine));
              } else {
                applyAction(
                  takeInputsFromMachineAction([materials[0]], machine)
                );
              }
            }}
          >
            <MaterialIcon material={materials[0]} quantity={materials.length} />
          </span>
        ))}
        {inputMaterials.length === 0 && (
          <span className="text-zinc-500">No inputs</span>
        )}
        <span className="p-2">→</span>
        {outputMaterials.map(([name, materials]) => (
          <span
            key={name}
            onClick={(event) => {
              if (event.shiftKey) {
                applyAction(takeOutputsFromMachineAction(materials, machine));
              } else {
                applyAction(
                  takeOutputsFromMachineAction([materials[0]], machine)
                );
              }
            }}
          >
            <MaterialIcon material={materials[0]} quantity={materials.length} />
          </span>
        ))}
        {outputMaterials.length === 0 && (
          <span className="text-zinc-500">No outputs</span>
        )}
      </div>

      <button
        className="button"
        disabled={!canOperate}
        onClick={() => applyAction(operateMachineAction(machine))}
      >
        Operate
      </button>
    </section>
  );
};
