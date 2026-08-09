import { Graphics, Texture } from "pixi.js";
import React, { useCallback } from "react";
import { animated, useSpring } from "react-spring";
import { Machine, operationParameters } from "../../game/Machine";
import {
  BOARD_DIMENSIONS,
  DustSpecies,
  MaterialInstance,
  panelWidth,
} from "../../game/Materials";
import { materialDustSpecies } from "../../game/material-helpers";
import { isBoard } from "../../game/board-helpers";
import { stockOrientation } from "../../game/machine-helpers";
import { isPanel } from "../../game/panel-helpers";
import { TOOL_TYPES } from "../../game/Tool";
import { lerp } from "../../utils/mathUtils";
import { useTexture } from "../../utils/useTexture";
import { MaterialSprite } from "../material-sprites/MaterialSprite";
import { OnEdgeBoardSprite } from "../material-sprites/OnEdgeBoardSprite";
import { IMAGE_SCALE } from "../shop-view/MachineSprite";
import {
  PIXELS_PER_INCH,
  feetToPixels,
  inchesToPixels,
} from "../shop-view/shop-scale";
import { useMachineActivity } from "../shop-view/useMachineActivity";
import { CutParticles, cutSprayIntensity } from "./CutParticles";

const AnimatedPixiContainer = animated("pixiContainer");
const AnimatedPixiSprite = animated("pixiSprite");

/** The jigs that live on the saw table while mounted. */
const SLED_TOOLS = ["straightLineSled", "crosscutSled"] as const;
type SledId = (typeof SLED_TOOLS)[number];

/** Width across the blade for anything the saw can be cutting. */
function stockWidth(material: MaterialInstance): number {
  if (isBoard(material)) return material.width;
  if (isPanel(material)) return panelWidth(material);
  return 8;
}

/** What the spray off this stock is colored by — a sheet's chips are the
 * sheet's own pseudo-species, not a wood. */
function stockSpecies(material: MaterialInstance): DustSpecies {
  return materialDustSpecies(material)[0] ?? "pine";
}

// Sled plywood and hardware, in the sprites' brown palette
const SLED_PLY = 0xd7b98a;
const SLED_EDGE = 0x8a6f4d;
const SLED_FENCE = 0x6e5638;
const SLED_CLAMP = 0x2a2520;

/**
 * The tall resaw fence, bolted to the rip fence and drawn riding with it:
 * from above it's a plywood face standing proud of the fence, with its
 * triangular braces flaring back toward the operator.
 */
const TallFenceSprite: React.FC = () => {
  const draw = useCallback((g: Graphics) => {
    g.clear();
    const length = feetToPixels(2);
    const thickness = inchesToPixels(0.75);
    // The face itself, on the blade side of the fence
    g.rect(-thickness, -length / 2, thickness, length)
      .fill(SLED_PLY)
      .stroke({ width: 1, color: SLED_EDGE });
    // Braces reaching back over the fence body to hold it square
    for (const at of [-0.3, 0.3]) {
      g.poly([
        0,
        at * length - inchesToPixels(1),
        inchesToPixels(4),
        at * length,
        0,
        at * length + inchesToPixels(1),
      ]).fill(SLED_FENCE);
    }
  }, []);
  return <pixiGraphics draw={draw} />;
};

/**
 * A shop-built sled, drawn procedurally with its blade slit at local x = 0
 * so parking it on the table lines it up with the kerf. The crosscut sled
 * is the classic plywood square with front and back fences; the
 * straight-line sled is a long runner board with toggle clamps that carries
 * a wany edge past the blade.
 */
