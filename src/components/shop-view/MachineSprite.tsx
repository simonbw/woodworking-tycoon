import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import { animated, useSpring } from "react-spring";
import {
  MACHINE_TYPES,
  Machine,
  footprintCenter,
  isBenchType,
  machineKey,
} from "../../game/Machine";
import { useLeanedBenchKey } from "../bench-view/benchSceneSlot";
import {
  benchPlacementFor,
  benchTopSizeIn,
} from "../../game/bench-work/bench-layout";
import { MaterialInstance } from "../../game/Materials";
import { colors } from "../../utils/colors";
import { useTexture } from "../../utils/useTexture";
import { useMachineActivity } from "./useMachineActivity";
import {
  TARGET_HIGHLIGHT_FILTERS,
  TUTORIAL_HIGHLIGHT_FILTERS,
} from "./targetHighlight";
import { BandSawSprite } from "../machine-sprites/BandSawSprite";
import { GarbageCanSprite } from "../machine-sprites/GarbageCanSprite";
import { SawhorsesSprite } from "../machine-sprites/SawhorsesSprite";
import { StorageRackSprite } from "../machine-sprites/StorageRackSprite";
import { JobsiteTableSawSprite } from "../machine-sprites/JobsiteTableSawSprite";
import { JointerSprite } from "../machine-sprites/JointerSprite";
import { LunchboxPlanerSprite } from "../machine-sprites/LunchboxPlanerSprite";
import { MiterSawSprite } from "../machine-sprites/MiterSawSprite";
import { WorktableSprite } from "../machine-sprites/WorktableSprite";
import { MaterialSprite } from "../material-sprites/MaterialSprite";
import { PalletSprite } from "../material-sprites/PalletSprite";
import {
  IMAGE_PIXELS_PER_INCH,
  PIXELS_PER_CELL,
  PIXELS_PER_INCH,
  cellToPixelCenter,
} from "./shop-scale";

export const IMAGE_SCALE = PIXELS_PER_INCH / IMAGE_PIXELS_PER_INCH;

/**
 * Mounts canvas-centered art on the machine's footprint center, so the
 * image sits centered in the cells the machine claims no matter which of
 * them is the origin cell. The collision-box generator applies the same
 * offset to its measurements. Procedural sprites that draw in footprint
 * coordinates themselves (worktables, garbage can, storage rack) skip it.
 */
const FootprintArt: React.FC<{
  machine: Machine;
  children: React.ReactNode;
}> = ({ machine, children }) => {
  const [cx, cy] = footprintCenter(machine.type.cellsOccupied);
  return (
    <pixiContainer x={cx * PIXELS_PER_CELL} y={cy * PIXELS_PER_CELL}>
      {children}
    </pixiContainer>
  );
};

export const MachineSprite: React.FC<{
  machine: Machine;
  isSelected?: boolean;
  /** Whether the guided opening is sending the player to this station. */
  tutorialTarget?: boolean;
  onClick?: () => void;
}> = ({ machine, isSelected = false, tutorialTarget = false, onClick }) => {
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
      {/* The targeting outline: the machine the keyboard acts on wears a
          white rim hugging its silhouette — art, stock riding on it, and
          the dust bag alike — while the player stands at its operator
          position. Same treatment as the pile E would pick up. */}
      <pixiContainer
        filters={
          isSelected
            ? TARGET_HIGHLIGHT_FILTERS
            : tutorialTarget
              ? TUTORIAL_HIGHLIGHT_FILTERS
              : undefined
        }
      >
        <LocalMachineSprite machine={machine} />

        {/* A mounted dust bag hangs off the machine's corner */}
        {machine.state.tools.includes("dustBag") && (
          <FootprintArt machine={machine}>
            <DustBagSprite />
          </FootprintArt>
        )}
      </pixiContainer>

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
      <FootprintArt machine={machine}>
        <pixiContainer angle={-angle}>
          <OperationStatusBadge machine={machine} />
        </pixiContainer>
      </FootprintArt>
    </pixiContainer>
  );
};

