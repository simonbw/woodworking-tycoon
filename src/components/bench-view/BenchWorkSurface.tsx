import { Application } from "@pixi/react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  BenchScript,
  benchScriptFor,
  pieceSize,
  rowLayout,
  strokeSurfaceSize,
} from "../../game/bench-work/workpiece";
import {
  BenchPlacement,
  benchPlacementFor,
  benchPointOnPallet,
  benchTopSizeIn,
  palletPointOnBench,
} from "../../game/bench-work/bench-layout";
import {
  faceNails,
  PALLET_HEIGHT_IN,
  PALLET_WIDTH_IN,
  palletNailPosition,
} from "../../game/bench-work/pallet-geometry";
import {
  arrangeBenchMaterialAction,
  emitBenchDustAction,
  finishAttendedWorkAction,
  pryPalletNailAction,
} from "../../game/game-actions/operation-actions";
import {
  operateMachineAction,
  takeInputsFromMachineAction,
} from "../../game/game-actions/player-actions";
import { isBenchType, Machine } from "../../game/Machine";
import {
  Board,
  MaterialInstance,
  Pallet,
  PalletNail,
} from "../../game/Materials";
import { machineCanOperate, shopSupply } from "../../game/machine-helpers";
import { clampsFor } from "../../game/Clamp";
import { ToolId } from "../../game/Tool";
import { INCHES_PER_FOOT } from "../../game/shop-scale";
import { toolIconSrc } from "../../utils/uiImages";
import { useApplyGameAction, useGameState } from "../useGameState";
import { StatusText } from "../station/StatusText";
import { BenchPointerEvent, makeBenchPointerBus } from "./benchPointer";
import { AssemblySurface, ASSEMBLY_GAP_IN } from "./AssemblySurface";
import { BenchScene, LoosePiece, NAIL_HIT_RADIUS_IN } from "./BenchScene";
import { BenchSceneBackdrop } from "./BenchSceneBackdrop";
import { BenchToolRail } from "./BenchToolRail";
import { flyToSupply } from "./flyToSupply";
import { GlueSurface, GLUE_GAP_IN } from "./GlueSurface";
import { SawSurface } from "./SawSurface";
import { StrokeSurface } from "./StrokeSurface";
import { fitToStage, pointerToInches, StageFit, StageRect } from "./stageMath";
import { useActivityFlag, useWorkFoley } from "./useWorkFoley";

/** Continuous foley per interactive operation family. */
function foleyClipFor(operationId: string): string | null {
  if (operationId.startsWith("block")) return "hand-sanding";
  if (operationId.startsWith("orbit")) return "orbital-sander";
  if (operationId.startsWith("handPlane")) return "hand-sanding";
  if (operationId === "handSawCut") return "pallet-dismantle";
  return null;
}

/** How long one pry takes, press to commit — the animation IS the pacing. */
export const PRY_MS = 280;

/** Dust lands about twice a second while the tool is moving. */
const DUST_THROTTLE_MS = 500;

/** Open floor kept around the bench in the scene frame, in inches. */
const FRAME_MARGIN_IN = 9;

/** Canvas kept clear for the floating chrome, in px. */
const TOP_CHROME_PX = 96;
const BOTTOM_CHROME_PX = 96;
const SIDE_CHROME_PX = 24;

/**
 * The bench view: the whole bench at high zoom, filling the window — the
 * same concrete floor and the same bench art the shop view draws, leaned
 * into (BenchSceneBackdrop), with the bench's contents lying on it
 * exactly where the persistent bench layout says they lie. Mounted tools
 * hang on the floating rail and are taken in hand by clicking; a staged
 * pallet pries apart nail by nail under the hammer, freed boards stay
 * right where they were nailed, and loose stock drags around (R turns
 * it, F flips it) — every arrangement committed to game state, so it
 * shows on the shop floor too. Plan-driven scripts (sanding, the saw,
 * glue-ups, assembly) mount their own work surfaces over the same scene.
 * See docs/bench-minigames.md. The world does not stop while it's open.
 */
