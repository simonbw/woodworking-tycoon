import React from "react";
import { Machine } from "../../game/GameState";
import { MACHINES, MachineType } from "../../game/MachineType";
import { JobsiteTableSawSprite } from "../machine-sprites/JobsiteTableSawSprite";
import { MiterSawSprite } from "../machine-sprites/MiterSawSprite";
import { OperatorPositionSprite } from "./OperatorPositionSprite";
import { scaled } from "./ShopView";

export const MachineSprite: React.FC<{ machinePlacement: Machine }> = ({
  machinePlacement,
}) => {
  const [dx, dy] = machinePlacement.position;
  const angle = machinePlacement.rotation * -90;

  return (
    <g
      transform={`translate(${scaled(0.5)} ${scaled(0.5)}) translate(${scaled(
        dx
      )}, ${scaled(dy)}) rotate(${angle}) translate(${scaled(-0.5)} ${scaled(
        -0.5
      )})`}
    >
      <LocalMachineSprite machineType={machinePlacement.type} />
      {machinePlacement.type.operationPosition && (
        <OperatorPositionSprite
          position={machinePlacement.type.operationPosition}
        />
      )}
    </g>
  );
};

const MACHINE_OVERHANG = 1;

const LocalMachineSprite: React.FC<{ machineType: MachineType }> = ({
  machineType,
}) => {
  switch (machineType.id) {
    case MACHINES.jobsiteTableSaw.id:
      return <JobsiteTableSawSprite />;

    case MACHINES.miterSaw.id:
      return <MiterSawSprite />;

    case MACHINES.workspace.id:
      return (
        <rect
          x={5}
          y={5}
          width={90}
          height={90}
          className="stroke-[2] stroke-white/40 fill-white/10"
        />
      );

    default: {
      return machineType.cellsOccupied.map(([x, y]) => (
        <rect
          key={`${x}-${y}`}
          x={scaled(x) - MACHINE_OVERHANG}
          y={scaled(y) - MACHINE_OVERHANG}
          width={scaled(1) + MACHINE_OVERHANG * 2}
          height={scaled(1) + MACHINE_OVERHANG * 2}
          className={machineType.className ?? "fill-amber-600 drop-shadow"}
        />
      ));
    }
  }
};
