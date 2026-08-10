import React from "react";
import { CartLine } from "../../game/cart";
import { MACHINE_TYPES, MachineId, MachineType } from "../../game/Machine";
import { addToCartAction } from "../../game/game-actions/cart-actions";
import { MachineIcon } from "../ItemIcon";
import { useApplyGameAction, useGameState, useMachines } from "../useGameState";
import { AisleSection } from "./AisleSection";
import { ProductTile } from "./ProductTile";
import { useCartCount } from "./useStoreTrip";

export const StoreMachinesSection: React.FC<{ className?: string }> = ({
  className,
}) => {
  // Worktables aren't sold — you build them at a bench (see the
  // build-worktable recipes in benchOperations.ts). Neither is the
  // garbage can: every shop opens with one already on the floor (see
  // initialGameState), so a shelf tag for it sold nothing.
  // Prices come from MACHINE_TYPES.cost — the one price the store, the
  // resale market, and the playthrough ledger all agree on.
  const machinesToSell: MachineType[] = [
    MACHINE_TYPES.miterSaw,
    MACHINE_TYPES.jobsiteTableSaw,
    MACHINE_TYPES.lunchboxPlaner,
    MACHINE_TYPES.jointer,
    MACHINE_TYPES.bandSaw,
    // Last on the shelf: the cheapest thing here and the least like a
    // machine, but it's where a full sheet gets broken down
    MACHINE_TYPES.sawhorses,
  ];
  return (
    // Three to a row whatever the window. The photo is capped by its
    // height, not the tile's width, so a third of the shelf is still
    // wide enough to run it full size — and five machines land in two
    // rows instead of three, which is a whole row of height back.
    <AisleSection
      title="Machines"
      template="repeat(3, minmax(0, 1fr))"
      className={className}
    >
      {machinesToSell.map((machine) => (
        <MachineProductTile key={machine.id} machine={machine} />
      ))}
    </AisleSection>
  );
};

const MachineProductTile: React.FC<{ machine: MachineType }> = ({
  machine,
}) => {
  const price = machine.cost;
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
  const line: CartLine = {
    kind: "machine",
    machineTypeId: machine.id as MachineId,
    price,
  };
  const inCart = useCartCount(line);

  return (
    <ProductTile
      name={machine.name}
      // A machine is the biggest thing on any shelf here, and its photo
      // is the only way to tell a planer from a jointer at a glance
      icon={
        <MachineIcon
          machineId={machine.id as MachineId}
          className="w-full max-h-40"
        />
      }
      price={price}
      info={`${machine.description} Rides home crated in the truck's bed.`}
      owned={numberOwned > 0 ? `${numberOwned} owned` : undefined}
      inCart={inCart}
      onAdd={() => applyAction(addToCartAction(line))}
    />
  );
};
