import { Container, Graphics, Sprite } from "@pixi/react";
import React, { useCallback } from "react";
import { Machine } from "../../game/GameState";
import { MACHINES, MachineType } from "../../game/MachineType";
import { scaleVec, translateVec } from "../../game/Vectors";
import { PixiGraphics } from "../../utils/PixiGraphics";
import { CELL_SIZE } from "./ShopView";
import { colors } from "../../utils/colors";

export const MachineSprite: React.FC<{ machinePlacement: Machine }> = ({
  machinePlacement,
}) => {
  const [x, y] = translateVec(
    scaleVec(machinePlacement.position, CELL_SIZE),
    [50, 50]
  );
  const angle = machinePlacement.rotation * -90;

  return (
    <Container x={x} y={y} angle={angle} anchor={{ x: 0.5, y: 0.5 }}>
      <LocalMachineSprite machineType={machinePlacement.type} />
      {machinePlacement.type.operationPosition && (
        <Sprite
          image={"/images/operator-position.png"}
          width={100}
          height={100}
          anchor={{ x: 0.5, y: 0.5 }}
          alpha={0.3}
          x={machinePlacement.type.operationPosition[0] * CELL_SIZE}
          y={machinePlacement.type.operationPosition[1] * CELL_SIZE}
        />
      )}
    </Container>
  );
};

const LocalMachineSprite: React.FC<{ machineType: MachineType }> = ({
  machineType,
}) => {
  switch (machineType.id) {
    case MACHINES.jobsiteTableSaw.id:
      return (
        <Sprite
          image={"/images/jobsite-table-saw.png"}
          width={100}
          height={100}
          anchor={{ x: 0.5, y: 0.5 }}
        />
      );

    case MACHINES.miterSaw.id:
      return (
        <Sprite
          image={"/images/miter-saw.png"}
          width={100}
          height={100}
          anchor={{ x: 0.5, y: 0.5 }}
        />
      );

    case MACHINES.workspace.id:
      return (
        <Sprite
          image={"/images/workspace.png"}
          width={100}
          height={100}
          anchor={{ x: 0.5, y: 0.5 }}
          alpha={0.3}
        />
      );

    default: {
      return <DefaultMachineSprite machineType={machineType} />;
    }
  }
};

const DefaultMachineSprite: React.FC<{ machineType: MachineType }> = ({
  machineType,
}) => {
  return (
    <Graphics
      draw={useCallback(
        (g: PixiGraphics) => {
          g.clear();
          for (const [x, y] of machineType.cellsOccupied) {
            g.beginFill(colors.brown["900"]);
            g.drawRect(
              (x - 0.5) * CELL_SIZE,
              (y - 0.5) * CELL_SIZE,
              CELL_SIZE,
              CELL_SIZE
            );
            g.endFill();
          }
        },
        [machineType]
      )}
    />
  );
};
