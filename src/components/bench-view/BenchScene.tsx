import { useTick } from "@pixi/react";
import { Container, Graphics } from "pixi.js";
import React, { useCallback, useRef } from "react";
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
import {
  advanceFlipPhase,
  FLIP_LEG_SECONDS,
  FLIP_STOPS,
  flipStopOf,
  flipStopSize,
  tumbleFrame,
  tumbles,
} from "../../game/bench-work/flip-cycle";
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

/**
 * A container whose turn and flip tween on the PIXI ticker — R and F
 * read as the piece being turned by hand, not teleported. Position
 * tracks the drag directly; only angle and flip ease in. Deliberately
 * NOT react-spring's animated("pixiContainer"): its web-targeted prop
 * applier doesn't drive the PIXI reconciler, and the container silently
 * renders nothing.
 */
const TweenedTransform: React.FC<{
  placement: BenchPlacement;
  fit: StageFit;
  alpha?: number;
  children: React.ReactNode;
}> = ({ placement, fit, alpha, children }) => {
  const targetAngle = placement.angleDeg;
  const targetFlip = placement.flipped ? -1 : 1;
  const nodeRef = useRef<Container | null>(null);
  const anim = useRef({
    angle: targetAngle,
    flip: targetFlip,
    angleVelocity: 0,
    flipVelocity: 0,
  });

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
    node.scale.set(a.flip * fit.spriteScale, fit.spriteScale);
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

/** The white attention ring around a piece of a given footprint, drawn
 * in sprite pixels inside the tweened container so it hugs the piece
 * through the turn. */
function drawPieceRing(
  g: Graphics,
  sizeIn: { widthIn: number; heightIn: number },
  fit: StageFit,
  hovered: boolean,
  dragging: boolean,
): void {
  g.clear();
  if (!hovered && !dragging) return;
  const w = (sizeIn.widthIn * fit.pxPerIn) / fit.spriteScale;
  const h = (sizeIn.heightIn * fit.pxPerIn) / fit.spriteScale;
  const pad = 4 / fit.spriteScale;
  g.roundRect(-w / 2 - pad, -h / 2 - pad, w + pad * 2, h + pad * 2, pad).stroke(
    {
      width: 2 / fit.spriteScale,
      color: 0xf5efe3,
      alpha: dragging ? 0.9 : 0.55,
    },
  );
}

const PieceRing: React.FC<{
  material: MaterialInstance;
  placement: BenchPlacement;
  fit: StageFit;
  hovered: boolean;
  dragging: boolean;
}> = ({ material, placement, fit, hovered, dragging }) => {
  const drawRing = useCallback(
    (g: Graphics) => {
      drawPieceRing(
        g,
        placedPieceSize(material, placement),
        fit,
        hovered,
        dragging,
      );
    },
    [hovered, dragging, material, placement, fit],
  );
  return <pixiGraphics draw={drawRing} />;
};

/** Read once: the tumble snaps straight to its end states under
 * `prefers-reduced-motion`, the way the rest of the view's motion does
 * — which is also how the E2E suite runs. */
let reducedMotion: boolean | null = null;
function prefersReducedMotion(): boolean {
  if (reducedMotion === null) {
    reducedMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  }
  return reducedMotion;
}

/**
 * A board going over: the stop it is leaving and the stop it is arriving
 * at, both drawn at the footprint the tumble is passing through and
 * cross-fading as one turns into the other, so F reads as the piece
 * being tipped by hand instead of swapping sprites. The cycle, the
 * footprints, and the easing all come from `bench-work/flip-cycle`; this
 * only ticks it and pushes the result at PIXI.
 *
 * All three stops are mounted at once and hidden by the tick rather than
 * by a prop: React must not get a say in which sprite shows, or the
 * re-render that lands the new placement would pop the destination up at
 * full size a frame before the tumble starts.
 */
const FlipTumble: React.FC<{
  piece: LoosePiece;
  fit: StageFit;
  hovered: boolean;
  dragging: boolean;
}> = ({ piece, fit, hovered, dragging }) => {
  const { material, placement } = piece;
  const stop = flipStopOf(placement);
  const groupRef = useRef<Container | null>(null);
  const ringRef = useRef<Graphics | null>(null);
  const targetPhase = useRef(stop);
  const phase = useRef(stop);
  // The stop the containers were mounted showing — a constant prop, so
  // React applies it once and never touches `visible` again.
  const mountedStop = useRef(stop).current;
  // Advancing onto a stop already reached is a no-op, so re-rendering
  // never double-steps the cycle.
  targetPhase.current = advanceFlipPhase(targetPhase.current, stop);
  if (prefersReducedMotion()) {
    phase.current = targetPhase.current;
  }
  // Redrawing the ring is only worth it when something moved — and only
  // the piece under the hand draws one at all.
  const lastRing = useRef("");
  // The ring is the tick's to draw (it has to follow the tumble); this
  // only hands the Graphics over empty, and never re-runs.
  const initRing = useCallback((g: Graphics) => {
    g.clear();
  }, []);

  useTick((ticker) => {
    if (phase.current !== targetPhase.current) {
      const dt = Math.min(ticker.deltaMS, 50) / 1000;
      phase.current = Math.min(
        targetPhase.current,
        phase.current + dt / FLIP_LEG_SECONDS,
      );
    }
    const frame = tumbleFrame(material, phase.current);
    const children = groupRef.current?.children ?? [];
    for (let i = 0; i < children.length; i++) {
      const node = children[i];
      if (!node) continue;
      const showing =
        i === frame.fromStop
          ? 1 - frame.fade
          : i === frame.toStop
            ? frame.fade
            : 0;
      node.visible = showing > 0.001;
      if (!node.visible) continue;
      node.alpha = showing;
      // Each stop's sprite draws its own footprint, so matching the
      // apparent one is a plain ratio of inches.
      const own = flipStopSize(material, i);
      node.scale.set(
        (frame.widthIn / own.widthIn) * frame.lift,
        (frame.heightIn / own.heightIn) * frame.lift,
      );
    }
    const ring = ringRef.current;
    if (!ring) return;
    const sizeIn = {
      widthIn: frame.widthIn * frame.lift,
      heightIn: frame.heightIn * frame.lift,
    };
    const key = `${hovered}|${dragging}|${sizeIn.widthIn.toFixed(3)}|${sizeIn.heightIn.toFixed(3)}|${fit.pxPerIn}|${fit.spriteScale}`;
    if (key === lastRing.current) return;
    lastRing.current = key;
    drawPieceRing(ring, sizeIn, fit, hovered, dragging);
  });

  return (
    <>
      <pixiContainer ref={groupRef}>
        {FLIP_STOPS.map((flipStop, i) => (
          <pixiContainer key={i} visible={i === mountedStop}>
            <MaterialSprite
              material={material}
              onEdge={flipStop.onEdge}
              onEnd={flipStop.onEnd}
            />
          </pixiContainer>
        ))}
      </pixiContainer>
      <pixiGraphics ref={ringRef} draw={initRing} />
    </>
  );
};

const TweenedPiece: React.FC<{
  piece: LoosePiece;
  fit: StageFit;
  hovered: boolean;
  dragging: boolean;
}> = ({ piece, fit, hovered, dragging }) => (
  <TweenedTransform
    placement={piece.placement}
    fit={fit}
    alpha={dragging ? 0.9 : 1}
  >
    {tumbles(piece.material) ? (
      <FlipTumble
        piece={piece}
        fit={fit}
        hovered={hovered}
        dragging={dragging}
      />
    ) : (
      <>
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
      </>
    )}
  </TweenedTransform>
);

/**
 * Which of the pallet's layers a freed board still visually belongs to:
 * a board lying untouched on its berth keeps its place in the stack (a
 * stringer slid out of the sandwich stays under the deck), and a board
 * that's been moved — or whose pallet has — is just loose stock on top.
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
