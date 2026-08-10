import { useTick } from "@pixi/react";
import { Container, Graphics } from "pixi.js";
import React, { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { lerp } from "../../utils/mathUtils";
import {
  faceNails,
  isSameNail,
  palletBoardSlot,
  palletNailPosition,
  palletSlotRefFromId,
} from "../../game/bench-work/pallet-geometry";
import {
  PalletLayer,
  palletLayerOrder,
  PalletSprite,
} from "../material-sprites/PalletSprite";
import {
  BenchPlacement,
  berthPlacementOnBench,
  palletPointOnBench,
} from "../../game/bench-work/bench-layout";
import { fastenerOnBench, slotOnBench } from "../../game/bench-work/assembly";
import {
  BlueprintFastener,
  ProductBlueprint,
  slotFootprintIn,
} from "../../game/bench-work/blueprint";
import { placedPieceSize } from "../../game/bench-work/workpiece";
import { MaterialInstance, Pallet, PalletNail } from "../../game/Materials";
import { drawFastenerHead } from "../material-sprites/fastenerHead";
import { MaterialSprite } from "../material-sprites/MaterialSprite";
import { StageFit } from "./stageMath";

/**
 * The freeform half of the bench view: the bench's actual contents laid
 * out on the wood — a staged pallet lying where its own placement says
 * (draggable, turnable, flippable like any piece), and every loose piece
 * lying where the bench layout (real game state) says it lies. Pure
 * renderer: hit-testing and all state live in BenchWorkSurface, which
 * shares this file's coordinate space (bench-top inches, the bench's
 * top-left at the fit origin).
 */

export interface LoosePiece {
  readonly material: MaterialInstance;
  readonly placement: BenchPlacement;
}

/** Everything the scene needs to dress a blueprint assembly: ghost
 * outlines on the empty slots, fastener chrome on the armed crossings,
 * and driven nail heads. All derived in BenchWorkSurface — this is
 * pure rendering. */
export interface AssemblyChrome {
  readonly blueprint: ProductBlueprint;
  readonly productPlacement: BenchPlacement;
  /** The blueprint's driving tool is in hand — armed crossings ring up.
   * Nails light for the hammer, screws for the drill (fastenerToolId). */
  readonly toolHeld: boolean;
  /** slot id → material id for every seated piece. */
  readonly seated: ReadonlyMap<string, string>;
  /** Fasteners already driven this build (ephemeral until commit). */
  readonly driven: ReadonlyArray<BlueprintFastener>;
  /** Fasteners whose both parts are seated and not yet driven. */
  readonly armed: ReadonlyArray<BlueprintFastener>;
  readonly hoveredFastener: BlueprintFastener | null;
  /** The drive animation playing right now. */
  readonly driving: BlueprintFastener | null;
  /** The slot the dragged piece would snap onto if released. */
  readonly snapCandidateSlot: string | null;
}

/** Pointer must land this close (in inches) to pry a nail. */
export const NAIL_HIT_RADIUS_IN = 3.5;

/** The tween the pieces turn with: the spring react-spring would run
 * (tension 300, friction 26) — a hand turning the piece, no bounce. */
function stepSpring(
  value: number,
  velocity: number,
  target: number,
  dt: number,
): [number, number] {
  const nextVelocity = velocity + (300 * (target - value) - 26 * velocity) * dt;
  const next = value + nextVelocity * dt;
  return Math.abs(target - next) < 0.01 && Math.abs(nextVelocity) < 0.05
    ? [target, 0]
    : [next, nextVelocity];
}

/** How long a freed board takes to travel from its berth to the pile,
 * and how far it lifts off the bench on the way — a board swept aside
 * by hand, not a board teleporting. */
const TOSS_MS = 280;
const TOSS_LIFT = 0.08;

/** Fast off the mark, settling onto the pile: the hand lets go early. */
function easeOutToss(t: number): number {
  return 1 - (1 - t) ** 3;
}

/** Entrances are motion for its own sake — the piece is already where
 * the game state says it is, so a reader who asked for stillness gets
 * it there directly. */
function prefersReducedMotion(): boolean {
  return (
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  );
}

/**
 * A container whose turn and flip tween on the PIXI ticker — R and F
 * read as the piece being turned by hand, not teleported. Position
 * tracks the drag directly; only angle and flip ease in. Deliberately
 * NOT react-spring's animated("pixiContainer"): its web-targeted prop
 * applier doesn't drive the PIXI reconciler, and the container silently
 * renders nothing.
 *
 * `enterFrom` is the one exception to position tracking the drag: a
 * piece that appears mid-scene can be walked in from somewhere else
 * (a board pried off a pallet starts at its berth and is tossed onto
 * the pile). It's read once, at mount — a one-shot entrance, never a
 * target the piece keeps chasing.
 */
const TweenedTransform: React.FC<{
  placement: BenchPlacement;
  fit: StageFit;
  alpha?: number;
  enterFrom?: BenchPlacement;
  children: React.ReactNode;
}> = ({ placement, fit, alpha, enterFrom, children }) => {
  const targetAngle = placement.angleDeg;
  const targetFlip = placement.flipped ? -1 : 1;
  const nodeRef = useRef<Container | null>(null);
  // Captured at mount: later renders never restart an entrance.
  const entrance = useRef(
    enterFrom && !prefersReducedMotion() ? enterFrom : null,
  );
  const anim = useRef({
    angle: entrance.current?.angleDeg ?? targetAngle,
    flip: targetFlip,
    angleVelocity: 0,
    flipVelocity: 0,
    /** Seconds into the entrance, or null once it has landed. */
    enteringFor: entrance.current ? 0 : (null as number | null),
  });

  // The entrance has to be on the node before PIXI's next render, or
  // the piece shows for a frame at the far end of its own toss.
  useLayoutEffect(() => {
    const node = nodeRef.current;
    const from = entrance.current;
    if (!node || !from) return;
    node.x = fit.originX + from.xIn * fit.pxPerIn;
    node.y = fit.originY + from.yIn * fit.pxPerIn;
    node.angle = from.angleDeg;
    // Only ever at mount — fit is deliberately not a dependency
  }, []);

  useTick((ticker) => {
    const node = nodeRef.current;
    if (!node) return;
    const a = anim.current;
    const dt = Math.min(ticker.deltaMS, 50) / 1000;
    [a.angle, a.angleVelocity] = stepSpring(
      a.angle,
      a.angleVelocity,
      targetAngle,
      dt,
    );
    [a.flip, a.flipVelocity] = stepSpring(
      a.flip,
      a.flipVelocity,
      targetFlip,
      dt,
    );
    node.angle = a.angle;
    let lift = 1;
    if (a.enteringFor !== null && entrance.current) {
      a.enteringFor += dt;
      const t = Math.min(a.enteringFor / (TOSS_MS / 1000), 1);
      const eased = easeOutToss(t);
      const from = entrance.current;
      // The target is recomputed every tick, so a resize (or the piece
      // being nudged) mid-flight still lands it in the right place.
      node.x = lerp(
        fit.originX + from.xIn * fit.pxPerIn,
        fit.originX + placement.xIn * fit.pxPerIn,
        eased,
      );
      node.y = lerp(
        fit.originY + from.yIn * fit.pxPerIn,
        fit.originY + placement.yIn * fit.pxPerIn,
        eased,
      );
      // Off the bench and back down: the board is in the air, briefly
      lift = 1 + TOSS_LIFT * Math.sin(Math.PI * t);
      if (t >= 1) {
        a.enteringFor = null;
        entrance.current = null;
      }
    }
    node.scale.set(a.flip * fit.spriteScale * lift, fit.spriteScale * lift);
  });

  return (
    <pixiContainer
      ref={nodeRef}
      x={fit.originX + placement.xIn * fit.pxPerIn}
      y={fit.originY + placement.yIn * fit.pxPerIn}
      angle={anim.current.angle}
      scale={{
        x: anim.current.flip * fit.spriteScale,
        y: fit.spriteScale,
      }}
      alpha={alpha ?? 1}
    >
      {children}
    </pixiContainer>
  );
};

/** The white attention ring, drawn in sprite pixels inside the tweened
 * container so it hugs the piece through the turn. */
const PieceRing: React.FC<{
  material: MaterialInstance;
  placement: BenchPlacement;
  fit: StageFit;
  hovered: boolean;
  dragging: boolean;
}> = ({ material, placement, fit, hovered, dragging }) => {
  const drawRing = useCallback(
    (g: Graphics) => {
      g.clear();
      if (!hovered && !dragging) return;
      const size = placedPieceSize(material, placement);
      const w = (size.widthIn * fit.pxPerIn) / fit.spriteScale;
      const h = (size.heightIn * fit.pxPerIn) / fit.spriteScale;
      const pad = 4 / fit.spriteScale;
      g.roundRect(
        -w / 2 - pad,
        -h / 2 - pad,
        w + pad * 2,
        h + pad * 2,
        pad,
      ).stroke({
        width: 2 / fit.spriteScale,
        color: 0xf5efe3,
        alpha: dragging ? 0.9 : 0.55,
      });
    },
    [hovered, dragging, material, placement, fit],
  );
  return <pixiGraphics draw={drawRing} />;
};

const TweenedPiece: React.FC<{
  piece: LoosePiece;
  fit: StageFit;
  hovered: boolean;
  dragging: boolean;
  /** Where this piece came from, if it just appeared on the bench. */
  enterFrom?: BenchPlacement;
}> = ({ piece, fit, hovered, dragging, enterFrom }) => (
  <TweenedTransform
    placement={piece.placement}
    fit={fit}
    alpha={dragging ? 0.9 : 1}
    enterFrom={enterFrom}
  >
    <MaterialSprite
      material={piece.material}
      onEdge={piece.placement.onEdge}
      onEnd={piece.placement.onEnd}
    />
    <PieceRing
      material={piece.material}
      placement={piece.placement}
      fit={fit}
      hovered={hovered}
      dragging={dragging}
    />
  </TweenedTransform>
);

/**
 * Which of the pallet's layers a board lying on its berth belongs to.
 * Freed boards are tossed onto the pile, so ordinarily nothing matches —
 * but a board dragged back onto its berth re-enters the sandwich (a
 * stringer slid home lies under the deck again), and anything short of
 * that exact fit is just loose stock on top.
 */
function berthLayerOf(
  piece: LoosePiece,
  pallet: Pallet,
  palletPlacement: BenchPlacement,
): PalletLayer | null {
  const ref = palletSlotRefFromId(pallet.id, piece.material.id);
  if (!ref) return null;
  const berth = palletBoardSlot(ref);
  const expected = berthPlacementOnBench(palletPlacement, berth);
  const angleDiff =
    (((piece.placement.angleDeg - expected.angleDeg) % 360) + 360) % 360;
  const near =
    Math.abs(piece.placement.xIn - expected.xIn) < 0.6 &&
    Math.abs(piece.placement.yIn - expected.yIn) < 0.6 &&
    (angleDiff < 1 || angleDiff > 359) &&
    piece.placement.flipped === expected.flipped;
  return near ? berth.layer : null;
}

export const BenchScene: React.FC<{
  pallet: Pallet | null;
  /** The pallet's live placement (drag included), when staged. */
  palletPlacement: BenchPlacement | null;
  pieces: ReadonlyArray<LoosePiece>;
  /** Bench-inch fit: origin at the bench top's top-left corner. */
  fit: StageFit;
  /** Nails light up while the hammer is in hand. */
  hammerHeld: boolean;
  prying: PalletNail | null;
  /** The nail under the held hammer right now. */
  hoveredNail: PalletNail | null;
  hoveredId: string | null;
  draggingId: string | null;
  /** Blueprint assembly dressing (ghosts, fastener chrome), when a
   * blueprint plan is pinned above the bench. */
  assembly?: AssemblyChrome | null;
}> = ({
  pallet,
  palletPlacement,
  pieces,
  fit,
  hammerHeld,
  prying,
  hoveredNail,
  hoveredId,
  draggingId,
  assembly,
}) => {
  // A pried board is committed straight onto the pile in the bench's
  // back-left corner (palletStackPlacement), which would have it appear
  // there out of nowhere — so the scene walks it over from the berth it
  // was nailed in. Two things have to be remembered to draw that:
  //
  // - Which pieces are *new since the last commit*. A piece that merely
  //   moves house between the scene's layers (a board seated onto a
  //   blueprint slot changes parent, so React remounts it) has been on
  //   the bench all along and must not fly anywhere.
  // - The pallet's last known placement, because the final pry frees two
  //   boards and takes the pallet away in the same commit — by the time
  //   they need a berth, there's no pallet left to ask.
  //
  // Both refs are written after commit and only read during render, so
  // a double-invoked render sees the same answer.
  const seenIds = useRef<ReadonlySet<string> | null>(null);
  const lastPallet = useRef<{ id: string; placement: BenchPlacement } | null>(
    null,
  );
  const knownIds = seenIds.current;
  const palletSource =
    pallet && palletPlacement
      ? { id: pallet.id, placement: palletPlacement }
      : lastPallet.current;
  useEffect(() => {
    seenIds.current = new Set(pieces.map((piece) => piece.material.id));
    if (pallet && palletPlacement) {
      lastPallet.current = { id: pallet.id, placement: palletPlacement };
    }
  });

  /** The berth a board just freed should be tossed from — nothing for a
   * piece that was already lying here, or that never came off a pallet.
   * The first render seeds the roster instead of tossing everything on
   * it: opening the bench view is not a pry. */
  const tossFrom = (piece: LoosePiece): BenchPlacement | undefined => {
    if (!knownIds || knownIds.has(piece.material.id) || !palletSource) {
      return undefined;
    }
    const ref = palletSlotRefFromId(palletSource.id, piece.material.id);
    return ref
      ? berthPlacementOnBench(palletSource.placement, palletBoardSlot(ref))
      : undefined;
  };

  // The nail heads themselves are part of the pallet (PalletSprite draws
  // them in both views); this layer is only the pry chrome around them,
  // carried through the pallet's placement like everything else.
  const drawNailChrome = useCallback(
    (g: Graphics) => {
      g.clear();
      if (!pallet || !palletPlacement) return;
      const toStage = (nail: PalletNail) => {
        const local = palletNailPosition(nail);
        const at = palletPointOnBench(palletPlacement, local.xIn, local.yIn);
        return {
          x: fit.originX + at.xIn * fit.pxPerIn,
          y: fit.originY + at.yIn * fit.pxPerIn,
        };
      };
      if (hammerHeld) {
        for (const nail of faceNails(pallet, palletPlacement.flipped)) {
          const { x, y } = toStage(nail);
          if (isSameNail(hoveredNail, nail)) {
            // The hammer is over this one: the ring warms and widens
            g.circle(x, y, 9).fill({ color: 0xd97c26, alpha: 0.2 });
            g.circle(x, y, 9).stroke({ width: 3, color: 0xd97c26, alpha: 1 });
          } else {
            // The "pry here" ring, lit while the hammer is in hand
            g.circle(x, y, 7).stroke({
              width: 2.5,
              color: 0xf5efe3,
              alpha: 0.95,
            });
          }
        }
      }
      if (prying) {
        // The pull in progress: the press already committed, so the nail
        // is gone from the pallet — the widened ring and the claw's
        // lever line play out over the empty hole.
        const { x, y } = toStage(prying);
        g.circle(x, y, 10).stroke({
          width: 2.5,
          color: 0xd97c26,
          alpha: 0.95,
        });
        g.moveTo(x, y)
          .lineTo(x + 16, y - 22)
          .stroke({ width: 3.5, color: 0x8a8378, alpha: 0.9 });
      }
    },
    [pallet, palletPlacement, fit, hammerHeld, prying, hoveredNail],
  );

  // Ghost outlines on the empty slots, under everything: where the
  // remaining parts belong, the candidate seat glowing while a fitting
  // piece is dragged near.
  const drawGhosts = useCallback(
    (g: Graphics) => {
      g.clear();
      if (!assembly) return;
      const { blueprint, productPlacement, seated, snapCandidateSlot } =
        assembly;
      for (const slot of blueprint.slots) {
        if (seated.has(slot.id)) continue;
        const seat = slotOnBench(blueprint, productPlacement, slot);
        // An on-edge slot's outline is the thin strip the tipped board
        // will stand in; an on-end slot's is the bare cross-section a
        // standing leg covers — the smallness is the tell
        const { wIn: w, hIn: h } = slotFootprintIn(slot);
        const rad = (seat.angleDeg * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const corner = (dx: number, dy: number) => ({
          x: fit.originX + (seat.xIn + dx * cos - dy * sin) * fit.pxPerIn,
          y: fit.originY + (seat.yIn + dx * sin + dy * cos) * fit.pxPerIn,
        });
        const corners = [
          corner(-w / 2, -h / 2),
          corner(w / 2, -h / 2),
          corner(w / 2, h / 2),
          corner(-w / 2, h / 2),
        ];
        const candidate = snapCandidateSlot === slot.id;
        g.poly(corners.map((c) => [c.x, c.y]).flat()).stroke({
          width: candidate ? 3 : 2,
          color: candidate ? 0xd97c26 : 0xf5efe3,
          alpha: candidate ? 0.95 : 0.4,
        });
      }
    },
    [assembly, fit],
  );

  // Fastener chrome over the seated parts: driven heads are real
  // hardware now, armed crossings ring up while the driving tool is in
  // hand, and the drive in progress flashes — the pry chrome's
  // vocabulary, reversed.
  const drawFastenerChrome = useCallback(
    (g: Graphics) => {
      g.clear();
      if (!assembly) return;
      const { blueprint, productPlacement } = assembly;
      const toStage = (fastener: BlueprintFastener) => {
        const at = fastenerOnBench(blueprint, productPlacement, fastener);
        return {
          x: fit.originX + at.xIn * fit.pxPerIn,
          y: fit.originY + at.yIn * fit.pxPerIn,
        };
      };
      for (const fastener of assembly.driven) {
        const { x, y } = toStage(fastener);
        const r = Math.max(0.28 * fit.pxPerIn, 2);
        drawFastenerHead(g, x, y, r, blueprint.fastenerConsumable);
      }
      if (assembly.toolHeld) {
        for (const fastener of assembly.armed) {
          const { x, y } = toStage(fastener);
          if (assembly.hoveredFastener === fastener) {
            // The hammer is over this crossing: the ring warms and widens
            g.circle(x, y, 9).fill({ color: 0xd97c26, alpha: 0.2 });
            g.circle(x, y, 9).stroke({ width: 3, color: 0xd97c26, alpha: 1 });
          } else {
            g.circle(x, y, 7).stroke({
              width: 2.5,
              color: 0xf5efe3,
              alpha: 0.95,
            });
          }
        }
      }
      if (assembly.driving) {
        // The strike: the press already committed the drive, so the head
        // is drawn — the flash plays out over it.
        const { x, y } = toStage(assembly.driving);
        g.circle(x, y, 10).stroke({
          width: 2.5,
          color: 0xd97c26,
          alpha: 0.95,
        });
      }
    },
    [assembly, fit],
  );

  // Freed boards still lying on their berths keep their place inside the
  // pallet's stack; everything else is loose on top. The dragged piece
  // always rides the very top. Under an assembly plan the same physical
  // rule holds for the build itself: seated parts stack in blueprint
  // layer order (rails under shelves), loose stock above them.
  const seatedLayerOf = (piece: LoosePiece): number | null => {
    if (!assembly || piece.material.id === draggingId) return null;
    for (const slot of assembly.blueprint.slots) {
      if (assembly.seated.get(slot.id) === piece.material.id) {
        return slot.layer;
      }
    }
    return null;
  };
  const berthed = new Map<PalletLayer, LoosePiece[]>();
  const free: LoosePiece[] = [];
  const seatedByLayer = new Map<number, LoosePiece[]>();
  for (const piece of pieces) {
    const layer =
      pallet && palletPlacement && piece.material.id !== draggingId
        ? berthLayerOf(piece, pallet, palletPlacement)
        : null;
    if (layer) {
      const group = berthed.get(layer) ?? [];
      group.push(piece);
      berthed.set(layer, group);
      continue;
    }
    const seatLayer = seatedLayerOf(piece);
    if (seatLayer !== null) {
      const group = seatedByLayer.get(seatLayer) ?? [];
      group.push(piece);
      seatedByLayer.set(seatLayer, group);
    } else {
      free.push(piece);
    }
  }
  const ordered =
    draggingId === null
      ? free
      : [
          ...free.filter((p) => p.material.id !== draggingId),
          ...free.filter((p) => p.material.id === draggingId),
        ];

  const renderPiece = (piece: LoosePiece) => (
    <TweenedPiece
      key={piece.material.id}
      piece={piece}
      fit={fit}
      hovered={hoveredId === piece.material.id}
      dragging={draggingId === piece.material.id}
      enterFrom={tossFrom(piece)}
    />
  );

  const seatedOrdered = [...seatedByLayer.entries()]
    .sort((a, b) => a[0] - b[0])
    .flatMap(([, group]) => group);

  return (
    <pixiContainer>
      <pixiGraphics draw={drawGhosts} />
      {seatedOrdered.map(renderPiece)}
      {pallet &&
        palletPlacement &&
        palletLayerOrder(palletPlacement.flipped).map((layer) => (
          <React.Fragment key={layer}>
            <TweenedTransform
              placement={palletPlacement}
              fit={fit}
              alpha={draggingId === pallet.id ? 0.9 : 1}
            >
              <PalletSprite
                pallet={pallet}
                flipped={palletPlacement.flipped}
                layers={[layer]}
              />
            </TweenedTransform>
            {(berthed.get(layer) ?? []).map(renderPiece)}
          </React.Fragment>
        ))}
      {pallet && palletPlacement && (
        <TweenedTransform placement={palletPlacement} fit={fit}>
          <PieceRing
            material={pallet}
            placement={palletPlacement}
            fit={fit}
            hovered={hoveredId === pallet.id}
            dragging={draggingId === pallet.id}
          />
        </TweenedTransform>
      )}
      {ordered.map(renderPiece)}
      <pixiGraphics draw={drawNailChrome} />
      <pixiGraphics draw={drawFastenerChrome} />
    </pixiContainer>
  );
};
