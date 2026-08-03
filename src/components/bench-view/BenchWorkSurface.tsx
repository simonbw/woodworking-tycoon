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
  PryTarget,
  pryTargets,
  rowLayout,
  strokeSurfaceSize,
} from "../../game/bench-work/workpiece";
import {
  PALLET_HEIGHT_IN,
  PALLET_WIDTH_IN,
  palletBoardSlot,
  palletNailPosition,
} from "../../game/bench-work/pallet-geometry";
import {
  emitBenchDustAction,
  finishAttendedWorkAction,
  pryPalletNailAction,
} from "../../game/game-actions/operation-actions";
import { operateMachineAction } from "../../game/game-actions/player-actions";
import { isBenchType, Machine } from "../../game/Machine";
import { Board, MaterialInstance, Pallet } from "../../game/Materials";
import { machineCanOperate, shopSupply } from "../../game/machine-helpers";
import { clampsFor } from "../../game/Clamp";
import { ToolId } from "../../game/Tool";
import { INCHES_PER_FOOT } from "../../game/shop-scale";
import { toolIconSrc } from "../../utils/uiImages";
import { useApplyGameAction, useGameState } from "../useGameState";
import { BenchPointerEvent, makeBenchPointerBus } from "./benchPointer";
import { AssemblySurface, ASSEMBLY_GAP_IN } from "./AssemblySurface";
import { BenchBackdrop, TOOL_RAIL_HEIGHT } from "./BenchBackdrop";
import {
  BenchScene,
  LoosePiece,
  NAIL_HIT_RADIUS_IN,
  PiecePlacement,
} from "./BenchScene";
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

/** The freeform scene's frame when a pallet is (or was) on the bench:
 * the pallet plus a strip of open bench below it for loose stock. */
const PALLET_FRAME = {
  widthIn: PALLET_WIDTH_IN,
  heightIn: PALLET_HEIGHT_IN + 14,
};

/**
 * The bench view: the whole top of the bench at high zoom, rendered at
 * device resolution. Mounted tools hang on the rail across the top and
 * are taken in hand by clicking; the bench's contents lie on the wood —
 * a staged pallet pries apart nail by nail under the hammer, freed
 * boards stay right where they were nailed, and loose stock drags
 * around (R turns it, F flips it). Plan-driven scripts (sanding, the
 * saw, glue-ups, assembly) mount their own work surfaces over the same
 * wood. See docs/bench-minigames.md. The world does not stop while
 * it's open.
 */
