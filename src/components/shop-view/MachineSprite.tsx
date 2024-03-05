import { Container, Graphics, Sprite } from "@pixi/react";
import React, { useCallback } from "react";
import { MACHINE_TYPES, Machine } from "../../game/Machine";
import { PixiGraphics } from "../../utils/PixiGraphics";
import { colors } from "../../utils/colors";
import { JobsiteTableSawSprite } from "../machine-sprites/JobsiteTableSawSprite";
import { LunchboxPlanerSprite } from "../machine-sprites/LunchboxPlanerSprite";
import { MiterSawSprite } from "../machine-sprites/MiterSawSprite";
import { MaterialSprite } from "../material-sprites/MaterialSprite";
import {
  PIXELS_PER_CELL,
  PIXELS_PER_INCH,
  cellToPixelCenter,
} from "./shop-scale";

const IMAGE_PIXELS_PER_INCH = 8;
export const IMAGE_SCALE = PIXELS_PER_INCH / IMAGE_PIXELS_PER_INCH;

export const MachineSprite: React.FC<{ machine: Machine }> = ({ machine }) => {
  const [x, y] = cellToPixelCenter(machine.position);
  const angle = machine.rotation * -90;

  return (
    <Container x={x} y={y} angle={angle} anchor={{ x: 0.5, y: 0.5 }}>
      <LocalMachineSprite {...machine} />

      {machine.type.operationPosition && (
        <Sprite
          image={"/images/operator-position.png"}
          scale={IMAGE_SCALE}
          anchor={{ x: 0.5, y: 0.5 }}
          alpha={0}
          x={machine.type.operationPosition[0] * PIXELS_PER_CELL}
          y={machine.type.operationPosition[1] * PIXELS_PER_CELL}
        />
      )}
    </Container>
  );
};

const LocalMachineSprite: React.FC<Machine> = (machine) => {
  const { inputMaterials, outputMaterials } = machine;
  switch (machine.type.id) {
    case MACHINE_TYPES.jobsiteTableSaw.id:
      return <JobsiteTableSawSprite {...machine} />;

    case MACHINE_TYPES.miterSaw.id:
      return <MiterSawSprite {...machine} />;

    case MACHINE_TYPES.lunchboxPlaner.id:
      return <LunchboxPlanerSprite {...machine} />;

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

    case MACHINE_TYPES.makeshiftBench.id:
      return (
        <Container>
          <Sprite
            image={"/images/makeshift-bench.png"}
            scale={IMAGE_SCALE}
            anchor={{ x: 0.5, y: 0.5 }}
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
          <DefaultMachineSprite />
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

const DefaultMachineSprite: React.FC = () => {
  return (
    <Graphics
      draw={useCallback((g: PixiGraphics) => {
        g.clear();
        g.beginFill(colors.brown["900"]);
        const [x, y] = cellToPixelCenter([0, 0]);
        g.drawRect(x, y, PIXELS_PER_CELL, PIXELS_PER_CELL);
        g.endFill();
      }, [])}
    />
  );
};
