import React from "react";
import { MACHINES, Operation } from "../game/GameState";
import { objectValues } from "../utils/arrayUtils";
import { useGameActions } from "./useGameActions";
import { useGameHelpers } from "./useGameHelpers";
import { useGameState } from "./useGameState";

export const MachinesSection: React.FC = () => {
  const { gameState } = useGameState();

  return (
    <section className="space-y-2">
      <h2 className="section-heading">Machines</h2>
      <ul className="space-y-2">
        {gameState.machines.map((machinePlacement) => (
          <li key={machinePlacement.machine.name}>
            {machinePlacement.machine.name}
            <ul className="pl-4 space-y-1">
              {machinePlacement.machine.operations.map((operation, i) => (
                <OperationItem key={i} operation={operation} />
              ))}
            </ul>
          </li>
        ))}
      </ul>

      <MachineStore />
    </section>
  );
};

const MachineStore: React.FC = () => {
  const { canBuyMachine } = useGameHelpers();

  return (
    <ul className="space-y-2">
      {objectValues(MACHINES).map((machine) => (
        <li key={machine.id}>
          <span>{machine.name}</span>
          <span>${machine.cost.toFixed()}</span>
          <button className="button" disabled={!canBuyMachine(machine)}>
            Buy
          </button>
        </li>
      ))}
    </ul>
  );
};

const OperationItem: React.FC<{ operation: Operation }> = ({ operation }) => {
  const { gameState } = useGameState();
  const { doOperation } = useGameActions();

  const hasMaterials = operation.recipe.inputMaterials.every((inputMaterial) =>
    gameState.materials.includes(inputMaterial)
  );

  return (
    <li className="flex gap-2">
      <button
        onClick={() => {
          doOperation(operation);
        }}
        className="button"
        disabled={!hasMaterials}
      >
        <span>{operation.recipe.name}</span>
      </button>
    </li>
  );
};
