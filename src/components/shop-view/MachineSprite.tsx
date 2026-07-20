import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { animated, useSpring } from "react-spring";
import { MACHINE_TYPES, Machine } from "../../game/Machine";
import { MaterialInstance } from "../../game/Materials";
import { playerAttendsMachine } from "../../game/machine-helpers";
import { getOperationPhases } from "../../game/skill-helpers";
import { colors } from "../../utils/colors";
import { useTexture } from "../../utils/useTexture";
import { useGameState } from "../useGameState";
import { GarbageCanSprite } from "../machine-sprites/GarbageCanSprite";
import { JobsiteTableSawSprite } from "../machine-sprites/JobsiteTableSawSprite";
import { JointerSprite } from "../machine-sprites/JointerSprite";
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

const MachineSelectionHighlight: React.FC<{
  machine: Machine;
}> = ({ machine }) => {
  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      // Draw highlight around the machine
      const cellSize = PIXELS_PER_CELL;
      const occupiedCells = machine.type.cellsOccupied;

      // Calculate bounding box
      const xs = occupiedCells.map(([x]) => x);
      const ys = occupiedCells.map(([, y]) => y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);

      const width = (maxX - minX + 1) * cellSize;
      const height = (maxY - minY + 1) * cellSize;
      const offsetX = ((minX + maxX) / 2) * cellSize;
      const offsetY = ((minY + maxY) / 2) * cellSize;

      // Yellow selection outline
      g.rect(
        offsetX - width / 2 - 4,
        offsetY - height / 2 - 4,
        width + 8,
        height + 8,
      );
      g.stroke({ width: 3, color: 0xfcd34d });
    },
    [machine.type.cellsOccupied],
  );

  return <pixiGraphics draw={draw} />;
};

export const MachineSprite: React.FC<{
  machine: Machine;
  isSelected?: boolean;
  onClick?: () => void;
}> = ({ machine, isSelected = false, onClick }) => {
  const [x, y] = cellToPixelCenter(machine.position);
  const angle = machine.rotation * -90;
  const operatorPositionTexture = useTexture("/images/operator-position.png");

  return (
    <pixiContainer
      x={x}
      y={y}
      angle={angle}
      anchor={{ x: 0.5, y: 0.5 }}
      eventMode={onClick ? "static" : "auto"}
      onClick={onClick}
      cursor={onClick ? "pointer" : "default"}
    >
      {/* Selection highlight */}
      {isSelected && <MachineSelectionHighlight machine={machine} />}

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

      {/* Counter-rotated so the badge reads upright at any machine rotation */}
      <pixiContainer angle={-angle}>
        <OperationStatusBadge machine={machine} />
      </pixiContainer>
    </pixiContainer>
  );
};

/**
 * Live status of a machine's current operation, shared by the floating
 * badge and the processing-material animation.
 */
function useMachineActivity(machine: Machine) {
  const gameState = useGameState();
  const progress = machine.operationProgress;
  const operation = machine.selectedOperationOrNull;

  const phases = operation
    ? getOperationPhases(operation, gameState.progression)
    : [];
  const attending = playerAttendsMachine(
    machine,
    gameState.player.position,
    gameState.player.away !== null,
  );

  const isOperating = progress.status === "inProgress" && phases.length > 0;
  // At a boundary (ticksRemaining 0) the phase that matters is the next one
  const relevantPhase = isOperating
    ? progress.ticksRemaining === 0
      ? phases[progress.phaseIndex + 1]
      : phases[Math.min(progress.phaseIndex, phases.length - 1)]
    : undefined;
  const needsYou =
    relevantPhase !== undefined && relevantPhase.attended && !attending;

  const total = phases.reduce((sum, phase) => sum + phase.duration, 0);
  const remaining = isOperating
    ? progress.ticksRemaining +
      phases
        .slice(progress.phaseIndex + 1)
        .reduce((sum, phase) => sum + phase.duration, 0)
    : 0;
  const fraction = total > 0 ? (total - remaining) / total : 0;

  return { isOperating, needsYou, fraction, relevantPhase };
}