const SledSprite: React.FC<{ kind: SledId }> = ({ kind }) => {
  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      if (kind === "crosscutSled") {
        const width = inchesToPixels(16);
        const length = inchesToPixels(18);
        const left = -inchesToPixels(12); // the slit sits 4" in from the right
        const backFence = inchesToPixels(1.2);
        const frontFence = inchesToPixels(2);
        g.rect(left, -length / 2, width, length)
          .fill(SLED_PLY)
          .stroke({ width: 1, color: SLED_EDGE });
        g.rect(left, -length / 2, width, backFence).fill(SLED_FENCE);
        g.rect(left, length / 2 - frontFence, width, frontFence).fill(
          SLED_FENCE,
        );
        // The kerf slit the blade has already cut through the base
        g.rect(
          -1,
          -length / 2 + backFence,
          2,
          length - backFence - frontFence,
        ).fill({ color: 0x120d08, alpha: 0.55 });
      } else {
        const width = inchesToPixels(8);
        const length = feetToPixels(4);
        g.rect(-width, -length / 2, width, length)
          .fill(SLED_PLY)
          .stroke({ width: 1, color: SLED_EDGE });
        // Toggle clamps along the left edge hold the crooked stock
        for (const at of [-0.32, 0, 0.32]) {
          g.rect(
            -width + inchesToPixels(1),
            at * length - inchesToPixels(0.75),
            inchesToPixels(2.5),
            inchesToPixels(1.5),
          ).fill(SLED_CLAMP);
        }
      }
    },
    [kind],
  );
  return <pixiGraphics draw={draw} />;
};

