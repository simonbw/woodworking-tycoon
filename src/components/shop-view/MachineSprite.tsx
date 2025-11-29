import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { MACHINE_TYPES, Machine } from "../../game/Machine";
import { colors } from "../../utils/colors";
import { useTexture } from "../../utils/useTexture";
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
      <LocalMachineSprite {...machine} />

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

const LocalMachineSprite: React.FC<Machine> = (machine) => {
  const { inputMaterials, processingMaterials, outputMaterials } = machine;
  const workspaceTexture = useTexture("/images/workspace.png");
  const makeshiftBenchTexture = useTexture("/images/makeshift-bench.png");

  switch (machine.type.id) {
    case MACHINE_TYPES.jobsiteTableSaw.id:
      return <JobsiteTableSawSprite {...machine} />;

    case MACHINE_TYPES.miterSaw.id:
      return <MiterSawSprite {...machine} />;

    case MACHINE_TYPES.lunchboxPlaner.id:
      return <LunchboxPlanerSprite {...machine} />;

    case MACHINE_TYPES.garbageCan.id:
      return <GarbageCanSprite {...machine} />;

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
              <MaterialSprite material={material} key={index} alpha={0.6} tint={0xFFB366} />
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
              <MaterialSprite material={material} key={index} alpha={0.6} tint={0xFFB366} />
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
              <MaterialSprite material={material} key={index} alpha={0.6} tint={0xFFB366} />
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

const GarbageCanSprite: React.FC<Machine> = (machine) => {
  const { inputMaterials, processingMaterials, outputMaterials } = machine;

  return (
    <pixiContainer>
      <pixiGraphics
        draw={useCallback((g: Graphics) => {
          g.clear();
          const size = PIXELS_PER_CELL * 0.6;
          const halfSize = size / 2;

          // Draw garbage can body (trapezoid shape)
          g.moveTo(-halfSize * 0.8, -halfSize);
          g.lineTo(halfSize * 0.8, -halfSize);
          g.lineTo(halfSize, halfSize);
          g.lineTo(-halfSize, halfSize);
          g.lineTo(-halfSize * 0.8, -halfSize);
          g.fill({ color: 0x4a5568 }); // Gray color

          // Draw lid
          g.rect(-halfSize * 0.9, -halfSize * 1.1, size * 0.9, size * 0.15);
          g.fill({ color: 0x2d3748 }); // Darker gray

          // Draw handle on lid
          g.circle(0, -halfSize * 1.1, size * 0.08);
          g.fill({ color: 0x1a202c }); // Very dark gray
        }, [])}
      />
      {inputMaterials.map((material, index) => (
        <pixiContainer y={-PIXELS_PER_CELL * 0.3} angle={index * 10} key={`in-${index}`}>
          <MaterialSprite material={material} key={index} alpha={0.7} />
        </pixiContainer>
      ))}
      {processingMaterials.map((material, index) => (
        <pixiContainer y={PIXELS_PER_CELL * 0.1} angle={index * 10} key={`proc-${index}`}>
          <MaterialSprite material={material} key={index} alpha={0.3} tint={0xFF6666} />
        </pixiContainer>
      ))}
    </pixiContainer>
  );
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