/**
 * Floating status over a working machine: a progress bar (amber while an
 * attended phase needs you at the machine, green while a hands-free phase
 * runs on its own) or a pulsing amber pause marker when an attended phase
 * is waiting for the player to come back.
 */
const OperationStatusBadge: React.FC<{ machine: Machine }> = ({ machine }) => {
  const { isOperating, needsYou, fraction, relevantPhase } =
    useMachineActivity(machine);

  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      if (!isOperating || relevantPhase === undefined) {
        return;
      }
      const y = -PIXELS_PER_CELL * 0.68;
      if (needsYou) {
        // Amber pause marker: this machine is waiting for the player
        g.circle(0, y, 7);
        g.fill({ color: 0x1c1917, alpha: 0.75 });
        g.circle(0, y, 6);
        g.fill(0xf59e0b);
        for (const x of [-2.5, 1]) {
          g.rect(x, y - 3, 1.5, 6);
          g.fill(0x1c1917);
        }
        return;
      }
      // Progress bar: amber while attended handwork, green while hands-free
      const barWidth = PIXELS_PER_CELL * 0.7;
      g.rect(-barWidth / 2 - 1, y - 3, barWidth + 2, 6);
      g.fill({ color: 0x1c1917, alpha: 0.75 });
      g.rect(-barWidth / 2, y - 2, barWidth * fraction, 4);
      g.fill(relevantPhase.attended ? 0xf59e0b : 0x4ade80);
    },
    [isOperating, needsYou, fraction, relevantPhase],
  );

  return <pixiGraphics draw={draw} />;
};

const AnimatedPixiContainer = animated("pixiContainer");

/**
 * A material mid-operation, rendered exactly as it sat on the machine but
 * with a gentle rocking to show it's being worked on. The rocking pauses
 * while the machine is waiting for the player to come back.
 */
const ProcessingMaterialSprite: React.FC<{
  material: MaterialInstance;
  angle: number;
  working: boolean;
}> = ({ material, angle, working }) => {
  const { wobble } = useSpring({
    from: { wobble: -2 },
    to: { wobble: 2 },
    loop: { reverse: true },
    config: { duration: 400 },
    pause: !working,
  });

  return (
    <AnimatedPixiContainer angle={wobble.to((w) => angle + w)}>
      <MaterialSprite material={material} />
    </AnimatedPixiContainer>
  );
};

const MachineMaterials: React.FC<{ machine: Machine }> = ({ machine }) => {
  const { isOperating, needsYou } = useMachineActivity(machine);
  const working = isOperating && !needsYou;

  return (
    <>
      {machine.inputMaterials.map((material, index) => (
        <pixiContainer angle={index * 10} key={`in-${index}`}>
          <MaterialSprite material={material} />
        </pixiContainer>
      ))}
      {machine.processingMaterials.map((material, index) => (
        <ProcessingMaterialSprite
          material={material}
          angle={index * 10}
          working={working}
          key={`proc-${index}`}
        />
      ))}
      {machine.outputMaterials.map((material, index) => (
        <pixiContainer angle={index * 10 + 5} key={`out-${index}`}>
          <MaterialSprite material={material} />
        </pixiContainer>
      ))}
    </>
  );
};

const LocalMachineSprite: React.FC<{ machine: Machine }> = ({ machine }) => {
  const workspaceTexture = useTexture("/images/workspace.png");
  const makeshiftBenchTexture = useTexture("/images/makeshift-bench.png");

  switch (machine.type.id) {
    case MACHINE_TYPES.jobsiteTableSaw.id:
      return <JobsiteTableSawSprite machine={machine} />;

    case MACHINE_TYPES.miterSaw.id:
      return <MiterSawSprite machine={machine} />;

    case MACHINE_TYPES.lunchboxPlaner.id:
      return <LunchboxPlanerSprite machine={machine} />;

    case MACHINE_TYPES.jointer.id:
      return <JointerSprite machine={machine} />;

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
          <MachineMaterials machine={machine} />
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
          <MachineMaterials machine={machine} />
        </pixiContainer>
      );

    default: {
      return (
        <pixiContainer>
          <DefaultMachineSprite />
          <MachineMaterials machine={machine} />
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
