import React from "react";
import { useCellMap } from "../../game/CellMap";
import { Machine } from "../../game/Machine";
import {
  operateMachineAction,
  setMachineOperationAction,
  takeInputsFromMachineAction,
  takeOutputsFromMachineAction,
} from "../../game/game-actions/player-actions";
import { machineCanOperate } from "../../game/machine-helpers";
import { getMaterialName } from "../../game/material-helpers";
import { groupBy } from "../../utils/arrayUtils";
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

  const processingMaterials = [
    ...groupBy(machine.processingMaterials, (material) =>
      getMaterialName(material)
    ).entries(),
  ].sort(([a], [b]) => a.localeCompare(b));

  const outputMaterials = [
    ...groupBy(machine.outputMaterials, (material) =>
      getMaterialName(material)
    ).entries(),
  ].sort(([a], [b]) => a.localeCompare(b));

  const canOperate = machineCanOperate(machine);
  const isOperating = machine.operationProgress.status === "inProgress";
  const progressPercent = isOperating
    ? ((machine.selectedOperation.duration - machine.operationProgress.ticksRemaining) / 
       machine.selectedOperation.duration) * 100
    : 0;

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
        
        {/* Show processing materials when operating */}
        {processingMaterials.length > 0 && (
          <>
            <span className="p-2">→</span>
            <span className="text-amber-600">[Processing:</span>
            {processingMaterials.map(([name, materials]) => (
              <span key={name} className="opacity-50">
                <MaterialIcon material={materials[0]} quantity={materials.length} />
              </span>
            ))}
            <span className="text-amber-600">]</span>
          </>
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

      {isOperating ? (
        <div className="space-y-1">
          <div className="text-sm text-zinc-400">
            Operating... ({machine.operationProgress.ticksRemaining} ticks remaining)
          </div>
          <div className="w-full bg-zinc-700 rounded-full h-2">
            <div
              className="bg-amber-600 h-2 rounded-full transition-all duration-200"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      ) : (
        <button
          className="button"
          disabled={!canOperate}
          onClick={() => applyAction(operateMachineAction(machine))}
        >
          Operate
        </button>
      )}
    </section>
  );
};