/**
 * Floating status over a working machine: a progress bar (amber while an
 * attended phase needs you at the machine, green while a hands-free phase
 * runs on its own) or a pulsing amber pause marker when an attended phase
 * is waiting for the player to come back.
 */
const OperationStatusBadge: React.FC<{ machine: Machine }> = ({ machine }) => {
  const { isOperating, needsYou, fraction, relevantPhase } =
    useMachineActivity(machine);
  // Leaned over this bench, the scene carries its own progress line —
  // a floating badge would hang giant over the close-up.
  const leanedOver = useLeanedBenchKey() === machineKey(machine.state);

  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      if (!isOperating || relevantPhase === undefined) {
        return;
      }
      const y = -PIXELS_PER_CELL * 1.8;
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
      const barWidth = PIXELS_PER_CELL * 1.87;
      g.rect(-barWidth / 2 - 1, y - 3, barWidth + 2, 6);
      g.fill({ color: 0x1c1917, alpha: 0.75 });
      g.rect(-barWidth / 2, y - 2, barWidth * fraction, 4);
      g.fill(relevantPhase.attended ? 0xf59e0b : 0x4ade80);
    },
    [isOperating, needsYou, fraction, relevantPhase],
  );

  if (leanedOver) return null;
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

/**
 * A bench's staged stock, lying exactly where the bench layout says it
 * lies (see bench-work/bench-layout.ts) — the same arrangement the bench
 * view shows, at shop-floor zoom. The pallet always lies centered.
 * Positions are bench-top inches converted to footprint-center-relative
 * pixels, so this renders inside FootprintArt.
 */
const BenchTopMaterials: React.FC<{ machine: Machine }> = ({ machine }) => {
  const { widthIn, heightIn } = benchTopSizeIn(machine.type);
  return (
    <>
      {[...machine.inputMaterials, ...machine.outputMaterials].map(
        (material) => {
          const placement = benchPlacementFor(machine, material);
          return (
            <pixiContainer
              key={material.id}
              x={(placement.xIn - widthIn / 2) * PIXELS_PER_INCH}
              y={(placement.yIn - heightIn / 2) * PIXELS_PER_INCH}
              angle={placement.angleDeg}
              scale={{ x: placement.flipped ? -1 : 1, y: 1 }}
            >
              {material.type === "pallet" ? (
                // The pallet lies as arranged, showing the face the bench
                // view shows — same placement, same nails, two zooms
                <PalletSprite pallet={material} flipped={placement.flipped} />
              ) : (
                <MaterialSprite material={material} onEdge={placement.onEdge} />
              )}
            </pixiContainer>
          );
        },
      )}
    </>
  );
};

const MachineMaterials: React.FC<{ machine: Machine }> = ({ machine }) => {
  const { working } = useMachineActivity(machine);
  // The bench the player is leaned over draws its stock in the bench
  // view's scene instead — live, with drags and cure chrome — opaque
  // exactly over this spot. These static copies would only ghost out
  // from underneath it (see setLeanedBench).
  const leanedOver = useLeanedBenchKey() === machineKey(machine.state);

  if (leanedOver) return null;
  return (
    <>
      {isBenchType(machine.type) ? (
        <BenchTopMaterials machine={machine} />
      ) : (
        machine.inputMaterials.map((material, index) => (
          <pixiContainer angle={index * 10} key={`in-${index}`}>
            <MaterialSprite material={material} />
          </pixiContainer>
        ))
      )}
      {machine.processingMaterials.map((material, index) => (
        <ProcessingMaterialSprite
          material={material}
          angle={index * 10}
          working={working}
          key={`proc-${index}`}
        />
      ))}
      {/* Bench outputs lie on the bench top through their placements
          (BenchTopMaterials above); only other machines fan theirs out */}
      {!isBenchType(machine.type) &&
        machine.outputMaterials.map((material, index) => (
          <pixiContainer angle={index * 10 + 5} key={`out-${index}`}>
            <MaterialSprite material={material} />
          </pixiContainer>
        ))}
    </>
  );
};

