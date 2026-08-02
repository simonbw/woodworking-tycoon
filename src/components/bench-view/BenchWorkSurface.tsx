import { Application } from "@pixi/react";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  BenchScript,
  benchScriptFor,
  pryTargets,
  strokeSurfaceSize,
} from "../../game/bench-work/workpiece";
import {
  emitBenchDustAction,
  finishAttendedWorkAction,
  pryPalletNailAction,
} from "../../game/game-actions/operation-actions";
import { operateMachineAction } from "../../game/game-actions/player-actions";
import { Machine } from "../../game/Machine";
import { Board, MaterialInstance } from "../../game/Materials";
import { machineCanOperate, shopSupply } from "../../game/machine-helpers";
import { clampsFor } from "../../game/Clamp";
import { useApplyGameAction, useGameState } from "../useGameState";
import { makeBenchPointerBus } from "./benchPointer";
import { AssemblySurface, ASSEMBLY_GAP_IN } from "./AssemblySurface";
import { GlueSurface, GLUE_GAP_IN } from "./GlueSurface";
import { PrySurface } from "./PrySurface";
import { SawSurface } from "./SawSurface";
import { StrokeSurface } from "./StrokeSurface";
import {
  fitToStage,
  pointerToInches,
  STAGE_HEIGHT,
  STAGE_WIDTH,
} from "./stageMath";
import { rowLayout } from "../../game/bench-work/workpiece";
import { INCHES_PER_FOOT } from "../../game/shop-scale";
import { useActivityFlag, useWorkFoley } from "./useWorkFoley";

/** Continuous foley per interactive operation family. */
function foleyClipFor(operationId: string): string | null {
  if (operationId.startsWith("block")) return "hand-sanding";
  if (operationId.startsWith("orbit")) return "orbital-sander";
  if (operationId.startsWith("handPlane")) return "hand-sanding";
  if (operationId === "handSawCut") return "pallet-dismantle";
  return null;
}

/** The pallet sprite's span, in inches (see PalletSprite). */
const PALLET_SIZE = {
  widthIn: 4 * INCHES_PER_FOOT - 2,
  heightIn: 3 * INCHES_PER_FOOT - 2,
};

/** Dust lands about twice a second while the tool is moving. */
const DUST_THROTTLE_MS = 500;

/**
 * The bench view's work half: the zoomed look at the station's actual
 * state where hand work happens with the pointer (docs/bench-minigames.md).
 * Lives inside the station sheet — diegetically, leaning over the bench —
 * with the plan picker surviving beside it as the paper pinned to the
 * bench. The world does not stop while it's open.
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

  const foleyClip =
    script && (script.kind === "stroke" || script.kind === "saw")
      ? foleyClipFor(script.operation.id)
      : null;
  useWorkFoley(foleyClip, active);

  if (!script) {
    return null;
  }

  // The cure runs on the clock; the bench just says so
  if (script.kind === "curing") {
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

  // Short of supplies or clamps: the sheet's own lines say what's
  // missing; the work surface just stays rolled up. (A started stroke
  // already spent its start, so it always keeps going.)
  const started =
    script.kind === "stroke" || script.kind === "saw" ? script.started : false;
  if (!canOperate && !started && script.kind !== "pry") {
    return null;
  }

  const { fit, instruction, surface, progressLine } = buildSurface();

  function buildSurface() {
    switch (script!.kind) {
      case "stroke": {
        const s = script as Extract<BenchScript, { kind: "stroke" }>;
        const band =
          s.interaction.kind === "stroke"
            ? (s.interaction.band ?? "face")
            : "face";
        const fit = fitToStage(strokeSurfaceSize(s.workpiece, band));
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
          surface: (
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
        const s = script as Extract<BenchScript, { kind: "saw" }>;
        const board = s.workpiece as Board;
        const fit = fitToStage({
          widthIn: board.width,
          heightIn: board.length * INCHES_PER_FOOT,
        });
        return {
          fit,
          instruction: s.started
            ? "Saw along the line — long, even push and pull."
            : "Press on the line to start the cut. Z and X slide it; R swings the angle.",
          progressLine: `${progress}%`,
          surface: (
            <SawSurface
              machine={machine}
              interaction={
                s.interaction as Extract<typeof s.interaction, { kind: "saw" }>
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
      case "pry": {
        const s = script as Extract<BenchScript, { kind: "pry" }>;
        const targets = pryTargets(s.pallet);
        const fit = fitToStage(PALLET_SIZE);
        return {
          fit,
          instruction:
            "Pry the marked nails. Every board comes off one pull at a time.",
          progressLine: `${targets.length} nails left`,
          surface: (
            <PrySurface
              pallet={s.pallet}
              targets={targets}
              fit={fit}
              bus={bus}
              onPry={(target) =>
                applyAction(pryPalletNailAction(machine, target))
              }
            />
          ),
        };
      }
      case "glue": {
        const s = script as Extract<BenchScript, { kind: "glue" }>;
        const layout = rowLayout(s.pieces, GLUE_GAP_IN);
        const fit = fitToStage(layout.size);
        const clampsNeeded = clampsFor(s.operation);
        return {
          fit,
          instruction:
            stageLine ?? "Spread glue down each open joint, edge to edge.",
          progressLine: null,
          surface: (
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
        const s = script as Extract<BenchScript, { kind: "assembly" }>;
        const layout = rowLayout(s.pieces, ASSEMBLY_GAP_IN);
        const fit = fitToStage(layout.size);
        return {
          fit,
          instruction:
            stageLine ?? "Press each outline to set its piece in place.",
          progressLine: null,
          surface: (
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
      default:
        return {
          fit: null,
          instruction: "",
          surface: null,
          progressLine: null,
        };
    }
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

  if (!surface || !fit) {
    return null;
  }

  const handlePointer =
    (type: "down" | "move" | "up" | "leave") =>
    (event: React.PointerEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
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

  return (
    <div
      className="space-y-1"
      data-testid="bench-work"
      data-script={script.kind}
      data-progress={progress}
    >
      <div className="flex items-baseline justify-between">
        <p className="font-condensed uppercase tracking-[0.15em] text-[0.7rem] text-ink-fade">
          {instruction}
        </p>
        {progressLine && (
          <span className="font-condensed text-[0.7rem] text-ink-fade tabular-nums">
            {progressLine}
          </span>
        )}
      </div>
      <div
        className="relative select-none touch-none cursor-crosshair overflow-hidden rounded border-2 border-ink-black/25 bg-manila-dark/60 [&_canvas]:h-full [&_canvas]:w-full"
        style={{
          width: "100%",
          aspectRatio: `${STAGE_WIDTH} / ${STAGE_HEIGHT}`,
        }}
        data-testid="bench-stage"
        onPointerDown={handlePointer("down")}
        onPointerMove={handlePointer("move")}
        onPointerUp={handlePointer("up")}
        onPointerLeave={handlePointer("leave")}
      >
        <Application
          width={STAGE_WIDTH}
          height={STAGE_HEIGHT}
          backgroundAlpha={0}
          antialias={true}
          autoDensity={false}
        >
          {surface}
        </Application>
      </div>
    </div>
  );
};
