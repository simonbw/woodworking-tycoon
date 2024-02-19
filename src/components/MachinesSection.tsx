import React from "react";
import { Operation } from "../game/GameState";
import { useGameState } from "./useGameState";
import { useGameActions } from "./useGameActions";

export const MachinesSection: React.FC = () => {
  const { gameState } = useGameState();

  return (
    <section>
      <h2 className="section-heading">Machines</h2>
      <ul className="space-y-2">
        {gameState.machines.map((machinePlacement) => (
          <li key={machinePlacement.machine.name}>
            {machinePlacement.machine.name}
            <ul className="pl-4">
              {machinePlacement.machine.operations.map((operation, i) => (
                <OperationItem key={i} operation={operation} />
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
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
