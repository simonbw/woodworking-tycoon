import React from "react";
import { Machine } from "../../../game/GameState";
import { MachineOperation } from "../../../game/MachineType";
import { useActionKeys } from "../../consumerCountContext";
import { useGameActions } from "../../useGameActions";
import { useGameHelpers } from "../../useGameHelpers";
import { useGameState } from "../../useGameState";
import { useKeyDown } from "../../useKeyDown";

export const MachineListSection: React.FC = () => {
  const { gameState } = useGameState();
  const { getCellMap } = useGameHelpers();

  const cells = getCellMap();

  const [px, py] = gameState.player.position;
  const playerCell = cells[py][px];

  if (playerCell.operableMachines.length === 0) {
    return null;
  }

  return (
    <section>
      <ul className="">
        {playerCell.operableMachines.map((machine) => (
          <MachineListItem
            key={machine.type.name + machine.position.join(",")}
            machine={machine}
          />
        ))}
      </ul>
    </section>
  );
};
const MachineListItem: React.FC<{ machine: Machine }> = ({ machine }) => {
  const { canPerformOperation } = useGameHelpers();
  const availableOperations = machine.type.operations.filter((operation) =>
    canPerformOperation(operation)
  );
  const unavailableOperations = machine.type.operations.filter(
    (operation) => !canPerformOperation(operation)
  );
  return (
    <li>
      <span className="font-heading">{machine.type.name}</span>
      <ul className="pl-1">
        {availableOperations.map((operation) => (
          <MachineListOperationItem key={operation.id} operation={operation} />
        ))}
        {unavailableOperations.map((operation) => (
          <li key={operation.id} className="opacity-60">
            {operation.name}
          </li>
        ))}
      </ul>
    </li>
  );
};
const MachineListOperationItem: React.FC<{ operation: MachineOperation }> = ({
  operation,
}) => {
  const { performOperation } = useGameActions();
  const actionKey = useActionKeys();

  useKeyDown((event) => {
    if (event.key === actionKey) {
      performOperation(operation);
    }
  });

  return (
    <li
      className="cursor-pointer hover:bg-white/10 rounded-sm px-1"
      onClick={() => performOperation(operation)}
    >
      [{actionKey}] {operation.name}
    </li>
  );
};