export const JobsiteTableSawSprite: React.FC<{ machine: Machine }> = ({
  machine,
}) => {
  const { inputMaterials, processingMaterials, outputMaterials } = machine;
  const { fraction, working } = useMachineActivity(machine);
  // Boards rip and ride sleds; panels only ever cross on the crosscut sled
  const cutting = processingMaterials.find(
    (material) => isBoard(material) || isPanel(material),
  );
  const tableSawTableTexture = useTexture(
    "/images/jobsite-table-saw-table.png",
  );
  const tableSawFenceTexture = useTexture(
    "/images/jobsite-table-saw-fence.png",
  );

  // Fence-riding cuts are the ones with a fence setting — the rip's width
  // or the resaw's thickness. Everything else rides a jig, and the fence
  // parks out of the way at the end of the rail.
  const runningOperation = machine.selectedOperationOrNull;
  const fenceCut =
    runningOperation != null &&
    operationParameters(runningOperation).some(
      (param) => param.id === "targetWidth" || param.id === "targetThickness",
    );

  // The tall fence rides the rail whenever it's bolted on; whether the
  // work actually stands on edge against it is the stock orientation (R
  // turns it over), which also moves the fence to a reading in quarters
  // instead of inches. Work already committed to the blade keeps the
  // orientation of the cut that claimed it.
  const tallFenceMounted = machine.state.tools.includes("resawFence");
  const committedWork =
    processingMaterials.length > 0 || outputMaterials.length > 0;
  const resawing = committedWork
    ? machine.state.selectedOperationId === "resawOnTableSaw"
    : stockOrientation(machine) === "on edge";

  // Mounted jigs sit on the table — the mode you can see from across the
  // shop. During a sled cut the active one travels with the stock.
  const mountedSleds = machine.state.tools.filter((tool): tool is SledId =>
    (SLED_TOOLS as readonly string[]).includes(tool),
  );
  const activeSled =
    cutting && !fenceCut
      ? mountedSleds.find((sled) =>
          TOOL_TYPES[sled].operations.some(
            (operation) => operation.id === runningOperation?.id,
          ),
        )
      : undefined;

  // Standing on edge, a board's footprint on the table is its thickness;
  // lying flat it's its width, with the fence face at the near edge.
  const stockOffset = (material: MaterialInstance) => {
    const thickness = "thickness" in material ? material.thickness : 2;
    return resawing
      ? -inchesToPixels(thickness / 8)
      : -inchesToPixels(stockWidth(material) / 2 + thickness / 4);
  };
  const stockSprite = (material: MaterialInstance) =>
    resawing && isBoard(material) ? (
      <OnEdgeBoardSprite board={material} seed={material.id} />
    ) : (
      <MaterialSprite material={material} />
    );

  const fenceInches = resawing
    ? Number(machine.selectedParameters?.targetThickness ?? 4) / 4
    : Number(machine.selectedParameters?.targetWidth) ||
      Math.max(...BOARD_DIMENSIONS);
  const fencePosition = fenceInches * PIXELS_PER_INCH;

  const springProps = useSpring({
    x: fencePosition,
  });

  // One spring drives the feeding stock (fence or sled side) and the kerf
  // that opens behind the blade (the blade sits at the machine's center).
  const cutLength = cutting ? inchesToPixels(cutting.length) : 0;
  const feed = useSpring({
    y: cutting
      ? lerp(
          cutLength / 2 + inchesToPixels(2),
          -cutLength / 2 - inchesToPixels(3),
          fraction,
        )
      : 0,
  });

  return (
    <pixiContainer>
      <pixiSprite
        texture={tableSawTableTexture}
        scale={IMAGE_SCALE * 0.8}
        anchor={0.5}
      />
      {/* Parked jigs, aligned in the miter slots (slit on the blade line);
          a second mounted sled stacks askew on top */}
      {mountedSleds.map((sled, index) =>
        sled === activeSled ? null : (
          <pixiContainer
            key={sled}
            x={-inchesToPixels(index * 2)}
            y={inchesToPixels(index * 3)}
            angle={index * 4}
          >
            <SledSprite kind={sled} />
          </pixiContainer>
        ),
      )}
      <AnimatedPixiContainer x={springProps.x}>
        {inputMaterials.filter(isBoard).map((board, index) => {
          return (
            <pixiContainer
              angle={resawing ? 0 : index * 10}
              y={inchesToPixels(board.length / 2) + inchesToPixels(2)}
              x={stockOffset(board)}
              key={`in-${index}`}
            >
              {stockSprite(board)}
            </pixiContainer>
          );
        })}
        {cutting && fenceCut && (
          <AnimatedPixiContainer y={feed.y} x={stockOffset(cutting)}>
            {stockSprite(cutting)}
          </AnimatedPixiContainer>
        )}
        {outputMaterials.map((material, index) => {
          const length =
            isBoard(material) || isPanel(material) ? material.length : 0.7;
          return (
            <pixiContainer
              angle={resawing ? 0 : -index - 1}
              y={-inchesToPixels(length / 2) - inchesToPixels(3)}
              x={
                stockOffset(material) -
                (resawing ? inchesToPixels(index * 1.2) : 0)
              }
              key={`out-${index}`}
            >
              {stockSprite(material)}
            </pixiContainer>
          );
        })}
        {/* The tall fence bolts on ahead of the rip fence and rides with it */}
        {tallFenceMounted && <TallFenceSprite />}
        <pixiSprite
          texture={tableSawFenceTexture}
          scale={IMAGE_SCALE * 0.8}
          anchor={0.5}
        />
      </AnimatedPixiContainer>
      {/* A sled cut: the jig travels with the stock clamped to it, the
          work overhanging the blade line by an inch */}
      {cutting && !fenceCut && (
        <AnimatedPixiContainer y={feed.y}>
          {activeSled && <SledSprite kind={activeSled} />}
          <pixiContainer
            x={inchesToPixels(1) - inchesToPixels(stockWidth(cutting) / 2)}
          >
            <MaterialSprite material={cutting} />
          </pixiContainer>
        </AnimatedPixiContainer>
      )}
      {cutting && (
        // The kerf: a dark slit that opens behind the blade as the stock
        // feeds through, splitting the already-cut portion in two
        <AnimatedPixiSprite
          texture={Texture.WHITE}
          tint={0x120d08}
          alpha={0.9}
          width={3}
          anchor={{ x: 0.5, y: 1 }}
          y={feed.y.to((y) => Math.min(y + cutLength / 2, 0))}
          height={feed.y.to((y) =>
            Math.max(0, Math.min(y + cutLength / 2, 0) - (y - cutLength / 2)),
          )}
        />
      )}
      {cutting && (
        <>
          {/* The blade's teeth come up out of the table spinning toward the
              operator, kicking dust back over the infeed side */}
          <CutParticles
            intensity={cutSprayIntensity(machine)}
            kind="dust"
            species={stockSpecies(cutting)}
            active={working}
            direction={Math.PI / 2}
            density={1.2}
          />
          {/* Below the table, the guard funnels the rest out the chip port
              at the back in a tight jet */}
          <CutParticles
            intensity={cutSprayIntensity(machine)}
            kind="dust"
            species={stockSpecies(cutting)}
            active={working}
            y={-10}
            direction={-Math.PI / 2}
            spread={0.5}
          />
          {/* ...and fine dust hangs in the air around the blade */}
          <CutParticles
            intensity={cutSprayIntensity(machine)}
            kind="dust"
            species={stockSpecies(cutting)}
            active={working}
            direction={0}
            ambient
            density={0.7}
          />
        </>
      )}
    </pixiContainer>
  );
};
