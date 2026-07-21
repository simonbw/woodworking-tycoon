import React from "react";
import { MACHINE_TYPES, MachineId, MachineType } from "../../game/Machine";
import { useApplyGameAction, useGameState, useMachines } from "../useGameState";
import { buyMachineAction } from "../../game/game-actions/store-actions";

interface MachineSaleInfo {
  machine: MachineType;
  price: number;
}

export const StoreMachinesSection: React.FC = () => {
  // Worktables aren't sold — you build them at a bench (see the
  // build-worktable recipes in benchOperations.ts)
  const machinesToSell: MachineSaleInfo[] = [
    { machine: MACHINE_TYPES.garbageCan, price: 0 },
    { machine: MACHINE_TYPES.jobsiteTableSaw, price: 200 },
    { machine: MACHINE_TYPES.miterSaw, price: 200 },
    { machine: MACHINE_TYPES.lunchboxPlaner, price: 450 },
    { machine: MACHINE_TYPES.jointer, price: 600 },
  ];
  return (
    <section>
      <h2 className="aisle-heading">Machines</h2>
      <ul className="space-y-2">
        {machinesToSell.map((info) => (
          <MachineProductCard key={info.machine.id} {...info} />
        ))}
      </ul>
    </section>
  );
};

const MachineProductCard: React.FC<MachineSaleInfo> = ({ machine, price }) => {
  const applyAction = useApplyGameAction();
  const gameState = useGameState();
  const machines = useMachines();

  const numberOwned =
    machines.filter((m) => m.type.id === machine.id).length +
    gameState.storage.machines.filter((id) => id === machine.id).length;

  const canAfford = gameState.money >= price;

  return (
    <li className="product-card flex items-center gap-3">
      <div className="grow">
        <div className="font-condensed font-bold text-base uppercase tracking-wide text-ink-black">
          {machine.name}
        </div>
        <div className="text-xs text-ink-fade">
          {numberOwned > 0 && (
            <span className="text-store-orange-dark font-semibold">
              {numberOwned} owned ·{" "}
            </span>
          )}
          In stock
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <PriceTag price={price} />
        <button
          className="bg-store-orange hover:bg-store-orange-dark disabled:bg-store-concrete-dark disabled:text-ink-fade text-white font-condensed font-bold uppercase tracking-widest text-xs px-3 py-1 rounded-sm shadow"
          disabled={!canAfford}
          data-sfx="ui-purchase"
          onClick={() => {
            applyAction(buyMachineAction(machine.id as MachineId, price));
          }}
        >
          Buy
        </button>
      </div>
    </li>
  );
};

const PriceTag: React.FC<{ price: number }> = ({ price }) => {
  if (price === 0) {
    return <span className="price-tag text-store-orange-dark">FREE</span>;
  }
  const dollars = Math.floor(price);
  const cents = Math.round((price - dollars) * 100)
    .toString()
    .padStart(2, "0");
  return (
    <span className="price-tag">
      ${dollars}
      <sup className="text-xs ml-0.5">{cents}</sup>
    </span>
  );
};
