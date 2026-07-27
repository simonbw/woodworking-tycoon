import React from "react";
import { MACHINE_TYPES, MachineId, MachineType } from "../../game/Machine";
import { buyMachineAction } from "../../game/game-actions/store-actions";
import { MachineIcon } from "../ItemIcon";
import { useApplyGameAction, useGameState, useMachines } from "../useGameState";
import { AisleSection } from "./AisleSection";
import { ProductTile } from "./ProductTile";

interface MachineSaleInfo {
  machine: MachineType;
  price: number;
}

export const StoreMachinesSection: React.FC<{ className?: string }> = ({
  className,
}) => {
  // Worktables aren't sold — you build them at a bench (see the
  // build-worktable recipes in benchOperations.ts). Neither is the
  // garbage can: every shop opens with one already on the floor (see
  // initialGameState), so a shelf tag for it sold nothing.
  const machinesToSell: MachineSaleInfo[] = [
    { machine: MACHINE_TYPES.jobsiteTableSaw, price: 200 },
    { machine: MACHINE_TYPES.miterSaw, price: 200 },
    { machine: MACHINE_TYPES.lunchboxPlaner, price: 450 },
    { machine: MACHINE_TYPES.jointer, price: 600 },
    { machine: MACHINE_TYPES.bandSaw, price: 700 },
  ];
  return (
    <AisleSection title="Machines" className={className}>
      {machinesToSell.map((info) => (
        <MachineProductTile key={info.machine.id} {...info} />
      ))}
    </AisleSection>
  );
};

const MachineProductTile: React.FC<MachineSaleInfo> = ({ machine, price }) => {
  const applyAction = useApplyGameAction();
  const gameState = useGameState();
  const machines = useMachines();

  // A machine you've bought but not unpacked still counts as owned —
  // it's in a crate by the door, or in your arms
  const numberOwned =
    machines.filter((m) => m.type.id === machine.id).length +
    gameState.machineCrates.filter(
      (crate) => crate.machine.machineTypeId === machine.id,
    ).length +
    (gameState.player.carriedMachine?.machineTypeId === machine.id ? 1 : 0);

  return (
    <ProductTile
      name={machine.name}
      // A machine is the biggest thing on any shelf here, and its photo
      // is the only way to tell a planer from a jointer at a glance
      icon={
        <MachineIcon
          machineId={machine.id as MachineId}
          className="size-16 shrink-0"
        />
      }
      price={price}
      info={`${machine.description} Delivered as a crate at the garage door.`}
      owned={numberOwned > 0 ? `${numberOwned} owned` : undefined}
      canAfford={gameState.money >= price}
      sfx="ui-purchase"
      onBuy={() => applyAction(buyMachineAction(machine.id as MachineId, price))}
    />
  );
};