export const BenchWorkSurface: React.FC<{
  machine: Machine;
  onClose: () => void;
}> = ({ machine, onClose }) => {
  const gameState = useGameState();
  const applyAction = useApplyGameAction();
  const script = benchScriptFor(machine, gameState.progression);
  const bus = useMemo(makeBenchPointerBus, []);
  const [progress, setProgress] = useState(0);
  const [stageLine, setStageLine] = useState<string | null>(null);
  const lastDust = useRef(0);
  const { active, poke } = useActivityFlag();

  // ---------------------------------------------------------- the stage
  // The canvas takes the whole window, measured for real — rendering at
  // CSS size × devicePixelRatio is the whole blur fix.
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [stageSize, setStageSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      if (width > 0 && height > 0) {
        setStageSize((current) =>
          current?.width === width && current?.height === height
            ? current
            : { width, height },
        );
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ---------------------------------------------------------- the hands
  const [heldTool, setHeldTool] = useState<ToolId | null>(null);
  const [prying, setPrying] = useState<PalletNail | null>(null);
  const [hoveredNail, setHoveredNail] = useState<PalletNail | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragOffset = useRef({ dxIn: 0, dyIn: 0 });
  /** The dragged piece's live placement, committed on release — the one
   * sliver of layout that is view state, and only mid-gesture. */
  const dragPlacement = useRef<BenchPlacement | null>(null);
  const [, bump] = useReducer((c: number) => c + 1, 0);
  const pryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (pryTimer.current) clearTimeout(pryTimer.current);
    },
    [],
  );
  const cursorRef = useRef<HTMLDivElement | null>(null);
  const pointerPos = useRef<{ x: number; y: number } | null>(null);
  const fitRef = useRef<StageFit | null>(null);

  const canOperate = machineCanOperate(machine, shopSupply(gameState));

  const onWork = useCallback(() => {
    poke();
    const now = performance.now();
    if (now - lastDust.current >= DUST_THROTTLE_MS) {
      lastDust.current = now;
      applyAction(emitBenchDustAction(machine));
    }
  }, [applyAction, machine, poke]);

  const start = useCallback(
    () => applyAction(operateMachineAction(machine)),
    [applyAction, machine],
  );
  const finish = useCallback(
    () => applyAction(finishAttendedWorkAction(machine)),
    [applyAction, machine],
  );
  const commitWhole = useCallback(() => {
    // Glue and assembly resolve start and finish back to back: spend the
    // supplies, tie up the clamps, and either the product appears or the
    // cure begins — the single principled commit (decision 4's middle).
    applyAction(operateMachineAction(machine));
    applyAction(finishAttendedWorkAction(machine));
  }, [applyAction, machine]);

  const onProgress = useCallback((fraction: number) => {
    setProgress((previous) => {
      const next = Math.round(fraction * 100);
      return next === previous ? previous : next;
    });
  }, []);

  // -------------------------------------------------------- mode picking
  const rail = machine.toolSlots > 0;
  const workRect: StageRect | null = stageSize
    ? {
        x: SIDE_CHROME_PX,
        y: TOP_CHROME_PX,
        width: stageSize.width - SIDE_CHROME_PX * 2,
        height: stageSize.height - TOP_CHROME_PX - BOTTOM_CHROME_PX,
      }
    : null;

  const started =
    script?.kind === "stroke" || script?.kind === "saw"
      ? script.started
      : machine.operationProgress.status === "inProgress";
  const surfaceScript =
    script &&
    (script.kind === "stroke" ||
      script.kind === "saw" ||
      script.kind === "glue" ||
      script.kind === "assembly") &&
    (canOperate || started)
      ? script
      : null;
  const curing = script?.kind === "curing";
  const isBench = isBenchType(machine.type);
  const sceneActive = isBench && !surfaceScript && !curing;

  // ---------------------------------------------------------- the scene
  // The scene frame: the bench top plus enough floor around it to hold a
  // staged pallet's overhang. Constant per bench type, so the zoom never
  // jumps as boards come and go.
  const benchSize = benchTopSizeIn(machine.type);
  const frame = useMemo(
    () => ({
      widthIn:
        Math.max(benchSize.widthIn, PALLET_WIDTH_IN) + FRAME_MARGIN_IN * 2,
      heightIn:
        Math.max(benchSize.heightIn, PALLET_HEIGHT_IN) + FRAME_MARGIN_IN * 2,
    }),
    [benchSize.widthIn, benchSize.heightIn],
  );
  const benchOriginIn = {
    xIn: (frame.widthIn - benchSize.widthIn) / 2,
    yIn: (frame.heightIn - benchSize.heightIn) / 2,
  };
  const scenePallet: Pallet | null =
    sceneActive && script?.kind === "pry" ? script.pallet : null;
  const loose: ReadonlyArray<MaterialInstance> = sceneActive
    ? machine.inputMaterials.filter((m) => m !== scenePallet)
    : [];

  // The whole-frame fit paints the backdrop; the scene works in
  // bench-top inches (origin at the bench's top-left), which is also the
  // space placements persist in (bench-work/bench-layout.ts).
  let frameFit: StageFit | null = null;
  let sceneFit: StageFit | null = null;
  if (workRect) {
    frameFit = fitToStage(frame, workRect);
    sceneFit = {
      ...frameFit,
      originX: frameFit.originX + benchOriginIn.xIn * frameFit.pxPerIn,
      originY: frameFit.originY + benchOriginIn.yIn * frameFit.pxPerIn,
      widthIn: benchSize.widthIn,
      heightIn: benchSize.heightIn,
    };
  }

  const placementOf = useCallback(
    (material: MaterialInstance): BenchPlacement =>
      draggingId === material.id && dragPlacement.current
        ? dragPlacement.current
        : benchPlacementFor(machine, material),
    [draggingId, machine],
  );
  const loosePieces: ReadonlyArray<LoosePiece> = loose.map((material) => ({
    material,
    placement: placementOf(material),
  }));
  // The pallet is arranged like any piece — dragged, turned, flipped —
  // through the same placement store (default: squarely centered).
  const palletPlacement: BenchPlacement | null = scenePallet
    ? placementOf(scenePallet)
    : null;
  // Only the shown face's nails are on offer; the rest are driven from
  // the other side, and F turns the pallet over to get at them.
  const targets =
    scenePallet && palletPlacement
      ? faceNails(scenePallet, palletPlacement.flipped)
      : [];

  const hasHammer = machine.state.tools.includes("hammer");
  const hammerHeld = heldTool === "hammer";

  const nailAt = useCallback(
    (xIn: number, yIn: number): PalletNail | null => {
      if (!palletPlacement) return null;
      // The pointer, carried into the pallet's own frame — then nearest
      // wins: neighboring crossings can sit closer together than the
      // hit radius, and the pointer means the closest one.
      const local = benchPointOnPallet(palletPlacement, xIn, yIn);
      let best: PalletNail | null = null;
      let bestDist = NAIL_HIT_RADIUS_IN;
      for (const target of targets) {
        const at = palletNailPosition(target);
        const dist = Math.hypot(at.xIn - local.xIn, at.yIn - local.yIn);
        if (dist <= bestDist) {
          best = target;
          bestDist = dist;
        }
      }
      return best;
    },
    [targets, palletPlacement],
  );

  const lastPryAt = useRef(0);
  const beginPry = useCallback(
    (target: PalletNail) => {
      if (!scenePallet || !sceneFit) return;
      // The press is the commit: one action frees the board AND seats it
      // on its berth in the bench layout (see pryPalletNailAction) —
      // nothing to hand off, nothing to pop. The swing and lever line
      // are pure presentation over the already-settled pull.
      lastPryAt.current = performance.now();
      applyAction(pryPalletNailAction(machine, target));
      setPrying(target);
      if (pryTimer.current) clearTimeout(pryTimer.current);
      pryTimer.current = setTimeout(() => setPrying(null), PRY_MS);
      // The nail's flight to the supplies tally, from where it was
      const rect = wrapRef.current?.getBoundingClientRect();
      if (rect && palletPlacement) {
        const local = palletNailPosition(target);
        const at = palletPointOnBench(palletPlacement, local.xIn, local.yIn);
        flyToSupply(
          "nails",
          rect.left + sceneFit.originX + at.xIn * sceneFit.pxPerIn,
          rect.top + sceneFit.originY + at.yIn * sceneFit.pxPerIn,
        );
      }
    },
    [applyAction, machine, sceneFit, scenePallet, palletPlacement],
  );

  /** Point-in-piece test in bench inches, honoring the piece's turn.
   * Loose stock picks first (it lies on top); the pallet underneath
   * takes the grab when nothing smaller is under the pointer. */
  const pieceAt = useCallback(
    (xIn: number, yIn: number): LoosePiece | null => {
      const hits = (piece: LoosePiece): boolean => {
        const size = pieceSize(piece.material);
        const rad = (-piece.placement.angleDeg * Math.PI) / 180;
        const dx = xIn - piece.placement.xIn;
        const dy = yIn - piece.placement.yIn;
        const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
        const localY = dx * Math.sin(rad) + dy * Math.cos(rad);
        return (
          Math.abs(localX) <= size.widthIn / 2 + 0.5 &&
          Math.abs(localY) <= size.heightIn / 2 + 0.5
        );
      };
      for (let i = loosePieces.length - 1; i >= 0; i--) {
        if (hits(loosePieces[i])) return loosePieces[i];
      }
      if (scenePallet && palletPlacement) {
        const pallet = { material: scenePallet, placement: palletPlacement };
        if (hits(pallet)) return pallet;
      }
      return null;
    },
    [loosePieces, scenePallet, palletPlacement],
  );

  const commitDrag = useCallback(() => {
    if (draggingId && dragPlacement.current) {
      applyAction(
        arrangeBenchMaterialAction(machine, draggingId, dragPlacement.current),
      );
    }
    dragPlacement.current = null;
    setDraggingId(null);
  }, [applyAction, draggingId, machine]);

  const sceneHandler = useCallback(
    (event: BenchPointerEvent) => {
      if (event.type === "leave") {
        setHoveredId(null);
        setHoveredNail(null);
        commitDrag();
        return;
      }
      const { xIn, yIn } = event;
      if (event.type === "down") {
        // One pull per swing — clocked, not gated on the animation state,
        // so a throttled timer can never eat a press
        if (performance.now() - lastPryAt.current < PRY_MS) return;
        if (hammerHeld && scenePallet) {
          const hit = nailAt(xIn, yIn);
          if (hit) beginPry(hit);
          return;
        }
        if (heldTool) return;
        const hit = pieceAt(xIn, yIn);
        if (hit) {
          setDraggingId(hit.material.id);
          dragPlacement.current = hit.placement;
          dragOffset.current = {
            dxIn: hit.placement.xIn - xIn,
            dyIn: hit.placement.yIn - yIn,
          };
        }
        return;
      }
      if (event.type === "move") {
        if (draggingId && event.held && dragPlacement.current) {
          // The stage edge is the wall — the whole visible frame is
          // droppable, bench overhang included.
          dragPlacement.current = {
            ...dragPlacement.current,
            xIn: Math.min(
              Math.max(xIn + dragOffset.current.dxIn, -benchOriginIn.xIn + 1),
              frame.widthIn - benchOriginIn.xIn - 1,
            ),
            yIn: Math.min(
              Math.max(yIn + dragOffset.current.dyIn, -benchOriginIn.yIn + 1),
              frame.heightIn - benchOriginIn.yIn - 1,
            ),
          };
          bump();
          return;
        }
        if (draggingId) {
          commitDrag();
        }
        setHoveredId(
          heldTool ? null : (pieceAt(xIn, yIn)?.material.id ?? null),
        );
        setHoveredNail(hammerHeld && !prying ? nailAt(xIn, yIn) : null);
        return;
      }
      if (event.type === "up") commitDrag();
    },
    [
      beginPry,
      benchOriginIn.xIn,
      benchOriginIn.yIn,
      commitDrag,
      draggingId,
      frame.widthIn,
      frame.heightIn,
      hammerHeld,
      heldTool,
      nailAt,
      pieceAt,
      prying,
      scenePallet,
    ],
  );
  useEffect(() => {
    if (sceneActive) return bus.register(sceneHandler);
  }, [bus, sceneActive, sceneHandler]);

  // R turns and F flips the piece under the pointer; Escape hangs the
  // held tool back up. Captured ahead of the floor's own key routing —
  // the sheet is deliberately not a modal, so the floor's R (settings)
  // and F (put down) stay live whenever the hands aren't on a piece.
  useEffect(() => {
    if (!sceneActive) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (heldTool && event.code === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setHeldTool(null);
        setHoveredNail(null);
        return;
      }
      // With the hammer in hand, F turns the pallet over without putting
      // the hammer down — the rest of the nails are on the other side.
      if (heldTool) {
        if (
          event.code === "KeyF" &&
          scenePallet &&
          palletPlacement &&
          !draggingId
        ) {
          event.preventDefault();
          event.stopPropagation();
          setHoveredNail(null);
          applyAction(
            arrangeBenchMaterialAction(machine, scenePallet.id, {
              ...palletPlacement,
              flipped: !palletPlacement.flipped,
            }),
          );
        }
        return;
      }
      const id = draggingId ?? hoveredId;
      if (!id) return;
      const material = machine.inputMaterials.find((m) => m.id === id);
      if (!material) return;
      // E takes the piece under the hand — the one being dragged or
      // moused over, never just the first in the bay.
      if (event.code === "KeyE" && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        dragPlacement.current = null;
        setDraggingId(null);
        setHoveredId(null);
        applyAction(takeInputsFromMachineAction([material], machine));
        return;
      }
      if (event.code !== "KeyR" && event.code !== "KeyF") return;
      event.preventDefault();
      event.stopPropagation();
      const current =
        draggingId === id && dragPlacement.current
          ? dragPlacement.current
          : benchPlacementFor(machine, material);
      const turned: BenchPlacement =
        event.code === "KeyR"
          ? { ...current, angleDeg: current.angleDeg + 90 }
          : { ...current, flipped: !current.flipped };
      if (draggingId === id) {
        // Mid-drag the turn rides the drag; the release commits both
        dragPlacement.current = turned;
        bump();
      } else {
        applyAction(arrangeBenchMaterialAction(machine, id, turned));
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [
    sceneActive,
    heldTool,
    draggingId,
    hoveredId,
    machine,
    applyAction,
    scenePallet,
    palletPlacement,
  ]);

  // Hang the tool up when the hands leave the scene (a script mounts,
  // the pallet is cleared away, the sheet re-renders into another mode).
  useEffect(() => {
    if (!sceneActive && heldTool) setHeldTool(null);
  }, [sceneActive, heldTool]);

  const foleyClip =
    script && (script.kind === "stroke" || script.kind === "saw")
      ? foleyClipFor(script.operation.id)
      : null;
  useWorkFoley(foleyClip, active);

  const surface = buildSurface();

  function buildSurface(): {
    fit: StageFit;
    instruction: string;
    node: React.ReactNode;
    progressLine: string | null;
  } | null {
    if (!workRect) return null;
    if (surfaceScript) {
      switch (surfaceScript.kind) {
        case "stroke": {
          const s = surfaceScript as Extract<BenchScript, { kind: "stroke" }>;
          const band =
            s.interaction.kind === "stroke"
              ? (s.interaction.band ?? "face")
              : "face";
          const fit = fitToStage(
            strokeSurfaceSize(s.workpiece, band),
            workRect,
          );
          const finished = finishedPreview(s);
          const interaction = s.interaction as Extract<
            typeof s.interaction,
            { kind: "stroke" }
          >;
          return {
            fit,
            instruction:
              band === "edge"
                ? "Run the plane along the edge until it cuts clean end to end."
                : s.operation.id.startsWith("handPlane")
                  ? "Work the plane across the face until the whole board cuts clean."
                  : "Rub the whole face down. The wood shows you where you've been.",
            progressLine: `${progress}%`,
            node: (
              <StrokeSurface
                interaction={interaction}
                workpiece={s.workpiece}
                finished={finished}
                fit={fit}
                bus={bus}
                started={s.started}
                onFirstStroke={start}
                onComplete={finish}
                onWork={onWork}
                onProgress={onProgress}
              />
            ),
          };
        }
        case "saw": {
          const s = surfaceScript as Extract<BenchScript, { kind: "saw" }>;
          const board = s.workpiece as Board;
          const fit = fitToStage(
            {
              widthIn: board.width,
              heightIn: board.length * INCHES_PER_FOOT,
            },
            workRect,
          );
          return {
            fit,
            instruction: s.started
              ? "Saw along the line — long, even push and pull."
              : "Press on the line to start the cut. Z and X slide it; R swings the angle.",
            progressLine: `${progress}%`,
            node: (
              <SawSurface
                machine={machine}
                interaction={
                  s.interaction as Extract<
                    typeof s.interaction,
                    { kind: "saw" }
                  >
                }
                workpiece={board}
                fit={fit}
                bus={bus}
                started={s.started}
                onMark={start}
                onComplete={finish}
                onWork={onWork}
                onProgress={onProgress}
              />
            ),
          };
        }
        case "glue": {
          const s = surfaceScript as Extract<BenchScript, { kind: "glue" }>;
          const layout = rowLayout(s.pieces, GLUE_GAP_IN);
          const fit = fitToStage(layout.size, workRect);
          const clampsNeeded = clampsFor(s.operation);
          return {
            fit,
            instruction:
              stageLine ?? "Spread glue down each open joint, edge to edge.",
            progressLine: null,
            node: (
              <GlueSurface
                pieces={s.pieces}
                requiredClamps={clampsNeeded}
                fit={fit}
                bus={bus}
                onCommit={commitWhole}
                onWork={onWork}
                onStage={(stage, done, total) =>
                  setStageLine(
                    stage === "spread"
                      ? `Spread glue down each open joint (${done}/${total}).`
                      : stage === "butt"
                        ? `Press each piece to butt the joint closed (${done}/${total}).`
                        : `Set the clamps (${done}/${total}). The last one starts the cure.`,
                  )
                }
              />
            ),
          };
        }
        case "assembly": {
          const s = surfaceScript as Extract<BenchScript, { kind: "assembly" }>;
          const layout = rowLayout(s.pieces, ASSEMBLY_GAP_IN);
          const fit = fitToStage(layout.size, workRect);
          return {
            fit,
            instruction:
              stageLine ?? "Press each outline to set its piece in place.",
            progressLine: null,
            node: (
              <AssemblySurface
                pieces={s.pieces}
                fasteners={s.operation.requiredConsumables ?? []}
                fit={fit}
                bus={bus}
                onCommit={commitWhole}
                onStage={(snapped, driven, fastenerTotal) =>
                  setStageLine(
                    snapped < s.pieces.length
                      ? `Press each outline to set its piece in place (${snapped}/${s.pieces.length}).`
                      : fastenerTotal > 0
                        ? `Drive the fasteners (${driven}/${fastenerTotal}).`
                        : "Fit the last piece.",
                  )
                }
              />
            ),
          };
        }
      }
    }
    if (!sceneFit) return null;
    return {
      fit: sceneFit,
      instruction: curing
        ? "In the clamps — the glue cures on its own. Work something else."
        : scenePallet
          ? !hasHammer
            ? "A mounted hammer would pry those nails loose."
            : targets.length === 0 && scenePallet.nails.length > 0
              ? "The rest are nailed from the other side. Press F to flip the pallet."
              : hammerHeld
                ? "Press a nail to pry it loose."
                : "Take the hammer down off the rail."
          : loosePieces.length > 0
            ? "Loose stock on the bench. Drag to arrange it."
            : "The bench is clear. Set stock down on it with F.",
      progressLine: scenePallet
        ? `${scenePallet.nails.length} nails left`
        : null,
      node: sceneActive ? (
        <BenchScene
          pallet={scenePallet}
          palletPlacement={palletPlacement}
          pieces={loosePieces}
          fit={sceneFit}
          hammerHeld={hammerHeld}
          prying={prying}
          hoveredNail={hoveredNail}
          hoveredId={hoveredId}
          draggingId={draggingId}
        />
      ) : null,
    };
  }

  function finishedPreview(
    s: Extract<BenchScript, { kind: "stroke" }>,
  ): MaterialInstance | null {
    try {
      const out = s.operation.output(
        [s.workpiece],
        machine.resolvedParameters(s.operation),
      );
      return out.outputs[0] ?? null;
    } catch {
      return null;
    }
  }

  fitRef.current = surface?.fit ?? null;

  const handlePointer =
    (type: "down" | "move" | "up" | "leave") =>
    (event: React.PointerEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      pointerPos.current = { x, y };
      if (cursorRef.current) {
        cursorRef.current.style.transform = `translate(${x - 12}px, ${y - 11}px)`;
      }
      const fit = fitRef.current;
      if (!fit) return;
      const { xIn, yIn } = pointerToInches(
        fit,
        rect,
        event.clientX,
        event.clientY,
      );
      bus.dispatch({
        type,
        xIn,
        yIn,
        held: type === "move" ? event.buttons === 1 : type === "down",
      });
    };

  const scriptName = curing
    ? "curing"
    : surfaceScript
      ? surfaceScript.kind
      : scenePallet
        ? "pry"
        : "idle";

  if (!isBench && !script) {
    return null;
  }

  const keyHints: Array<[string, string]> = heldTool
    ? [
        ["Click", "pry a nail"],
        ...(scenePallet
          ? ([["F", "flip the pallet"]] as Array<[string, string]>)
          : []),
        ["Esc", "hang the hammer up"],
        ["Tab", "step back"],
      ]
    : [
        ...(loosePieces.length > 0 || scenePallet
          ? ([
              ["Drag", "move a piece"],
              ["R", "turn"],
              ["F", "flip"],
            ] as Array<[string, string]>)
          : []),
        ["E", "take back"],
        ["Tab", "step back"],
      ];

  return (
    <div
      className="absolute inset-0"
      data-testid="bench-work"
      data-script={scriptName}
      data-progress={progress}
    >
      <div
        ref={wrapRef}
        className={`absolute inset-0 select-none touch-none overflow-hidden bg-ink-black ${
          heldTool
            ? "cursor-none"
            : sceneActive
              ? "cursor-default"
              : "cursor-crosshair"
        }`}
        data-testid="bench-stage"
        data-px-per-in={surface ? surface.fit.pxPerIn.toFixed(4) : undefined}
        data-origin-x={surface ? surface.fit.originX.toFixed(2) : undefined}
        data-origin-y={surface ? surface.fit.originY.toFixed(2) : undefined}
        data-pallet-x={
          palletPlacement
            ? (palletPlacement.xIn - PALLET_WIDTH_IN / 2).toFixed(2)
            : undefined
        }
        data-pallet-y={
          palletPlacement
            ? (palletPlacement.yIn - PALLET_HEIGHT_IN / 2).toFixed(2)
            : undefined
        }
        onPointerDown={handlePointer("down")}
        onPointerMove={handlePointer("move")}
        onPointerUp={handlePointer("up")}
        onPointerLeave={handlePointer("leave")}
        onContextMenu={(event) => {
          if (heldTool) {
            event.preventDefault();
            setHeldTool(null);
            setHoveredNail(null);
          }
        }}
      >
        {stageSize && frameFit && (
          <Application
            width={stageSize.width}
            height={stageSize.height}
            backgroundAlpha={0}
            antialias={true}
            autoDensity={true}
            resolution={Math.min(window.devicePixelRatio || 1, 2)}
          >
            <BenchSceneBackdrop
              machine={machine}
              fit={frameFit}
              stageWidth={stageSize.width}
              stageHeight={stageSize.height}
            />
            {surface?.node}
          </Application>
        )}
        {heldTool && (
          // Two elements on purpose: the wrapper carries the cursor
          // translate, the img carries the pry rotation — composed on
          // one element the rotation would pivot about the pre-translate
          // origin (the window corner), reading as a swing from afar.
          <div
            ref={cursorRef}
            className="pointer-events-none absolute left-0 top-0 z-10"
            style={{
              transform: pointerPos.current
                ? `translate(${pointerPos.current.x - 12}px, ${pointerPos.current.y - 11}px)`
                : "translate(-100px, -100px)",
            }}
          >
            <img
              src={toolIconSrc(heldTool)}
              alt=""
              draggable={false}
              className={`size-12 select-none [image-rendering:pixelated] drop-shadow-[0_4px_5px_rgba(0,0,0,0.5)] ${
                prying ? "bench-pry-swing" : ""
              }`}
            />
          </div>
        )}
      </div>

      {/* The station's nameplate, floating over the scene */}
      <div className="pointer-events-auto absolute left-4 top-4 z-10 flex items-center gap-3 rounded bg-ink-black/70 px-3 py-1.5 shadow-lg">
        <h3 className="font-condensed font-bold uppercase tracking-wide text-paper-manila">
          {machine.type.name}
        </h3>
        <span className="font-condensed uppercase tracking-[0.15em] text-[0.65rem] text-paper-manila/60">
          <StatusText machine={machine} />
        </span>
        <button
          className="rounded border border-paper-manila/40 px-1.5 text-xs leading-relaxed text-paper-manila/80 hover:bg-paper-manila/10"
          onClick={onClose}
          aria-label="Close station sheet"
        >
          ✕
        </button>
      </div>

      {rail && (
        <BenchToolRail
          tools={machine.state.tools}
          heldTool={heldTool}
          interactive={sceneActive}
          onToggle={(toolId) =>
            setHeldTool((current) => (current === toolId ? null : toolId))
          }
        />
      )}

      {/* Instruction and key hints, floating below the bench */}
      <div className="pointer-events-none absolute inset-x-0 bottom-5 z-10 flex flex-col items-center gap-2">
        <div className="flex items-baseline gap-3 rounded bg-ink-black/70 px-3 py-1.5 shadow-lg">
          <p className="font-condensed uppercase tracking-[0.15em] text-[0.7rem] text-paper-manila">
            {surface?.instruction ?? ""}
          </p>
          {surface?.progressLine && (
            <span className="shrink-0 whitespace-nowrap font-condensed text-[0.7rem] text-paper-manila/70 tabular-nums">
              {surface.progressLine}
            </span>
          )}
        </div>
        {sceneActive && (
          <div className="flex gap-2">
            {keyHints.map(([key, label]) => (
              <span
                key={`${key}-${label}`}
                className="flex items-baseline gap-1.5 rounded bg-ink-black/60 px-2 py-1 font-condensed uppercase tracking-[0.12em] text-[0.62rem] text-paper-manila/70"
              >
                <kbd className="rounded border border-paper-manila/35 px-1 font-sans text-[0.6rem] normal-case text-paper-manila">
                  {key}
                </kbd>
                {label}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
