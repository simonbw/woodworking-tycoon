import { Container, Graphics } from "pixi.js";
import { drawFastenerHead } from "../../components/material-sprites/fastenerHead";
import { PIXELS_PER_INCH } from "../../components/shop-view/shop-scale";
import {
  defaultPartsFor,
  productBlueprintFor,
} from "../../game/bench-work/blueprint";
import { AssembledPart, Board, FinishedProduct } from "../../game/Materials";
import { drawBoard, drawBoardOnEdge } from "./board";
import { drawPanel } from "./panel";

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
 *
 * The old AssembledProductSprite as an imperative builder: returns a
 * Container centered on the product; the caller owns its transform and
 * lifecycle.
 */
export function createAssembledProductSprite(
  material: FinishedProduct,
  options: { alpha?: number; tint?: number } = {},
): Container {
  const { alpha, tint } = options;
  const blueprint = productBlueprintFor(material.type);
  if (!blueprint) {
    throw new Error(`No blueprint to draw a ${material.type} from`);
  }
  const parts = material.parts ?? defaultPartsFor(blueprint, material);

  const root = new Container();
  if (alpha !== undefined) {
    root.alpha = alpha;
  }
  const inner = root.addChild(new Container());
  inner.position.set(
    (-blueprint.widthIn * PIXELS_PER_INCH) / 2,
    (-blueprint.heightIn * PIXELS_PER_INCH) / 2,
  );

  const slots = [...blueprint.slots].sort((a, b) => a.layer - b.layer);

  for (const slot of slots) {
    const part =
      parts.find((p) => p.slot === slot.id) ??
      // A part list that predates a blueprint revision: draw the
      // slot's nominal stock rather than a hole.
      ({
        slot: slot.id,
        species: "pallet",
        // Nominal part dims are board-catalog sizes on every product
        // blueprint (only equipment blueprints use sheet-size parts,
        // and equipment never renders as a product)
        width: slot.part.widthIn as AssembledPart["width"],
        length: slot.part.lengthIn,
        thickness: slot.part.thicknessQ as AssembledPart["thickness"],
        ...(slot.part.ends ? { ends: slot.part.ends } : {}),
        seed: slot.id,
      } satisfies AssembledPart);
    const board = {
      species: part.species,
      // Panel parts keep their own derived width; board parts are
      // catalog stock, so the widened number narrows back safely
      width: part.width as Board["width"],
      length: part.length,
      thickness: part.thickness,
      surface: part.surface ?? ("rough" as const),
      jointedFaces: 1 as const,
      jointedEdges: 2 as const,
      // A frame rail's mitered ends draw in the finished piece — the
      // corner seams are the product
      ...(part.ends ? { ends: part.ends } : {}),
    };

    const slotContainer = inner.addChild(new Container());
    slotContainer.position.set(
      slot.xIn * PIXELS_PER_INCH,
      slot.yIn * PIXELS_PER_INCH,
    );
    slotContainer.angle = slot.angleDeg;
    const g = slotContainer.addChild(new Graphics());
    if (part.strips) {
      // A glued-up part (a tray's bottom) draws as the panel it
      // is — the very stripes the player glued
      drawPanel(g, {
        strips: part.strips,
        length: part.length,
        thickness: part.thickness,
        surface: part.surface ?? "sanded",
      });
    } else if (slot.onEdge) {
      // A rail stands on edge in the finished piece exactly as
      // it stood while the slats were nailed across it
      drawBoardOnEdge(g, board, part.seed);
      if (tint !== undefined) {
        g.tint = tint;
      }
    } else {
      drawBoard(g, board, part.seed);
      if (tint !== undefined) {
        g.tint = tint;
      }
    }
  }

  const nailsG = inner.addChild(new Graphics());
  for (const fastener of blueprint.fasteners) {
    drawFastenerHead(
      nailsG,
      fastener.xIn * PIXELS_PER_INCH,
      fastener.yIn * PIXELS_PER_INCH,
      1,
      blueprint.fastenerConsumable,
    );
  }

  return root;
}