const LocalMachineSprite: React.FC<{ machine: Machine }> = ({ machine }) => {
  const makeshiftBenchTexture = useTexture("/images/makeshift-bench.png");

  // Sprites that draw in footprint coordinates themselves
  if (machine.type.worktable) {
    return (
      <pixiContainer>
        <WorktableSprite machine={machine} />
        {/* Placements are footprint-center-relative, like image art */}
        <FootprintArt machine={machine}>
          <MachineMaterials machine={machine} />
        </FootprintArt>
      </pixiContainer>
    );
  }
  if (machine.type.id === MACHINE_TYPES.garbageCan.id) {
    return <GarbageCanSprite machine={machine} />;
  }
  if (machine.type.id === MACHINE_TYPES.storageRack.id) {
    return <StorageRackSprite machine={machine} />;
  }

  const art = (() => {
    switch (machine.type.id) {
      case MACHINE_TYPES.jobsiteTableSaw.id:
        return <JobsiteTableSawSprite machine={machine} />;

      case MACHINE_TYPES.miterSaw.id:
        return <MiterSawSprite machine={machine} />;

      case MACHINE_TYPES.lunchboxPlaner.id:
        return <LunchboxPlanerSprite machine={machine} />;

      case MACHINE_TYPES.jointer.id:
        return <JointerSprite machine={machine} />;

      case MACHINE_TYPES.bandSaw.id:
        return <BandSawSprite machine={machine} />;

      // The horses draw bare; the sheet across them is staged stock
      case MACHINE_TYPES.sawhorses.id:
        return (
          <pixiContainer>
            <SawhorsesSprite machine={machine} />
            <MachineMaterials machine={machine} />
          </pixiContainer>
        );

      // The makeshift workbench: the plywood-on-buckets art (this was the
      // makeshift bench's sprite; the bench identity moved to the starting
      // station — see machines/workspace.ts)
      case MACHINE_TYPES.workspace.id:
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
  })();

  return <FootprintArt machine={machine}>{art}</FootprintArt>;
};

/**
 * The canvas collection bag on a machine's dust port: a plump little
 * sack cinched at the neck, tucked against the machine's corner so it
 * reads at a glance which stations are bagged.
 */
const DustBagSprite: React.FC = () => {
  const draw = useCallback((g: Graphics) => {
    g.clear();
    const x = PIXELS_PER_CELL * 0.85;
    const y = PIXELS_PER_CELL * 0.8;
    // The bag: a soft sack, slightly slumped
    g.ellipse(x, y, 12, 14);
    g.fill(0xcbb489);
    g.ellipse(x, y, 12, 14);
    g.stroke({ width: 2, color: 0x9a865e });
    // Slump crease
    g.moveTo(x - 8, y + 2);
    g.quadraticCurveTo(x, y + 7, x + 8, y + 1);
    g.stroke({ width: 1.5, color: 0x9a865e });
    // Cinched neck + port stub toward the machine
    g.rect(x - 3, y - 19, 6, 6);
    g.fill(0x4b5563);
    g.moveTo(x - 4, y - 13);
    g.lineTo(x + 4, y - 13);
    g.stroke({ width: 3, color: 0x7c2d12 });
  }, []);

  return <pixiGraphics draw={draw} />;
};

const DefaultMachineSprite: React.FC = () => {
  return (
    <pixiGraphics
      draw={useCallback((g: Graphics) => {
        g.clear();
        g.rect(
          -PIXELS_PER_CELL / 2,
          -PIXELS_PER_CELL / 2,
          PIXELS_PER_CELL,
          PIXELS_PER_CELL,
        );
        g.fill(colors.brown["900"]);
      }, [])}
    />
  );
};
