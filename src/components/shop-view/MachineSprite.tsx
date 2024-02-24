import React from "react";
import { Machine } from "../../game/GameState";
import { MACHINES, MachineType } from "../../game/MachineType";
import { JobsiteTableSawSprite } from "../machine-sprites/JobsiteTableSawSprite";
import { MiterSawSprite } from "../machine-sprites/MiterSawSprite";
import { OperatorPositionSprite } from "./OperatorPositionSprite";
import { CELL_SIZE, scaled } from "./ShopView";
import { scaleVec } from "../../game/Vectors";

export const MachineSprite: React.FC<{ machinePlacement: Machine }> = ({
  machinePlacement,
}) => {
  const [x, y] = scaleVec(machinePlacement.position, CELL_SIZE);
  const angle = machinePlacement.rotation * -90;

  return (
    <g
      transform={`translate(50 50) translate(${x}, ${y}) rotate(${angle}) translate(-50 -50)`}
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
          x={scaled(x)}
          y={scaled(y)}
          width={scaled(1)}
          height={scaled(1)}
          className={machineType.className ?? "fill-amber-600 drop-shadow"}
        />
      ));
    }
  }
};
