import { Container, Graphics, Sprite } from "@pixi/react";
import React, { useCallback } from "react";
import { Machine } from "../../game/Machine";
import { MACHINE_TYPES, MachineType } from "../../game/Machine";
import { PixiGraphics } from "../../utils/PixiGraphics";
import { colors } from "../../utils/colors";
import { MaterialSprite } from "../material-sprites/MaterialSprite";
import { CELL_SIZE, PIXELS_PER_INCH, cellCenter } from "./shop-scale";
import { MaterialInstance } from "../../game/Materials";
import { lerp } from "../../utils/mathUtils";

const IMAGE_PIXELS_PER_INCH = 8;
const IMAGE_SCALE = PIXELS_PER_INCH / IMAGE_PIXELS_PER_INCH;

export const MachineSprite: React.FC<{ machine: Machine }> = ({ machine }) => {
  const [x, y] = cellCenter(machine.position);
  const angle = machine.rotation * -90;

  return (
    <Container x={x} y={y} angle={angle} anchor={{ x: 0.5, y: 0.5 }}>
      <LocalMachineSprite
        machineType={machine.type}
        inputMaterials={machine.inputMaterials}
        outputMaterials={machine.outputMaterials}
      />

      {machine.type.operationPosition && (
        <Sprite
          image={"/images/operator-position.png"}
          scale={IMAGE_SCALE}
          anchor={{ x: 0.5, y: 0.5 }}
          alpha={0}
          x={machine.type.operationPosition[0] * CELL_SIZE}
          y={machine.type.operationPosition[1] * CELL_SIZE}
        />
      )}
    </Container>
  );
};

const LocalMachineSprite: React.FC<{
  machineType: MachineType;
  inputMaterials?: ReadonlyArray<MaterialInstance>;
  outputMaterials?: ReadonlyArray<MaterialInstance>;
}> = ({ machineType, inputMaterials = [], outputMaterials = [] }) => {
  switch (machineType.id) {
    case MACHINE_TYPES.jobsiteTableSaw.id:
      return (
        <Container>
          <Sprite
            image={"/images/jobsite-table-saw.png"}
            scale={IMAGE_SCALE * 0.8}
            anchor={{ x: 0.45, y: 0.5 }}
          />
          {inputMaterials.map((material, index) => (
            <Container angle={index * 10} key={`in-${index}`}>
              <MaterialSprite material={material} key={index} />
            </Container>
          ))}
          {outputMaterials.map((material, index) => (
            <Container angle={index * 10 + 5} key={`out-${index}`}>
              <MaterialSprite material={material} key={index} />
            </Container>
          ))}
        </Container>
      );

    case MACHINE_TYPES.miterSaw.id:
      return (
        <Container>
          <Sprite
            image={"/images/miter-saw.png"}
            scale={IMAGE_SCALE}
            anchor={{ x: 0.5, y: 0.5 }}
          />
          {inputMaterials.map((material, index) => (
            <Container angle={90} key={`in-${index}`}>
              <MaterialSprite material={material} key={index} />
            </Container>
          ))}
          {outputMaterials.map((material, index) => (
            <Container angle={90} key={`out-${index}`}>
              <MaterialSprite material={material} key={index} />
            </Container>
          ))}
        </Container>
      );

    case MACHINE_TYPES.lunchboxPlaner.id:
      return (
        <Container>
          <Sprite
            image={"/images/lunchbox-planer.png"}
            scale={IMAGE_SCALE}
            anchor={{ x: 0.5, y: 0.5 }}
          />
          {inputMaterials.map((material, index) => (
            <Container
              key={`in-${index}`}
              angle={0}
              x={lerp(
                -inputMaterials.length * PIXELS_PER_INCH,
                inputMaterials.length * PIXELS_PER_INCH,
                index / inputMaterials.length
              )}
              y={-10}
            >
              <MaterialSprite material={material} key={index} />
            </Container>
          ))}
          {outputMaterials.map((material, index) => (
            <Container
              key={`out-${index}`}
              angle={0}
              x={lerp(
                -outputMaterials.length * PIXELS_PER_INCH,
                outputMaterials.length * PIXELS_PER_INCH,
                index / outputMaterials.length
              )}
              y={-10}
            >
              <MaterialSprite material={material} key={index} />
            </Container>
          ))}
        </Container>
      );

    case MACHINE_TYPES.workspace.id:
      return (
        <Container>
          <Sprite
            image={"/images/workspace.png"}
            scale={IMAGE_SCALE}
            anchor={{ x: 0.5, y: 0.5 }}
            alpha={0.3}
          />
          {inputMaterials.map((material, index) => (
            <Container angle={index * 10} key={`in-${index}`}>
              <MaterialSprite material={material} key={index} />
            </Container>
          ))}
          {outputMaterials.map((material, index) => (
            <Container angle={index * 10 + 5} key={`out-${index}`}>
              <MaterialSprite material={material} key={index} />
            </Container>
          ))}
        </Container>
      );

    default: {
      return (
        <Container>
          <DefaultMachineSprite machineType={machineType} />
          {inputMaterials.map((material, index) => (
            <Container angle={index * 10} key={`in-${index}`}>
              <MaterialSprite material={material} key={index} />
            </Container>
          ))}
          {outputMaterials.map((material, index) => (
            <Container angle={index * 10 + 5} key={`out-${index}`}>
              <MaterialSprite material={material} key={index} />
            </Container>
          ))}
        </Container>
      );
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
