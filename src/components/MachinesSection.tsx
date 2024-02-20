import React from "react";
import { MachineOperation } from "../game/MachineType";
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
          <li key={machinePlacement.type.name}>
            {machinePlacement.type.name}
            <ul className="pl-4 space-y-1">
              {machinePlacement.type.operations.map((operation, i) => (
                <OperationItem key={i} operation={operation} />
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
};

// const MachineStore: React.FC = () => {
//   const { canBuyMachine } = useGameHelpers();

//   return (
//     <ul className="space-y-2">
//       {objectValues(MACHINES).map((machine) => (
//         <li key={machine.id}>
//           <span>{machine.name}</span>
//           <span>${machine.cost.toFixed()}</span>
//           <button className="button" disabled={!canBuyMachine(machine)}>
//             Buy
//           </button>
//         </li>
//       ))}
//     </ul>
//   );
// };

const OperationItem: React.FC<{ operation: MachineOperation }> = ({
  operation,
}) => {
  const { doOperation } = useGameActions();
  const { canPerformOperation } = useGameHelpers();

  const hasMaterials = canPerformOperation(operation);

  return (
    <li className="flex gap-2">
      <button
        onClick={() => {
          doOperation(operation);
        }}
        className="button"
        disabled={!hasMaterials}
      >
        <span>{operation.name}</span>
      </button>
    </li>
  );
};