export const BenchWorkSurface: React.FC<{ machine: Machine }> = ({
  machine,
}) => {
  const gameState = useGameState();
  const applyAction = useApplyGameAction();
  const script = benchScriptFor(machine, gameState.progression);
  const bus = useMemo(makeBenchPointerBus, []);
  const [progress, setProgress] = useState(0);
  const [stageLine, setStageLine] = useState<string | null>(null);
  const lastDust = useRef(0);
  const { active, poke } = useActivityFlag();

  // ---------------------------------------------------------- the stage
  // The canvas takes the size the sheet gives it, measured for real —
  // rendering at CSS size × devicePixelRatio is the whole blur fix.
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
  const [prying, setPrying] = useState<PryTarget | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragOffset = useRef({ dxIn: 0, dyIn: 0 });
  /** Where each loose piece lies — ephemeral view state (decision 3). */
  const placements = useRef(new Map<string, PiecePlacement>());
  /** The berth the next unseen piece should land on (a freed board). */
  const pendingBerth = useRef<PiecePlacement | null>(null);
  const overflowCount = useRef(0);
  const [, bump] = useReducer((c: number) => c + 1, 0);
  const pryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (pryTimer.current) clearTimeout(pryTimer.current);
    },
    [],
  );
  const cursorRef = useRef<HTMLImageElement | null>(null);
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
  const railHeight = rail ? TOOL_RAIL_HEIGHT : 0;
  const workRect: StageRect | null = stageSize
    ? {
        x: 0,
        y: railHeight,
        width: stageSize.width,
        height: stageSize.height - railHeight,
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
  const scenePallet: Pallet | null =
    sceneActive && script?.kind === "pry" ? script.pallet : null;
  const targets = scenePallet ? pryTargets(scenePallet) : [];
  const loose: ReadonlyArray<MaterialInstance> = sceneActive
    ? machine.inputMaterials.filter((m) => m !== scenePallet)
    : [];
  // The pallet's frame outlives the pallet: freed boards keep lying on
  // their berths after the last stringer comes off.
  const palletFrame =
    scenePallet !== null || loose.some((m) => placements.current.has(m.id));

  let sceneFit: StageFit | null = null;
  if (sceneActive && workRect) {
    const layout = palletFrame ? null : rowLayout(loose, 4);
    sceneFit = fitToStage(
      palletFrame
        ? PALLET_FRAME
        : {
            widthIn: Math.max(layout!.size.widthIn, 24),
            heightIn: Math.max(layout!.size.heightIn, 16),
          },
      workRect,
    );
    // Seat every unseen piece: a just-freed board lands on its berth,
    // anything else on open bench below the pallet (or its row slot).
    for (const material of loose) {
      if (placements.current.has(material.id)) continue;
      if (pendingBerth.current) {
        placements.current.set(material.id, pendingBerth.current);
        pendingBerth.current = null;
      } else if (layout) {
        const slot = layout.slots.find((s) => s.material === material);
        placements.current.set(material.id, {
          xIn: (slot?.xIn ?? 0) + (slot?.widthIn ?? 8) / 2,
          yIn: layout.size.heightIn / 2,
          angleDeg: 0,
          flipped: false,
        });
      } else {
        const n = overflowCount.current++;
        placements.current.set(material.id, {
          xIn: 10 + (n % 4) * 9,
          yIn: PALLET_HEIGHT_IN + 7 + Math.floor(n / 4) * 3,
          angleDeg: 90,
          flipped: false,
        });
      }
    }
    // Forget pieces that left the bench
    for (const id of [...placements.current.keys()]) {
      if (!loose.some((m) => m.id === id)) placements.current.delete(id);
    }
  }
  const loosePieces: ReadonlyArray<LoosePiece> = sceneFit
    ? loose.map((material) => ({
        material,
        placement: placements.current.get(material.id)!,
      }))
    : [];

  const hasHammer = machine.state.tools.includes("hammer");
  const hammerHeld = heldTool === "hammer";

  const beginPry = useCallback(
    (target: PryTarget) => {
      if (!scenePallet || !sceneFit) return;
      setPrying(target);
      const fit = sceneFit;
      const stringersLeft = scenePallet.stringerBoardsLeft;
      pryTimer.current = setTimeout(() => {
        setPrying(null);
        // The freed board keeps lying on its berth. A stringer pull
        // frees the bottom-most remaining stringer's berth (the count is
        // what the pallet tracks), a deck pull frees exactly its own.
        const berth = palletBoardSlot(
          target.kind === "stringer"
            ? { kind: "stringer", index: Math.max(stringersLeft - 1, 0) }
            : target,
        );
        pendingBerth.current = {
          xIn: berth.xIn,
          yIn: berth.yIn,
          angleDeg: berth.angleDeg,
          flipped: false,
        };
        applyAction(pryPalletNailAction(machine, target));
        // The nail's flight to the supplies tally, from where it was
        const rect = wrapRef.current?.getBoundingClientRect();
        if (rect) {
          const at = palletNailPosition(target);
          flyToSupply(
            "nails",
            rect.left + fit.originX + at.xIn * fit.pxPerIn,
            rect.top + fit.originY + at.yIn * fit.pxPerIn,
          );
        }
      }, PRY_MS);
    },
    [applyAction, machine, sceneFit, scenePallet],
  );

  /** Point-in-piece test in scene inches, honoring the piece's turn. */
  const pieceAt = useCallback(
    (xIn: number, yIn: number): LoosePiece | null => {
      for (let i = loosePieces.length - 1; i >= 0; i--) {
        const piece = loosePieces[i];
        const size = pieceSize(piece.material);
        const rad = (-piece.placement.angleDeg * Math.PI) / 180;
        const dx = xIn - piece.placement.xIn;
        const dy = yIn - piece.placement.yIn;
        const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
        const localY = dx * Math.sin(rad) + dy * Math.cos(rad);
        if (
          Math.abs(localX) <= size.widthIn / 2 + 0.5 &&
          Math.abs(localY) <= size.heightIn / 2 + 0.5
        ) {
          return piece;
        }
      }
      return null;
    },
    [loosePieces],
  );

  const sceneHandler = useCallback(
    (event: BenchPointerEvent) => {
      if (event.type === "leave") {
        setHoveredId(null);
        setDraggingId(null);
        return;
      }
      const { xIn, yIn } = event;
      if (event.type === "down") {
        if (prying) return;
        if (hammerHeld && scenePallet) {
          const hit = targets.find((target) => {
            const at = palletNailPosition(target);
            return Math.hypot(at.xIn - xIn, at.yIn - yIn) <= NAIL_HIT_RADIUS_IN;
          });
          if (hit) beginPry(hit);
          return;
        }
        if (heldTool) return;
        const hit = pieceAt(xIn, yIn);
        if (hit) {
          setDraggingId(hit.material.id);
          dragOffset.current = {
            dxIn: hit.placement.xIn - xIn,
            dyIn: hit.placement.yIn - yIn,
          };
        }
        return;
      }
      if (event.type === "move") {
        if (draggingId && event.held && sceneFit) {
          const placement = placements.current.get(draggingId);
          if (placement) {
            placements.current.set(draggingId, {
              ...placement,
              xIn: Math.min(
                Math.max(xIn + dragOffset.current.dxIn, 0),
                sceneFit.widthIn,
              ),
              yIn: Math.min(
                Math.max(yIn + dragOffset.current.dyIn, 0),
                sceneFit.heightIn,
              ),
            });
            bump();
          }
          return;
        }
        if (draggingId) setDraggingId(null);
        setHoveredId(
          heldTool ? null : (pieceAt(xIn, yIn)?.material.id ?? null),
        );
        return;
      }
      if (event.type === "up") setDraggingId(null);
    },
    [
      beginPry,
      draggingId,
      hammerHeld,
      heldTool,
      pieceAt,
      prying,
      sceneFit,
      scenePallet,
      targets,
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
        return;
      }
      const id = draggingId ?? hoveredId;
      if (!id) return;
      if (event.code !== "KeyR" && event.code !== "KeyF") return;
      const placement = placements.current.get(id);
      if (!placement) return;
      event.preventDefault();
      event.stopPropagation();
      placements.current.set(
        id,
        event.code === "KeyR"
          ? { ...placement, angleDeg: (placement.angleDeg + 90) % 360 }
          : { ...placement, flipped: !placement.flipped },
      );
      bump();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [sceneActive, heldTool, draggingId, hoveredId]);

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

  if (!isBench && !script) {
    return null;
  }

  // The cure runs on the clock; the bench just says so
  if (curing) {
    return (
      <div
        className="rounded border-2 border-ink-black/20 bg-manila-dark/40 px-3 py-2 font-condensed uppercase tracking-[0.15em] text-[0.7rem] text-ink-fade"
        data-testid="bench-work"
        data-script="curing"
      >
        In the clamps — the glue cures on its own. Work something else.
      </div>
    );
  }

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
      instruction: scenePallet
        ? !hasHammer
          ? "A mounted hammer would pry those nails loose."
          : hammerHeld
            ? "Press a nail to pry it. Every board comes off one pull at a time."
            : "Take the hammer down off the rail."
        : loosePieces.length > 0
          ? "Loose stock on the bench. Drag to arrange it — R turns, F flips."
          : "The bench is clear. Set stock down on it with F.",
      progressLine: scenePallet ? `${targets.length} nails left` : null,
      node: (
        <BenchScene
          pallet={scenePallet}
          targets={targets}
          pieces={loosePieces}
          fit={sceneFit}
          hammerHeld={hammerHeld}
          prying={prying}
          hoveredId={hoveredId}
          draggingId={draggingId}
        />
      ),
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
        cursorRef.current.style.transform = `translate(${x - 12}px, ${y - 38}px)`;
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

  const scriptName = surfaceScript
    ? surfaceScript.kind
    : scenePallet
      ? "pry"
      : "idle";

  return (
    <div
      className="space-y-1"
      data-testid="bench-work"
      data-script={scriptName}
      data-progress={progress}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-condensed uppercase tracking-[0.15em] text-[0.7rem] text-ink-fade">
          {surface?.instruction ?? ""}
        </p>
        {surface?.progressLine && (
          <span className="shrink-0 whitespace-nowrap font-condensed text-[0.7rem] text-ink-fade tabular-nums">
            {surface.progressLine}
          </span>
        )}
      </div>
      <div
        ref={wrapRef}
        className={`relative select-none touch-none overflow-hidden rounded border-2 border-ink-black/40 shadow-inner ${
          heldTool
            ? "cursor-none"
            : sceneActive
              ? "cursor-default"
              : "cursor-crosshair"
        }`}
        style={{ width: "100%", height: "min(52vh, 560px)", minHeight: 320 }}
        data-testid="bench-stage"
        data-px-per-in={surface ? surface.fit.pxPerIn.toFixed(4) : undefined}
        data-origin-x={surface ? surface.fit.originX.toFixed(2) : undefined}
        data-origin-y={surface ? surface.fit.originY.toFixed(2) : undefined}
        onPointerDown={handlePointer("down")}
        onPointerMove={handlePointer("move")}
        onPointerUp={handlePointer("up")}
        onPointerLeave={handlePointer("leave")}
        onContextMenu={(event) => {
          if (heldTool) {
            event.preventDefault();
            setHeldTool(null);
          }
        }}
      >
        {stageSize && (
          <Application
            width={stageSize.width}
            height={stageSize.height}
            backgroundAlpha={0}
            antialias={true}
            autoDensity={true}
            resolution={Math.min(window.devicePixelRatio || 1, 2)}
          >
            <BenchBackdrop
              width={stageSize.width}
              height={stageSize.height}
              rail={rail}
            />
            {surface?.node}
          </Application>
        )}
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
        {heldTool && (
          <img
            ref={cursorRef}
            src={toolIconSrc(heldTool)}
            alt=""
            draggable={false}
            className={`pointer-events-none absolute left-0 top-0 z-10 size-12 select-none [image-rendering:pixelated] drop-shadow-[0_4px_5px_rgba(0,0,0,0.5)] ${
              prying ? "bench-pry-swing" : ""
            }`}
            style={{
              transform: pointerPos.current
                ? `translate(${pointerPos.current.x - 12}px, ${pointerPos.current.y - 38}px)`
                : "translate(-100px, -100px)",
            }}
          />
        )}
      </div>
    </div>
  );
};
