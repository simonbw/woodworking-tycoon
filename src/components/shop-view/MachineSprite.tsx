import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { MACHINE_TYPES, Machine } from "../../game/Machine";
import { colors } from "../../utils/colors";
import { useTexture } from "../../utils/useTexture";
import { GarbageCanSprite } from "../machine-sprites/GarbageCanSprite";
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
  const operatorPositionTexture = useTexture("/images/operator-position.png");

  return (
    <pixiContainer x={x} y={y} angle={angle} anchor={{ x: 0.5, y: 0.5 }}>
      <LocalMachineSprite machine={machine} />

      {machine.type.operationPosition && (
        <pixiSprite
          texture={operatorPositionTexture}
          scale={IMAGE_SCALE}
          anchor={{ x: 0.5, y: 0.5 }}
          alpha={0}
          x={machine.type.operationPosition[0] * PIXELS_PER_CELL}
          y={machine.type.operationPosition[1] * PIXELS_PER_CELL}
        />
      )}
    </pixiContainer>
  );
};

const LocalMachineSprite: React.FC<{ machine: Machine }> = ({ machine }) => {
  const { inputMaterials, processingMaterials, outputMaterials } = machine;
  const workspaceTexture = useTexture("/images/workspace.png");
  const makeshiftBenchTexture = useTexture("/images/makeshift-bench.png");

  switch (machine.type.id) {
    case MACHINE_TYPES.jobsiteTableSaw.id:
      return <JobsiteTableSawSprite machine={machine} />;

    case MACHINE_TYPES.miterSaw.id:
      return <MiterSawSprite machine={machine} />;

    case MACHINE_TYPES.lunchboxPlaner.id:
      return <LunchboxPlanerSprite machine={machine} />;

    case MACHINE_TYPES.garbageCan.id:
      return <GarbageCanSprite machine={machine} />;

    case MACHINE_TYPES.workspace.id:
      return (
        <pixiContainer>
          <pixiSprite
            texture={workspaceTexture}
            scale={IMAGE_SCALE}
            anchor={{ x: 0.5, y: 0.5 }}
            alpha={0.3}
          />
          {inputMaterials.map((material, index) => (
            <pixiContainer angle={index * 10} key={`in-${index}`}>
              <MaterialSprite material={material} key={index} />
            </pixiContainer>
          ))}
          {processingMaterials.map((material, index) => (
            <pixiContainer angle={index * 10 + 2.5} key={`proc-${index}`}>
              <MaterialSprite
                material={material}
                key={index}
                alpha={0.6}
                tint={0xffb366}
              />
            </pixiContainer>
          ))}
          {outputMaterials.map((material, index) => (
            <pixiContainer angle={index * 10 + 5} key={`out-${index}`}>
              <MaterialSprite material={material} key={index} />
            </pixiContainer>
          ))}
        </pixiContainer>
      );

    case MACHINE_TYPES.makeshiftBench.id:
      return (
        <pixiContainer>
          <pixiSprite
            texture={makeshiftBenchTexture}
            scale={IMAGE_SCALE}
            anchor={{ x: 0.5, y: 0.5 }}
          />
          {inputMaterials.map((material, index) => (
            <pixiContainer angle={index * 10} key={`in-${index}`}>
              <MaterialSprite material={material} key={index} />
            </pixiContainer>
          ))}
          {processingMaterials.map((material, index) => (
            <pixiContainer angle={index * 10 + 2.5} key={`proc-${index}`}>
              <MaterialSprite
                material={material}
                key={index}
                alpha={0.6}
                tint={0xffb366}
              />
            </pixiContainer>
          ))}
          {outputMaterials.map((material, index) => (
            <pixiContainer angle={index * 10 + 5} key={`out-${index}`}>
              <MaterialSprite material={material} key={index} />
            </pixiContainer>
          ))}
        </pixiContainer>
      );

    default: {
      return (
        <pixiContainer>
          <DefaultMachineSprite />
          {inputMaterials.map((material, index) => (
            <pixiContainer angle={index * 10} key={`in-${index}`}>
              <MaterialSprite material={material} key={index} />
            </pixiContainer>
          ))}
          {processingMaterials.map((material, index) => (
            <pixiContainer angle={index * 10 + 2.5} key={`proc-${index}`}>
              <MaterialSprite
                material={material}
                key={index}
                alpha={0.6}
                tint={0xffb366}
              />
            </pixiContainer>
          ))}
          {outputMaterials.map((material, index) => (
            <pixiContainer angle={index * 10 + 5} key={`out-${index}`}>
              <MaterialSprite material={material} key={index} />
            </pixiContainer>
          ))}
        </pixiContainer>
      );
    }
  }
};

const DefaultMachineSprite: React.FC = () => {
  return (
    <pixiGraphics
      draw={useCallback((g: Graphics) => {
        g.clear();
        const [x, y] = cellToPixelCenter([0, 0]);
        g.rect(x, y, PIXELS_PER_CELL, PIXELS_PER_CELL);
        g.fill(colors.brown["900"]);
      }, [])}
    />
  );
};
