import React from "react";
import { MACHINE_TYPES, MachineType } from "../../game/Machine";
import { useApplyGameAction, useGameState } from "../useGameState";
import { buyMachineAction } from "../../game/game-actions/store-actions";

interface MachineSaleInfo {
  machine: MachineType;
  price: number;
}

export const StoreMachinesSection: React.FC = () => {
  const machinesToSell: MachineSaleInfo[] = [
    { machine: MACHINE_TYPES.jobsiteTableSaw, price: 200 },
    { machine: MACHINE_TYPES.miterSaw, price: 200 },
    { machine: MACHINE_TYPES.makeshiftBench, price: 100 },
  ];
  return (
    <section>
      <h2 className="section-heading">Machines</h2>
      <ul className="space-y-2 mt-2">
        {machinesToSell.map((info) => (
          <MachineListItem key={info.machine.id} {...info} />
        ))}
      </ul>
    </section>
  );
};

const MachineListItem: React.FC<MachineSaleInfo> = ({ machine, price }) => {
  const applyAction = useApplyGameAction();
  const gameState = useGameState();

  const numberOwned =
    gameState.machines.filter((m) => m.type === machine).length +
    gameState.storage.machines.filter((m) => m === machine).length;

  return (
    <li className="flex gap-2 items-center">
      <span className="inline-flex flex-col">
        <span className="flex gap-4">
          <span>{machine.name}</span>
          <span>${price.toFixed(2)}</span>
        </span>
        <span className="text-zinc-500 text-sm">{numberOwned} owned</span>
      </span>
      <button
        className="button"
        onClick={() => {
          applyAction(buyMachineAction(machine, price));
        }}
      >
        Buy
      </button>
    </li>
  );
};
