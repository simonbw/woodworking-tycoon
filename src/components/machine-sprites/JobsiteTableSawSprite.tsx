import { Graphics, Texture } from "pixi.js";
import React, { useCallback } from "react";
import { animated, useSpring } from "react-spring";
import { Machine } from "../../game/Machine";
import {
  BOARD_DIMENSIONS,
  MaterialInstance,
  panelSpecies,
  panelWidth,
  Species,
} from "../../game/Materials";
import { isBoard } from "../../game/board-helpers";
import { isPanel } from "../../game/panel-helpers";
import { isParameterizedOperation } from "../../game/operation-helpers";
import { TOOL_TYPES } from "../../game/Tool";
import { lerp } from "../../utils/mathUtils";
import { useTexture } from "../../utils/useTexture";
import { MaterialSprite } from "../material-sprites/MaterialSprite";
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

function stockSpecies(material: MaterialInstance): Species {
  if (isBoard(material)) return material.species;
  if (isPanel(material)) return panelSpecies(material)[0];
  return "pine";
}

// Sled plywood and hardware, in the sprites' brown palette
const SLED_PLY = 0xd7b98a;
const SLED_EDGE = 0x8a6f4d;
const SLED_FENCE = 0x6e5638;
const SLED_CLAMP = 0x2a2520;

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

  // Fence-riding cuts are the ones with a width setting; everything else
  // rides a jig, and the fence parks out of the way at the end of the rail.
  const runningOperation = machine.selectedOperationOrNull;
  const ripCut =
    runningOperation != null &&
    isParameterizedOperation(runningOperation) &&
    runningOperation.parameters.some((param) => param.id === "targetWidth");

  // Mounted jigs sit on the table — the mode you can see from across the
  // shop. During a sled cut the active one travels with the stock.
  const mountedSleds = machine.state.tools.filter((tool): tool is SledId =>
    (SLED_TOOLS as readonly string[]).includes(tool),
  );
  const activeSled =
    cutting && !ripCut
      ? mountedSleds.find((sled) =>
          TOOL_TYPES[sled].operations.some(
            (operation) => operation.id === runningOperation?.id,
          ),
        )
      : undefined;

  const ripWidth =
    Number(machine.selectedParameters?.targetWidth) ||
    Math.max(...BOARD_DIMENSIONS);
  const fencePosition = ripWidth * PIXELS_PER_INCH;

  const springProps = useSpring({
    x: fencePosition,
  });

  // One spring drives the feeding stock (fence or sled side) and the kerf
  // that opens behind the blade (the blade sits at the machine's center).
  const cutLength = cutting ? feetToPixels(cutting.length) : 0;
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
              angle={index * 10}
              y={feetToPixels(board.length / 2) + inchesToPixels(2)}
              x={-inchesToPixels(board.width / 2 + board.thickness / 4)}
              key={`in-${index}`}
            >
              <MaterialSprite material={board} key={index} />
            </pixiContainer>
          );
        })}
        {cutting && ripCut && (
          <AnimatedPixiContainer
            y={feed.y}
            x={-inchesToPixels(stockWidth(cutting) / 2 + cutting.thickness / 4)}
          >
            <MaterialSprite material={cutting} />
          </AnimatedPixiContainer>
        )}
        {outputMaterials.map((material, index) => {
          const length =
            isBoard(material) || isPanel(material) ? material.length : 0.7;
          const thickness = "thickness" in material ? material.thickness : 2;
          return (
            <pixiContainer
              angle={-index - 1}
              y={-feetToPixels(length / 2) - inchesToPixels(3)}
              x={-inchesToPixels(stockWidth(material) / 2 + thickness / 4)}
              key={`out-${index}`}
            >
              <MaterialSprite material={material} key={index} />
            </pixiContainer>
          );
        })}
        <pixiSprite
          texture={tableSawFenceTexture}
          scale={IMAGE_SCALE * 0.8}
          anchor={0.5}
        />
      </AnimatedPixiContainer>
      {/* A sled cut: the jig travels with the stock clamped to it, the
          work overhanging the blade line by an inch */}
      {cutting && !ripCut && (
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
