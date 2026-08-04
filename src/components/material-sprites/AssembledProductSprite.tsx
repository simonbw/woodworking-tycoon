import { Graphics } from "pixi.js";
import React, { useCallback, useMemo } from "react";
import {
  defaultPartsFor,
  ProductBlueprint,
  productBlueprintFor,
} from "../../game/bench-work/blueprint";
import { AssembledPart, FinishedProduct } from "../../game/Materials";
import { omitUndefined } from "../../utils/objectUtils";
import { PIXELS_PER_INCH } from "../shop-view/shop-scale";
import { BoardOnEdgeSprite } from "./BoardOnEdgeSprite";
import { BoardSprite } from "./BoardSprite";
import { drawFastenerHead } from "./fastenerHead";

/**
 * A blueprint-assembled product drawn from its bill of materials: the
 * blueprint says where every part lies (the same slots the bench view's
 * ghost outlines stood at), and the product's parts say which board
 * fills each slot — seeded by the consumed board's id, so the grain the
 * player laid on the bench is the grain in the finished piece, at every
 * zoom. Nail heads sit on the fastener points, all driven — it's done.
 *
 * Products from before the bill of materials render the blueprint's
 * nominal stock in the product's species (defaultPartsFor).
 */
export const AssembledProductSprite: React.FC<{
  material: FinishedProduct;
  alpha?: number;
  tint?: number;
}> = ({ material, alpha, tint }) => {
  const blueprint = productBlueprintFor(material.type);
  if (!blueprint) {
    throw new Error(`No blueprint to draw a ${material.type} from`);
  }
  return (
    <BlueprintPartsSprite
      blueprint={blueprint}
      parts={material.parts ?? defaultPartsFor(blueprint, material)}
      alpha={alpha}
      tint={tint}
    />
  );
};

const BlueprintPartsSprite: React.FC<{
  blueprint: ProductBlueprint;
  parts: ReadonlyArray<AssembledPart>;
  alpha?: number;
  tint?: number;
}> = ({ blueprint, parts, alpha, tint }) => {
  const slots = useMemo(
    () => [...blueprint.slots].sort((a, b) => a.layer - b.layer),
    [blueprint],
  );

  const drawNails = useCallback(
    (g: Graphics) => {
      g.clear();
      for (const fastener of blueprint.fasteners) {
        drawFastenerHead(
          g,
          fastener.xIn * PIXELS_PER_INCH,
          fastener.yIn * PIXELS_PER_INCH,
          1,
          blueprint.fastenerConsumable,
        );
      }
    },
    [blueprint],
  );

  return (
    <pixiContainer
      x={(-blueprint.widthIn * PIXELS_PER_INCH) / 2}
      y={(-blueprint.heightIn * PIXELS_PER_INCH) / 2}
      {...omitUndefined({ alpha })}
    >
      {slots.map((slot) => {
        const part =
          parts.find((p) => p.slot === slot.id) ??
          // A part list that predates a blueprint revision: draw the
          // slot's nominal stock rather than a hole.
          ({
            slot: slot.id,
            species: "pallet",
            width: slot.part.widthIn,
            length: slot.part.lengthIn,
            thickness: slot.part.thicknessQ,
            seed: slot.id,
          } satisfies AssembledPart);
        const board = {
          species: part.species,
          width: part.width,
          length: part.length,
          thickness: part.thickness,
          surface: part.surface ?? ("rough" as const),
          jointedFaces: 1 as const,
          jointedEdges: 2 as const,
        };
        return (
          <pixiContainer
            key={slot.id}
            x={slot.xIn * PIXELS_PER_INCH}
            y={slot.yIn * PIXELS_PER_INCH}
            angle={slot.angleDeg}
          >
            {slot.onEdge ? (
              // A rail stands on edge in the finished piece exactly as
              // it stood while the slats were nailed across it
              <BoardOnEdgeSprite board={board} seed={part.seed} tint={tint} />
            ) : (
              <BoardSprite board={board} seed={part.seed} tint={tint} />
            )}
          </pixiContainer>
        );
      })}
      <pixiGraphics draw={drawNails} />
    </pixiContainer>
  );
};
