import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  BenchScript,
  benchGroupWork,
  placedPieceSize,
} from "../../game/bench-work/workpiece";
import {
  benchGroupAt,
  BenchGroupMember,
  groupPieces,
  memberFor,
  placementInFrame,
  placementOnMember,
  seatInGroup,
} from "../../game/bench-work/bench-group";
import {
  nearestSawMark,
  sawMarkParameters,
  toolForOperation,
  toolOperationFor,
} from "../../game/bench-work/tool-work";
import { SAW_ANGLE_STOPS } from "../../game/machines/miterSaw";
import {
  BenchPlacement,
  benchPlacementFor,
  benchPointInFrame,
  benchPointOnPallet,
  benchTopSizeIn,
  palletPointOnBench,
} from "../../game/bench-work/bench-layout";
import {
  atFlipStop,
  FLIP_STOP_HINTS,
  flipStopOf,
  nextFlipStop,
  tumbles,
} from "../../game/bench-work/flip-cycle";
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
  gatherBenchPiecesAction,
  pryPalletNailAction,
  startGlueUpAction,
} from "../../game/game-actions/operation-actions";
import {
  operateMachineAction,
  setMachineSettingsAction,
  takeInputsFromMachineAction,
  takeOutputsFromMachineAction,
} from "../../game/game-actions/player-actions";
import {
  armedFasteners,
  assemblyFramePlacement,
  blueprintFrame,
  fastenedPieceIds,
  fastenerAt,
  seatedParts,
  snapPlacementFor,
} from "../../game/bench-work/assembly";
import {
  BlueprintFastener,
  BlueprintSlot,
  fastenerToolId,
  ProductBlueprint,
  slotExtent,
} from "../../game/bench-work/blueprint";
import {
  describeMaterialRequirement,
  materialMeetsInput,
} from "../../game/material-helpers";
import {
  isBenchType,
  Machine,
  machineKey,
  Operation,
} from "../../game/Machine";
import {
  Board,
  MaterialInstance,
  Pallet,
  PalletNail,
} from "../../game/Materials";
import { machineCanOperate, shopSupply } from "../../game/machine-helpers";
import { clampsFree } from "../../game/Clamp";
import {
  ClampPlacement,
  clampGhosts,
  clampsForGlueSpan,
  clampsOnRun,
  CLAMP_SNAP_IN,
  detectGlueRun,
} from "../../game/bench-work/glue-up";
import {
  coverageFraction,
  makeCoverageGrid,
  stampStroke,
} from "../../game/bench-work/coverage";
import { availableOperations } from "../../game/skill-helpers";
import { CONSUMABLE_TYPES } from "../../game/Consumable";
import { TOOL_TYPES, ToolId } from "../../game/Tool";
import { playSound } from "../../utils/sfx";
import { toolIconSrc } from "../../utils/uiImages";
import { useApplyGameAction, useGameState, useMachines } from "../useGameState";
import { useShortcut } from "../shortcuts/ShortcutProvider";
import { StatusText } from "../station/StatusText";
import { BenchPointerEvent, makeBenchPointerBus } from "./benchPointer";
import { publishBenchScene, setLeanedBench } from "./benchSceneSlot";
import { BenchScene, LoosePiece, NAIL_HIT_RADIUS_IN } from "./BenchScene";
import { BenchSceneBackdrop } from "./BenchSceneBackdrop";
import { BenchToolRail } from "./BenchToolRail";
import { BlueprintCorner } from "./BlueprintCorner";
import { UnderBenchPanel } from "./UnderBenchPanel";
import { flyToSupply } from "./flyToSupply";
import {
  BEAD_RADIUS_IN,
  CLAMP_HIT_IN,
  GlueCuringLayer,
  GlueUpLayer,
  SPREAD_COMPLETE,
  SPREAD_PER_SECOND,
} from "./GlueUpLayer";
import { SawSurface } from "./SawSurface";
import { StrokeSurface } from "./StrokeSurface";
import { fitToStage, pointerToInches, StageFit, StageRect } from "./stageMath";
import { useEasedSize } from "./useEasedSize";
import { useActivityFlag, useWorkFoley } from "./useWorkFoley";

/** Continuous foley per interactive operation family. The hand saw is
 * absent on purpose: it carries its own synthesized voice, driven per
 * stroke inside SawSurface (handSawSynth.ts), not a looped clip. */
function foleyClipFor(operationId: string): string | null {
  if (operationId.startsWith("block")) return "hand-sanding";
  if (operationId.startsWith("orbit")) return "orbital-sander";
  if (operationId.startsWith("handPlane")) return "hand-sanding";
  return null;
}

/** How long one pry takes, press to commit — the animation IS the pacing. */
export const PRY_MS = 280;

/** Mount counter feeding each surface's unique dive key. */
let diveSequence = 0;

/** One nail driven per strike, same clocking as the pry. */
export const DRIVE_MS = 240;

/** Dust lands about twice a second while the tool is moving. */
const DUST_THROTTLE_MS = 500;

/**
 * Air kept around the bench in the scene frame, in inches. Small on
 * purpose: this used to hold the apron of floor the scene painted for
 * itself, and the scene stopped painting floor when the live shop
 * became the backdrop. All it buys now is that the top's edges aren't
 * jammed against the chrome — every inch of it is an inch the bench
 * doesn't get, and leaning over a bench should fill the window.
 */
const FRAME_MARGIN_IN = 3;

/**
 * Canvas kept clear for the floating chrome, in px — measured off the
 * chrome rather than guessed, because the frame centers in what's left
 * and anything the band is short by is bench hidden under a panel. The
 * tool rail hangs 148px down from the top at any viewport (it grows
 * sideways with the slot count, never down); the hint cluster and the
 * blueprint corner reach 91px up from the bottom.
 */
const TOP_CHROME_PX = 152;
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
 * shows on the shop floor too. Single-piece tool work is tool-first and
 * in place: the held tool over a piece it can work IS the operation
 * (bench-work/tool-work.ts), and the strokes, kerf, and finished piece
 * all land through the piece's own placement. Glue-ups are clamps-first
 * on the scene too: bar clamps set out on the bench top, stock laid
 * across them edge to edge, glue down the seams, tighten — nothing
 * mounts over the scene anymore.
 * See docs/bench-work.md. The world does not stop while it's open,
 * but the body does: leaning over the bench pins the feet (ShopView
 * disables held movement via sheetIsBenchView) until Tab steps back.
 */
export const BenchWorkSurface: React.FC<{
  machine: Machine;
  onClose: () => void;
  /** The sheet has closed and the camera is pulling back out; the view
   * stays mounted as pure theater until the zoom lands (StationSheet
   * holds it). Input is off the whole way. */
  closing?: boolean;
  /** The zoom-out has landed — safe to unmount. */
  onExited?: () => void;
}> = ({ machine: openedBench, onClose, closing = false, onExited }) => {
  const gameState = useGameState();
  const applyAction = useApplyGameAction();
  const machines = useMachines();

  // ----------------------------------------------------------- the group
  // Tables pushed together are one bench (bench-work/bench-group.ts): the
  // whole run's tops make one surface, so stock on the next table over is
  // in reach and a board can lie across the seam. A bench standing on its
  // own — always, for the makeshift one — is a run of one, and every
  // conversion below is the identity, so there is nothing to branch on.
  const group = useMemo(
    () => benchGroupAt(machines, openedBench),
    [machines, openedBench],
  );
  // An operation still belongs to one table: the one holding the stock.
  // `machine` from here down means whichever member is doing the work —
  // the commits, the plan, the tool rail, and the status all follow it.
  const { machine, script } = benchGroupWork(
    group.members,
    openedBench,
    gameState.progression,
  );
  const workMember = memberFor(group, machine) ?? group.members[0];
  const bus = useMemo(makeBenchPointerBus, []);
  const [progress, setProgress] = useState(0);
  const lastDust = useRef(0);
  const { active, poke } = useActivityFlag();

  // ------------------------------------------------------------ the zoom
  // Opening a bench leans the camera in rather than cutting: the scene
  // starts drawn exactly over the bench's on-screen footprint in the
  // shop view and eases up to the full framing; closing rolls it back.
  // The dive itself runs in the shop's stage (BenchDiveLayer), fed
  // through the slot published below. `settled` is the dive having
  // landed on the bench framing — the hands only work once the lean-in
  // is done, and never on the way out.
  const reduceMotion = useMemo(
    () =>
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
    [],
  );
  const [settled, setSettled] = useState(false);
  const onZoomRest = useCallback(
    (at: 0 | 1) => {
      if (at === 1) setSettled(true);
      else onExited?.();
    },
    [onExited],
  );
  const interactive = settled && !closing;
  // Re-opening mid-close re-leans in: not settled again until it lands
  useEffect(() => {
    if (closing) setSettled(false);
  }, [closing]);

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
  // Clamps-first glue-up (bench-work/glue-up.ts): the bars set out on
  // the scene, how many are wound tight, what's in the hand (a clamp
  // off the rack, or the glue bottle), and the bead laid per seam. All
  // ephemeral until the last tighten commits — walk away mid-setup and
  // the clamps go back on the rack, the glue dries; the boards stay
  // exactly where they lie (their arrangement is real state).
  const [placedClamps, setPlacedClamps] = useState<
    ReadonlyArray<ClampPlacement>
  >([]);
  const [tightenedCount, setTightenedCount] = useState(0);
  const [holdingClamp, setHoldingClamp] = useState(false);
  const [holdingGlue, setHoldingGlue] = useState(false);
  const [clampCursor, setClampCursor] = useState<ClampPlacement | null>(null);
  const seamGrids = useRef<Map<string, ReturnType<typeof makeCoverageGrid>>>(
    new Map(),
  );
  const [seamCoverage, setSeamCoverage] = useState<
    Readonly<Record<string, number>>
  >({});
  const lastBead = useRef<{ key: string; t: number; at: number } | null>(null);
  const [prying, setPrying] = useState<PalletNail | null>(null);
  const [hoveredNail, setHoveredNail] = useState<PalletNail | null>(null);
  // Blueprint assembly: which fasteners this build has driven (ephemeral
  // until the last one commits — decision 4: assembly only spends), the
  // strike animation, and the crossing under the held hammer.
  const [driven, setDriven] = useState<ReadonlyArray<BlueprintFastener>>([]);
  const [driving, setDriving] = useState<BlueprintFastener | null>(null);
  const [hoveredFastener, setHoveredFastener] =
    useState<BlueprintFastener | null>(null);
  // The empty ghost outline under a bare hand: its tag names what stock
  // the slot calls for.
  const [hoveredSlot, setHoveredSlot] = useState<BlueprintSlot | null>(null);
  // The piece under a held work tool that the tool can actually work,
  // and the operation it would start — tool-first selection
  // (bench-work/tool-work.ts). Kept in state for the chrome and in the
  // handler's event-time computation for the press itself.
  const [hoveredWork, setHoveredWorkState] = useState<{
    materialId: string;
    operationId: string;
    kind: "stroke" | "saw";
  } | null>(null);
  const setHoveredWork = useCallback(
    (
      next: {
        materialId: string;
        operationId: string;
        kind: "stroke" | "saw";
      } | null,
    ) =>
      setHoveredWorkState((previous) =>
        previous?.materialId === next?.materialId &&
        previous?.operationId === next?.operationId
          ? previous
          : next,
      ),
    [],
  );
  const [hoveredId, setHoveredIdState] = useState<string | null>(null);
  // The keydown listener re-registers in an effect — a beat after the
  // render that computed a new hover — so a fast keypress can reach a
  // stale closure. The ref is written at pointer-event time and read at
  // key time, so E/R/F always act on the piece truly under the hand.
  const hoveredIdRef = useRef<string | null>(null);
  const setHoveredId = useCallback((id: string | null) => {
    hoveredIdRef.current = id;
    setHoveredIdState(id);
  }, []);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragOffset = useRef({ dxIn: 0, dyIn: 0 });
  /** The dragged piece's live placement, committed on release — the one
   * sliver of layout that is view state, and only mid-gesture. */
  const dragPlacement = useRef<BenchPlacement | null>(null);
  const [, bump] = useReducer((c: number) => c + 1, 0);
  const pryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const driveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (pryTimer.current) clearTimeout(pryTimer.current);
      if (driveTimer.current) clearTimeout(driveTimer.current);
    },
    [],
  );
  const cursorRef = useRef<HTMLDivElement | null>(null);
  const slotTipRef = useRef<HTMLDivElement | null>(null);
  const pointerPos = useRef<{ x: number; y: number } | null>(null);
  const fitRef = useRef<StageFit | null>(null);
  const lastPointer = useRef<{
    xIn: number;
    yIn: number;
    held: boolean;
  } | null>(null);

  const canOperate = machineCanOperate(machine, shopSupply(gameState));

  const onWork = useCallback(() => {
    poke();
    const now = performance.now();
    if (now - lastDust.current >= DUST_THROTTLE_MS) {
      lastDust.current = now;
      applyAction(emitBenchDustAction(machine));
    }
  }, [applyAction, machine, poke]);

  const finish = useCallback(
    () => applyAction(finishAttendedWorkAction(machine)),
    [applyAction, machine],
  );
  const commitWhole = useCallback(() => {
    // A build's parts may have been laid on from either table of a run;
    // the operation claims from one, so gather them onto it first.
    applyAction(
      gatherBenchPiecesAction(
        machine,
        piecesRef.current.map((piece) => piece.material.id),
      ),
    );
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

  const started = machine.operationProgress.status === "inProgress";
  // Everything happens ON the scene now: stroke and saw work in place
  // (tool in hand), assembly on its ghost slots, and glue-ups in the
  // clamps set out on the bench top. Nothing mounts over it anymore.
  // The in-progress hand work drawn in place over the scene
  const inPlaceWork =
    script && (script.kind === "stroke" || script.kind === "saw")
      ? script
      : null;
  const curing = script?.kind === "curing";
  const isBench = isBenchType(machine.type);
  const sceneActive = isBench && !curing;
  // The mounted tool the running work needs back in hand to continue
  const workTool = inPlaceWork
    ? toolForOperation(machine, inPlaceWork.operation)
    : null;
  const workActive =
    inPlaceWork !== null && heldTool !== null && heldTool === workTool;
  const workPlacement = inPlaceWork
    ? placementInFrame(
        group,
        workMember,
        benchPlacementFor(machine, inPlaceWork.workpiece),
      )
    : null;
  // A held saw's ghost line wants the hovered board even before the mark
  const heldToolSawHover =
    sceneActive && !inPlaceWork && heldTool && hoveredWork?.kind === "saw"
      ? hoveredWork
      : null;
  const sawAngle = Number(machine.selectedParameters?.angle ?? 0);
  const heldToolIsSaw =
    heldTool !== null &&
    TOOL_TYPES[heldTool].operations.some(
      (op) => op.interaction?.kind === "saw",
    );
  // A fresh workpiece starts its readout over
  const workpieceId = inPlaceWork?.workpiece.id ?? null;
  useEffect(() => {
    setProgress(0);
  }, [workpieceId]);
  const assemblyScript =
    sceneActive && script?.kind === "assembly" ? script : null;
  const assemblyBlueprint: ProductBlueprint | null =
    assemblyScript?.blueprint ?? null;

  // ---------------------------------------------------------- the scene
  // The scene frame: the bench top plus enough floor around it to hold a
  // staged pallet's overhang. Constant per bench type — so the zoom never
  // jumps as boards come and go — except when a plan bigger than the
  // bench is pulled (a worktable builds a 48×48 frame on the makeshift
  // bench): the scene leans back far enough to hold the whole build.
  // That lean-back, and the lean back in when the plan is put away, is
  // a ramp rather than a cut: the frame's inches ease toward the target
  // (useEasedSize) and every fit below follows the eased value.
  // The whole run's tops, not one table's: two 4-ft tables pushed
  // together frame as 8 ft of bench, and an L-shaped run frames as its
  // bounding box (the corner that isn't bench is empty scene — the seating
  // rule, not the frame, is what keeps stock off it).
  const benchSize = { widthIn: group.widthIn, heightIn: group.heightIn };
  const planWidthIn = assemblyBlueprint?.widthIn ?? 0;
  const planHeightIn = assemblyBlueprint?.heightIn ?? 0;
  const frameTarget = useMemo(
    () => ({
      widthIn:
        Math.max(benchSize.widthIn, PALLET_WIDTH_IN, planWidthIn) +
        FRAME_MARGIN_IN * 2,
      heightIn:
        Math.max(benchSize.heightIn, PALLET_HEIGHT_IN, planHeightIn) +
        FRAME_MARGIN_IN * 2,
    }),
    [benchSize.widthIn, benchSize.heightIn, planWidthIn, planHeightIn],
  );
  const frame = useEasedSize(frameTarget, reduceMotion);
  const benchOriginIn = {
    xIn: (frame.widthIn - benchSize.widthIn) / 2,
    yIn: (frame.heightIn - benchSize.heightIn) / 2,
  };
  const scenePallet: Pallet | null =
    sceneActive && script?.kind === "pry" ? script.pallet : null;
  // Everything lying anywhere on the run, each piece remembering which
  // table bookkeeps it — that's where its arrangement is committed and
  // where E takes it back from.
  const pieces = useMemo(
    () => (sceneActive ? groupPieces(group) : []),
    [sceneActive, group],
  );
  const ownerOf = useCallback(
    (materialId: string): BenchGroupMember | null =>
      pieces.find((piece) => piece.material.id === materialId)?.member ?? null,
    [pieces],
  );
  // The key handler is bound once per script, not per piece — it reads
  // the run's contents through a ref, like the snap and clamp state
  const piecesRef = useRef(pieces);
  piecesRef.current = pieces;
  const loose: ReadonlyArray<MaterialInstance> = pieces
    .filter((piece) => piece.bay === "input" && piece.material !== scenePallet)
    .map((piece) => piece.material);
  // Finished work lies on the bench too — hover it, nudge it, E takes it
  const sceneOutputs: ReadonlyArray<MaterialInstance> = pieces
    .filter((piece) => piece.bay === "output")
    .map((piece) => piece.material);

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

  // Placements are stored per table in that table's own inches; the scene
  // works in the run's frame, so everything drawn or hit-tested here goes
  // through the group's measure. A lone bench makes this the identity.
  const placementOf = useCallback(
    (material: MaterialInstance): BenchPlacement => {
      if (draggingId === material.id && dragPlacement.current) {
        return dragPlacement.current;
      }
      const piece = pieces.find((p) => p.material.id === material.id);
      return (
        piece?.placement ??
        placementInFrame(
          group,
          workMember,
          benchPlacementFor(machine, material),
        )
      );
    },
    [draggingId, machine, pieces, workMember],
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

  const outputPieces: ReadonlyArray<LoosePiece> = sceneOutputs.map(
    (material) => ({ material, placement: placementOf(material) }),
  );
  /** Everything lying on the bench, draw order: staged stock first,
   * finished work on top. */
  const scenePieces: ReadonlyArray<LoosePiece> = [
    ...loosePieces,
    ...outputPieces,
  ];

  // ------------------------------------------------- clamps-first glue-up
  // No plan, ever: the contiguous edge-to-edge run lying on the bench IS
  // the glue-up, gated by whichever glue recipe the composition amounts
  // to being known (a locked composition simply never forms a run — no
  // grayed-out tease). See bench-work/glue-up.ts.
  const glueOps = isBench
    ? availableOperations(machine, gameState.progression).filter(
        (op) => op.interaction?.kind === "glue",
      )
    : [];
  const glueContext =
    sceneActive && glueOps.length > 0 && !scenePallet && !assemblyBlueprint;
  const glueDetection = glueContext
    ? detectGlueRun(scenePieces)
    : { run: null, reason: null };
  const glueRun =
    glueDetection.run &&
    glueOps.some((op) => op.id === glueDetection.run!.operationId)
      ? glueDetection.run
      : null;
  const freeClamps = clampsFree(gameState.clamps, gameState.machines);
  const clampsAvailable = Math.max(0, freeClamps - placedClamps.length);
  const clampsNeeded = glueRun ? clampsForGlueSpan(glueRun.lengthIn) : 0;
  const runClamps = glueRun ? clampsOnRun(glueRun, placedClamps) : [];
  const ghostPositions = glueRun
    ? clampGhosts(glueRun).filter(
        (ghost) =>
          !placedClamps.some(
            (clamp) =>
              Math.hypot(clamp.xIn - ghost.xIn, clamp.yIn - ghost.yIn) <=
              CLAMP_SNAP_IN,
          ),
      )
    : [];
  const seamsGluedCount = glueRun
    ? glueRun.seams.filter(
        (seam) => (seamCoverage[seam.key] ?? 0) >= SPREAD_COMPLETE,
      ).length
    : 0;
  const glueReady =
    glueRun !== null &&
    runClamps.length >= clampsNeeded &&
    seamsGluedCount === glueRun.seams.length;
  const runKey = glueRun ? glueRun.pieces.map((p) => p.id).join("|") : "";
  // A different run is a different glue-up: fresh beads, nothing tight
  useEffect(() => {
    seamGrids.current.clear();
    setSeamCoverage({});
    setTightenedCount(0);
  }, [runKey]);
  useEffect(() => {
    if (tightenedCount > 0 && !glueReady) setTightenedCount(0);
  }, [glueReady, tightenedCount]);
  // Leaving the glue context puts the hand's clamp and bottle back
  useEffect(() => {
    if (!glueContext) {
      setHoldingClamp(false);
      setHoldingGlue(false);
      setClampCursor(null);
      if (placedClamps.length > 0) setPlacedClamps([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glueContext]);

  const glueRunRef = useRef(glueRun);
  glueRunRef.current = glueRun;
  const commitGlueUp = useCallback(() => {
    const run = glueRunRef.current;
    if (!run) return;
    // A run laid across a seam is glued on one table: slide the strips
    // together first, exactly as you would before winding the clamps.
    const ids = run.pieces.map((piece) => piece.id);
    applyAction(gatherBenchPiecesAction(machine, ids));
    // The tighten is the single commit: claim the very pieces in the
    // clamps (in across order), then resolve the attended phase — the
    // hand work was it — so the cure begins right here on the scene.
    applyAction(startGlueUpAction(machine, ids));
    applyAction(finishAttendedWorkAction(machine));
    setPlacedClamps([]);
    setTightenedCount(0);
    seamGrids.current.clear();
    setSeamCoverage({});
  }, [applyAction, machine]);

  // The cure drawn where it was tightened: the run re-derived from the
  // processing pieces' own persistent placements
  const curingGlue =
    curing && script?.operation.interaction?.kind === "glue" ? script : null;
  const curingRun = curingGlue
    ? detectGlueRun(
        machine.processingMaterials.map((material) => ({
          material,
          placement: placementInFrame(
            group,
            workMember,
            benchPlacementFor(machine, material),
          ),
        })),
      ).run
    : null;

  // ------------------------------------------------- blueprint assembly
  // The ghost frame's centered seat — shared with the claim in
  // operateMachineAction, which rebuilds this seating to consume the
  // very boards lying on the outlines.
  const productPlacement: BenchPlacement = useMemo(
    () =>
      assemblyFramePlacement({
        widthIn: benchSize.widthIn,
        heightIn: benchSize.heightIn,
      }),
    [benchSize.widthIn, benchSize.heightIn],
  );
  // Seating is derived from the pieces' persistent placements, never
  // stored — a refresh finds every part exactly as seated as it was.
  const seated: ReadonlyMap<string, string> = assemblyBlueprint
    ? seatedParts(assemblyBlueprint, productPlacement, loosePieces)
    : new Map();
  const armed: ReadonlyArray<BlueprintFastener> = assemblyBlueprint
    ? armedFasteners(assemblyBlueprint, seated).filter(
        (fastener) => !driven.includes(fastener),
      )
    : [];
  // Pieces a driven fastener holds are nailed on: no drag, turn, or take
  const fastened = fastenedPieceIds(seated, driven);
  // A fresh build (or a commit) starts with an empty schedule
  useEffect(() => {
    if (driven.length > 0 && !assemblyBlueprint) setDriven([]);
  }, [driven.length, assemblyBlueprint]);

  // Where the dragged piece would settle if released right now
  const dragMaterial = draggingId
    ? scenePieces.find((piece) => piece.material.id === draggingId)?.material
    : null;
  const takenSlots = assemblyBlueprint
    ? new Set(
        [...seated.entries()]
          .filter(([, materialId]) => materialId !== draggingId)
          .map(([slotId]) => slotId),
      )
    : null;
  const snapCandidate =
    assemblyBlueprint && dragMaterial && dragPlacement.current && takenSlots
      ? snapPlacementFor(
          assemblyBlueprint,
          productPlacement,
          dragMaterial,
          dragPlacement.current,
          takenSlots,
        )
      : null;
  const snapRef = useRef<typeof snapCandidate>(null);
  snapRef.current = snapCandidate;
  const fastenedRef = useRef<ReadonlySet<string>>(fastened);
  fastenedRef.current = fastened;

  const hasHammer = machine.state.tools.includes("hammer");
  const hammerHeld = heldTool === "hammer";
  // The blueprint names its fastener and the fastener its driver: nails
  // take the hammer, screws the drill. The op comes from that very tool,
  // so the driver is always on the rail whenever the plan is offered.
  const fastenerId = assemblyBlueprint?.fastenerConsumable ?? null;
  const driveTool = fastenerId ? fastenerToolId(fastenerId) : null;
  const driveToolHeld = driveTool !== null && heldTool === driveTool;
  // A held tool with stroke or saw jobs is looking for work on the
  // bench top — the tool-first path (the hammer and drill drive builds
  // instead, and keep their own chrome)
  const heldWorkTool =
    heldTool &&
    TOOL_TYPES[heldTool].operations.some(
      (op) =>
        op.interaction?.kind === "stroke" || op.interaction?.kind === "saw",
    )
      ? heldTool
      : null;
  // The board a held saw is ghosting its line over, pre-mark
  const sawHoverPiece = heldToolSawHover
    ? (scenePieces.find(
        (piece) => piece.material.id === heldToolSawHover.materialId,
      ) ?? null)
    : null;
  const sawHoverInteraction = heldToolSawHover
    ? ((machine.operations.find((op) => op.id === heldToolSawHover.operationId)
        ?.interaction ?? null) as Extract<
        NonNullable<Operation["interaction"]>,
        { kind: "saw" }
      > | null)
    : null;

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

  /**
   * One nail driven at an armed crossing. Everything before the last
   * nail is ephemeral — but the last one commits the whole build: start
   * and finish resolve back to back (spend the nails, the product
   * appears), and because the ghost frame is the finished product's own
   * default seat, the assembled sprite lands exactly where the parts
   * were lying. Nothing moves at the moment it becomes one piece.
   */
  const beginDrive = useCallback(
    (target: BlueprintFastener) => {
      if (!assemblyBlueprint) return;
      lastPryAt.current = performance.now();
      playSound(
        assemblyBlueprint.fastenerConsumable === "screws"
          ? "drill-driver"
          : "assembly-mallet",
        0.5,
      );
      setDriving(target);
      setHoveredFastener(null);
      if (driveTimer.current) clearTimeout(driveTimer.current);
      driveTimer.current = setTimeout(() => setDriving(null), DRIVE_MS);
      const nextDriven = [...driven, target];
      if (nextDriven.length >= assemblyBlueprint.fasteners.length) {
        setDriven([]);
        commitWhole();
      } else {
        setDriven(nextDriven);
      }
    },
    [assemblyBlueprint, commitWhole, driven],
  );

  // A build with no fasteners at all (the material shelf: two planks
  // laid side by side) has nothing to drive — laying the last part on
  // IS the whole build, so seating the final slot fires the commit.
  const allSeated =
    assemblyBlueprint !== null &&
    assemblyBlueprint.slots.length > 0 &&
    seated.size === assemblyBlueprint.slots.length;
  useEffect(() => {
    if (
      assemblyBlueprint &&
      assemblyBlueprint.fasteners.length === 0 &&
      allSeated &&
      machine.operationProgress.status !== "inProgress"
    ) {
      commitWhole();
    }
  }, [assemblyBlueprint, allSeated, commitWhole, machine]);

  /** Point-in-piece test in bench inches, honoring the piece's turn and
   * whether it stands on edge. Finished work lies on top of loose stock;
   * the pallet underneath takes the grab when nothing smaller is under
   * the pointer. */
  const pieceAt = useCallback(
    (xIn: number, yIn: number): LoosePiece | null => {
      const hits = (piece: LoosePiece): boolean => {
        const size = placedPieceSize(piece.material, piece.placement);
        const rad = (-piece.placement.angleDeg * Math.PI) / 180;
        const dx = xIn - piece.placement.xIn;
        const dy = yIn - piece.placement.yIn;
        const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
        const localY = dx * Math.sin(rad) + dy * Math.cos(rad);
        // A board on edge is a sliver — the grab zone stays finger-wide
        return (
          Math.abs(localX) <= Math.max(size.widthIn / 2 + 0.5, 1.4) &&
          Math.abs(localY) <= size.heightIn / 2 + 0.5
        );
      };
      // Free pieces lie on top of seated ones (the scene draws them
      // that way), so the grab prefers them in the same order.
      const seatedIds = new Set(seated.values());
      const stacked = [
        ...scenePieces.filter((p) => seatedIds.has(p.material.id)),
        ...scenePieces.filter((p) => !seatedIds.has(p.material.id)),
      ];
      for (let i = stacked.length - 1; i >= 0; i--) {
        if (hits(stacked[i])) return stacked[i];
      }
      if (scenePallet && palletPlacement) {
        const pallet = { material: scenePallet, placement: palletPlacement };
        if (hits(pallet)) return pallet;
      }
      return null;
    },
    [scenePieces, scenePallet, palletPlacement, seated],
  );

  /** The empty ghost outline under a bench point, generously padded —
   * hovering it with a bare hand tags what the slot calls for. */
  const slotAt = useCallback(
    (xIn: number, yIn: number): BlueprintSlot | null => {
      if (!assemblyBlueprint) return null;
      const local = benchPointInFrame(
        productPlacement,
        blueprintFrame(assemblyBlueprint),
        xIn,
        yIn,
      );
      for (const slot of assemblyBlueprint.slots) {
        if (seated.has(slot.id)) continue;
        const ext = slotExtent(slot);
        const pad = 1;
        if (
          local.xIn >= ext.x0 - pad &&
          local.xIn <= ext.x1 + pad &&
          local.yIn >= ext.y0 - pad &&
          local.yIn <= ext.y1 + pad
        ) {
          return slot;
        }
      }
      return null;
    },
    [assemblyBlueprint, productPlacement, seated],
  );

  const commitDrag = useCallback(() => {
    if (draggingId && dragPlacement.current) {
      // A release near an open, fitting slot settles the piece onto it.
      // Slots are the one thing that may seat a piece off the bench: a
      // plan bigger than the top (a worktable built on the makeshift
      // bench) reaches past the edges on purpose.
      const snapped = snapRef.current;
      // Free drops land wherever the run's tops allow; a slot's own
      // placement is taken as given, and the build belongs to the table
      // running it.
      const landing = snapped
        ? { placement: snapped.placement, member: workMember }
        : seatInGroup(group, dragPlacement.current);
      // Dragged across a seam: the table it came to rest on bookkeeps it
      // now, and its arrangement is measured in that table's inches.
      const from = ownerOf(draggingId);
      if (from && from.key !== landing.member.key) {
        applyAction(
          gatherBenchPiecesAction(landing.member.machine, [draggingId]),
        );
      }
      applyAction(
        arrangeBenchMaterialAction(
          landing.member.machine,
          draggingId,
          placementOnMember(group, landing.member, landing.placement),
        ),
      );
      if (snapped) playSound("material-drop", 0.4);
    }
    dragPlacement.current = null;
    setDraggingId(null);
  }, [applyAction, draggingId, group, ownerOf, workMember]);

  const placedClampsRef = useRef(placedClamps);
  placedClampsRef.current = placedClamps;

  /** Where a held clamp would land: the nearest open ghost, or free. */
  const snapClampTo = useCallback(
    (xIn: number, yIn: number): ClampPlacement => {
      const run = glueRunRef.current;
      const ghosts = run ? clampGhosts(run) : [];
      let best: ClampPlacement | null = null;
      let bestDistance = CLAMP_SNAP_IN;
      for (const ghost of ghosts) {
        if (
          placedClampsRef.current.some(
            (clamp) =>
              Math.hypot(clamp.xIn - ghost.xIn, clamp.yIn - ghost.yIn) <=
              CLAMP_SNAP_IN,
          )
        ) {
          continue;
        }
        const distance = Math.hypot(ghost.xIn - xIn, ghost.yIn - yIn);
        if (distance <= bestDistance) {
          best = ghost;
          bestDistance = distance;
        }
      }
      return best ?? { xIn, yIn, angleDeg: run?.angleDeg ?? 0 };
    },
    [],
  );

  /** The placed clamp whose bar is under the hand, if any. */
  const clampIndexAt = useCallback(
    (xIn: number, yIn: number): number | null => {
      const run = glueRunRef.current;
      const halfBar = run ? run.spanIn / 2 + 3 : 12;
      let bestIndex: number | null = null;
      let bestDistance = CLAMP_HIT_IN;
      placedClampsRef.current.forEach((clamp, index) => {
        const rad = (clamp.angleDeg * Math.PI) / 180;
        const dirX = Math.cos(rad);
        const dirY = Math.sin(rad);
        const along = Math.max(
          -halfBar,
          Math.min(
            halfBar,
            (xIn - clamp.xIn) * dirX + (yIn - clamp.yIn) * dirY,
          ),
        );
        const distance = Math.hypot(
          xIn - (clamp.xIn + dirX * along),
          yIn - (clamp.yIn + dirY * along),
        );
        if (distance <= bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      });
      return bestIndex;
    },
    [],
  );

  /** One drag of the bottle: the bead lands on whichever seam the hand
   * is riding, paced like every other stroke tool. */
  const spreadAt = useCallback(
    (xIn: number, yIn: number) => {
      const run = glueRunRef.current;
      if (!run) return;
      let bestSeam: (typeof run.seams)[number] | null = null;
      let bestT = 0;
      let bestDistance = BEAD_RADIUS_IN * 1.5;
      for (const seam of run.seams) {
        const vx = (seam.x1In - seam.x0In) / seam.lengthIn;
        const vy = (seam.y1In - seam.y0In) / seam.lengthIn;
        const t = Math.max(
          0,
          Math.min(
            seam.lengthIn,
            (xIn - seam.x0In) * vx + (yIn - seam.y0In) * vy,
          ),
        );
        const distance = Math.hypot(
          xIn - (seam.x0In + vx * t),
          yIn - (seam.y0In + vy * t),
        );
        if (distance < bestDistance) {
          bestDistance = distance;
          bestSeam = seam;
          bestT = t;
        }
      }
      if (!bestSeam) {
        lastBead.current = null;
        return;
      }
      let grid = seamGrids.current.get(bestSeam.key);
      if (!grid) {
        grid = makeCoverageGrid(1, bestSeam.lengthIn);
        seamGrids.current.set(bestSeam.key, grid);
      }
      const now = performance.now();
      const last = lastBead.current;
      lastBead.current = { key: bestSeam.key, t: bestT, at: now };
      if (!last || last.key !== bestSeam.key) return;
      const distance = Math.abs(bestT - last.t);
      if (distance < 0.05) return;
      poke();
      const gain = Math.min(
        1,
        (SPREAD_PER_SECOND * Math.min(now - last.at, 100)) /
          1000 /
          Math.max(distance, 0.1),
      );
      stampStroke(grid, 0.5, last.t, 0.5, bestT, BEAD_RADIUS_IN, gain / 4);
      const key = bestSeam.key;
      const covered = coverageFraction(grid);
      setSeamCoverage((previous) =>
        Math.round((previous[key] ?? 0) * 100) === Math.round(covered * 100)
          ? previous
          : { ...previous, [key]: covered },
      );
    },
    [poke],
  );

  const sceneHandler = useCallback(
    (event: BenchPointerEvent) => {
      if (event.type === "leave") {
        setHoveredId(null);
        setHoveredNail(null);
        setHoveredFastener(null);
        setHoveredSlot(null);
        setHoveredWork(null);
        commitDrag();
        return;
      }
      const { xIn, yIn } = event;
      if (event.type === "down") {
        // One pull (or one driven nail) per swing — clocked, not gated
        // on the animation state, so a throttled timer can never eat a
        // press. Guarded inside the swing branches only: a press that
        // isn't a swing (a clamp set down right after the last pull)
        // must never be eaten by the previous swing's clock.
        const midSwing = performance.now() - lastPryAt.current < PRY_MS;
        if (hammerHeld && scenePallet) {
          if (midSwing) return;
          const hit = nailAt(xIn, yIn);
          if (hit) beginPry(hit);
          return;
        }
        if (driveToolHeld && assemblyBlueprint) {
          // Driving only starts when the plan could actually run — the
          // last fastener spends the supplies and claims the stock
          if (!canOperate || midSwing) return;
          const hit = fastenerAt(
            assemblyBlueprint,
            productPlacement,
            armed,
            xIn,
            yIn,
          );
          if (hit) beginDrive(hit);
          return;
        }
        if (holdingClamp) {
          // The bar lands where the hand is — snapped onto the nearest
          // open ghost when a run is inviting them
          setPlacedClamps((previous) => [...previous, snapClampTo(xIn, yIn)]);
          playSound("material-drop", 0.4);
          if (clampsAvailable <= 1) {
            setHoldingClamp(false);
            setClampCursor(null);
          }
          return;
        }
        if (holdingGlue) {
          // The press starts a fresh bead; the drag lays it
          lastBead.current = null;
          spreadAt(xIn, yIn);
          return;
        }
        if (heldTool) {
          // The tool-first press: the held tool applied to the piece
          // under it IS the operation. Computed at event time — never
          // from hover state, which can lag a fast press by a paint.
          if (machine.operationProgress.status === "inProgress") return;
          const target = pieceAt(xIn, yIn);
          const offer = target
            ? toolOperationFor(
                machine,
                gameState.progression,
                heldTool,
                target.material,
                target.placement,
              )
            : null;
          if (target && offer) {
            // The wood may be lying on the next table over; the tool and
            // the operation are this one's, so slide it across first.
            const holder = ownerOf(target.material.id);
            if (holder && holder.key !== workMember.key) {
              applyAction(
                gatherBenchPiecesAction(machine, [target.material.id]),
              );
            }
            if (offer.interaction?.kind === "saw") {
              const size = placedPieceSize(target.material, target.placement);
              const local = benchPointInFrame(target.placement, size, xIn, yIn);
              const mark = nearestSawMark(target.material as Board, local.yIn);
              if (mark !== null) {
                applyAction(
                  operateMachineAction(machine, {
                    operationId: offer.id,
                    materialId: target.material.id,
                    parameters: sawMarkParameters(mark, sawAngle),
                  }),
                );
              }
            } else {
              applyAction(
                operateMachineAction(machine, {
                  operationId: offer.id,
                  materialId: target.material.id,
                }),
              );
            }
          }
          return;
        }
        // A bare hand on a clamp's bar (the jaws overhang the stock):
        // wind it tight when the glue-up is ready, or pick it back up
        const clampHit = clampIndexAt(xIn, yIn);
        if (clampHit !== null && !pieceAt(xIn, yIn)) {
          if (glueReady) {
            playSound("glue-clamp", 0.5);
            const next = tightenedCount + 1;
            if (next >= runClamps.length) {
              commitGlueUp();
            } else {
              setTightenedCount(next);
            }
          } else {
            setPlacedClamps((previous) =>
              previous.filter((_, index) => index !== clampHit),
            );
          }
          return;
        }
        const hit = pieceAt(xIn, yIn);
        // Nailed-on parts don't drag — they're part of the build now
        if (hit && fastenedRef.current.has(hit.material.id)) return;
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
        if (holdingClamp) {
          setClampCursor(snapClampTo(xIn, yIn));
          return;
        }
        if (holdingGlue) {
          if (event.held) {
            spreadAt(xIn, yIn);
          } else {
            lastBead.current = null;
          }
          return;
        }
        if (draggingId && event.held && dragPlacement.current) {
          // The run's tops are the working area: a piece follows the hand
          // until its middle reaches the edge of the wood, and hangs
          // there — over a seam it just keeps going onto the next table.
          dragPlacement.current = seatInGroup(group, {
            ...dragPlacement.current,
            xIn: xIn + dragOffset.current.dxIn,
            yIn: yIn + dragOffset.current.dyIn,
          }).placement;
          setHoveredSlot(null);
          bump();
          return;
        }
        if (draggingId) {
          commitDrag();
        }
        // With a work tool in hand the hover is the tool's valid target;
        // bare-handed it's whatever piece is under the pointer.
        const under = pieceAt(xIn, yIn);
        const offer =
          heldTool && under && machine.operationProgress.status !== "inProgress"
            ? toolOperationFor(
                machine,
                gameState.progression,
                heldTool,
                under.material,
                under.placement,
              )
            : null;
        setHoveredWork(
          offer && under
            ? {
                materialId: under.material.id,
                operationId: offer.id,
                kind: offer.interaction?.kind === "saw" ? "saw" : "stroke",
              }
            : null,
        );
        const hit = heldTool ? (offer ? under : null) : under;
        setHoveredId(hit?.material.id ?? null);
        // An empty hand over an empty outline: tag what belongs there
        setHoveredSlot(!heldTool && !hit ? slotAt(xIn, yIn) : null);
        setHoveredNail(hammerHeld && !prying ? nailAt(xIn, yIn) : null);
        setHoveredFastener(
          driveToolHeld && !driving && assemblyBlueprint
            ? fastenerAt(assemblyBlueprint, productPlacement, armed, xIn, yIn)
            : null,
        );
        return;
      }
      if (event.type === "up") {
        lastBead.current = null;
        commitDrag();
      }
    },
    [
      applyAction,
      armed,
      assemblyBlueprint,
      beginDrive,
      beginPry,
      benchOriginIn.xIn,
      benchOriginIn.yIn,
      canOperate,
      clampIndexAt,
      clampsAvailable,
      commitDrag,
      commitGlueUp,
      draggingId,
      driveToolHeld,
      driving,
      frame.widthIn,
      frame.heightIn,
      gameState.progression,
      glueReady,
      hammerHeld,
      heldTool,
      holdingClamp,
      holdingGlue,
      machine,
      nailAt,
      pieceAt,
      productPlacement,
      prying,
      runClamps.length,
      sawAngle,
      scenePallet,
      setHoveredId,
      setHoveredWork,
      slotAt,
      snapClampTo,
      spreadAt,
      tightenedCount,
    ],
  );
  useEffect(() => {
    if (sceneActive) return bus.register(sceneHandler);
  }, [bus, sceneActive, sceneHandler]);

  // Whatever the hands picked up off the rail — a tool, a clamp, the glue
  // bottle — goes back where it came from. Escape and the right button both
  // do it: at a bench the pointer *is* the hand, so putting something down
  // shouldn't mean reaching for the keyboard.
  //
  // Registered rather than handled inline so it takes its turn against the
  // floor's own Escape (which folds the sheet) by registry order, and so
  // the binding can teach itself on the rail.
  const holdingSomething = heldTool !== null || holdingClamp || holdingGlue;
  const putBackHeld = useCallback(() => {
    setHeldTool(null);
    setHoveredNail(null);
    setHoldingClamp(false);
    setHoldingGlue(false);
    setClampCursor(null);
  }, []);
  useShortcut(
    "put-back-tool",
    putBackHeld,
    sceneActive && interactive && holdingSomething,
  );

  // R turns and F flips the piece under the pointer. Captured ahead of the
  // floor's own key routing — the sheet is deliberately not a modal, so the
  // floor's R (settings) and F (put down) stay live whenever the hands
  // aren't on a piece.
  useEffect(() => {
    if (!sceneActive || !interactive) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      // With the hammer in hand, F turns the pallet over without putting
      // the hammer down — the rest of the nails are on the other side.
      if (heldTool) {
        // With the saw in hand, R swings the miter box's angle stop —
        // the ghost line follows. Locked once a cut is marked, like any
        // machine setting mid-job (setMachineSettingsAction refuses).
        if (
          event.code === "KeyR" &&
          heldToolIsSaw &&
          machine.operationProgress.status !== "inProgress"
        ) {
          event.preventDefault();
          event.stopPropagation();
          const index = SAW_ANGLE_STOPS.findIndex((stop) => stop === sawAngle);
          const next =
            SAW_ANGLE_STOPS[(index + 1) % SAW_ANGLE_STOPS.length] ??
            SAW_ANGLE_STOPS[0];
          applyAction(setMachineSettingsAction(machine, { angle: next }));
          return;
        }
        if (
          event.code === "KeyF" &&
          scenePallet &&
          palletPlacement &&
          !draggingId
        ) {
          event.preventDefault();
          event.stopPropagation();
          setHoveredNail(null);
          const holder = ownerOf(scenePallet.id) ?? workMember;
          applyAction(
            arrangeBenchMaterialAction(
              holder.machine,
              scenePallet.id,
              placementOnMember(group, holder, {
                ...palletPlacement,
                flipped: !palletPlacement.flipped,
              }),
            ),
          );
        }
        return;
      }
      const id = draggingId ?? hoveredIdRef.current;
      if (!id) return;
      // A nailed-on part is part of the build: no taking, no turning
      if (fastenedRef.current.has(id)) return;
      // Anywhere on the run — the piece under the hand may be lying on
      // the next table over, and it's taken back off that one.
      const piece = piecesRef.current.find((p) => p.material.id === id);
      if (!piece) return;
      const { material, member: holder, bay } = piece;
      const isOutput = bay === "output";
      // E takes the piece under the hand — the one being dragged or
      // moused over, never just the first in the bay.
      if (event.code === "KeyE" && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        dragPlacement.current = null;
        setDraggingId(null);
        setHoveredId(null);
        applyAction(
          isOutput
            ? takeOutputsFromMachineAction([material], holder.machine)
            : takeInputsFromMachineAction([material], holder.machine),
        );
        return;
      }
      if (event.code !== "KeyR" && event.code !== "KeyF") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const current =
        draggingId === id && dragPlacement.current
          ? dragPlacement.current
          : piece.placement;
      // One flip verb: a board cycles flat → up on its long edge → up
      // on its end → flat again (bench-work/flip-cycle, which the scene
      // also tumbles the piece through); anything else — the pallet —
      // turns over. Mirroring a board face-for-face never showed anyway.
      const turned: BenchPlacement =
        event.code === "KeyR"
          ? { ...current, angleDeg: current.angleDeg + 90 }
          : tumbles(material)
            ? atFlipStop(current, nextFlipStop(flipStopOf(current)))
            : { ...current, flipped: !current.flipped };
      if (event.code === "KeyF" && tumbles(material)) {
        // The knock of the piece coming down on its new face: three
        // stops are easier to count by ear than by eye
        playSound("material-drop", 0.3);
      }
      // Turning and flipping pivot a piece about its middle, which is
      // the only thing the bench top holds it to — nothing to re-seat
      if (draggingId === id) {
        // Mid-drag the turn rides the drag; the release commits both
        dragPlacement.current = turned;
        bump();
      } else {
        applyAction(
          arrangeBenchMaterialAction(
            holder.machine,
            id,
            placementOnMember(group, holder, turned),
          ),
        );
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [
    sceneActive,
    interactive,
    heldTool,
    heldToolIsSaw,
    holdingClamp,
    holdingGlue,
    sawAngle,
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

  // Stepping back hangs everything up on the way out — the tool to its
  // hook, the clamps to the rack, the hover chrome cleared, and any
  // mid-drag abandoned where it was last committed (the shop's copy of
  // the piece reappears under the fading scene, and the two must agree).
  useEffect(() => {
    if (!closing) return;
    setHeldTool(null);
    setHoldingClamp(false);
    setHoldingGlue(false);
    setClampCursor(null);
    setHoveredNail(null);
    setHoveredId(null);
    setHoveredSlot(null);
    setDraggingId(null);
    dragPlacement.current = null;
  }, [closing]);

  // While the scene is opaque it draws the live bench — drags, turn
  // springs, cure chrome — so the shop hides its static copies of this
  // bench's stock underneath (see setLeanedBench). The instant the
  // pull-back starts they come back, and the fading scene hands off to
  // them.
  const benchKey = machineKey(machine.state);
  useEffect(() => {
    if (!interactive) return;
    setLeanedBench(benchKey);
    return () => setLeanedBench(null);
  }, [interactive, benchKey]);
  // This surface's dive identity, fixed at mount (the machine prop's
  // object identity churns with game state; the mount doesn't) — see
  // the publish below
  const [diveKey] = useState(
    () => `${++diveSequence}:${machineKey(openedBench.state)}`,
  );

  const foleyClip =
    script && (script.kind === "stroke" || script.kind === "saw")
      ? foleyClipFor(script.operation.id)
      : null;
  useWorkFoley(foleyClip, active);

  const surface = buildSurface();

  // The scene's pixels render in the shop's one canvas: publish the
  // subtree and the dive parameters every commit (closures carry all of
  // this component's state and handlers), and clear the slot on unmount
  // — which covers the abrupt path too, where StationSheet drops the
  // surface without a pull-back (driving off, carrying the bench away).
  // Invariant this leans on: pointerToInches maps client px through the
  // wrapper's rect while the scene draws in canvas px of the shop
  // canvas filling <main> — the same box only while both stay
  // full-window.
  const sceneElement = (
    <>
      {sceneFit && <BenchSceneBackdrop group={group} fit={sceneFit} />}
      {surface?.node}
    </>
  );
  useLayoutEffect(() => {
    if (!stageSize || !frameFit) return;
    publishBenchScene({
      // Unique per mount, not just per bench: a new key is a new dive
      // and a fresh scene container, and a surface remounted on the
      // same bench between two ticks must still get its own dive (the
      // clock would otherwise think it already landed and never fire
      // onRest again).
      benchKey: diveKey,
      sceneElement,
      frameFit,
      group,
      target: closing ? 0 : 1,
      instant: reduceMotion,
      onRest: onZoomRest,
    });
  });
  useLayoutEffect(() => () => publishBenchScene(null), []);

  function buildSurface(): {
    fit: StageFit;
    instruction: string;
    node: React.ReactNode;
    progressLine: string | null;
  } | null {
    if (!workRect) return null;
    if (!sceneFit) return null;
    const slotsTotal = assemblyBlueprint?.slots.length ?? 0;
    // An empty on-edge (or on-end) slot with a fitting piece still in
    // the wrong orientation: the next move is F, and the line says so.
    const tippableSlot = assemblyBlueprint?.slots.find(
      (slot) =>
        (slot.onEdge || slot.onEnd) &&
        !seated.has(slot.id) &&
        loosePieces.some(
          (p) =>
            (!!p.placement.onEdge !== !!slot.onEdge ||
              !!p.placement.onEnd !== !!slot.onEnd) &&
            materialMeetsInput(p.material, slot.requirement),
        ),
    );
    const assemblyInstruction = () => {
      if (!assemblyBlueprint) return "";
      const fastenerName = fastenerId
        ? CONSUMABLE_TYPES[fastenerId].unit
        : "nails";
      const driverName = driveTool
        ? TOOL_TYPES[driveTool].name.toLowerCase()
        : "hammer";
      if (seated.size >= slotsTotal) {
        return !canOperate
          ? `Short on supplies — the plan calls for ${fastenerName}.`
          : driveToolHeld
            ? fastenerId === "screws"
              ? "Drive a screw at each lit crossing."
              : "Nail each lit crossing."
            : `All laid out. Take the ${driverName} down off the rail.`;
      }
      if (sceneOutputs.length > 0 && loosePieces.length === 0) {
        return "Finished. Press E over the piece to take it.";
      }
      if (loosePieces.length < slotsTotal) {
        return "Set the plan's stock down on the bench (F), then lay each piece on its outline.";
      }
      return tippableSlot
        ? tippableSlot.onEnd
          ? `Stand each ${tippableSlot.role} on its end (F cycles), then set it on its small outline.`
          : `Flip each ${tippableSlot.role} up on its long edge (F), then lay it on its thin outline.`
        : "Lay each piece on its ghost outline — drag it close and it settles. R turns it.";
    };
    // In-place tool work: the instruction follows the running job, or the
    // held tool looking for one
    const workInstruction = () => {
      if (!inPlaceWork) return null;
      const toolName = workTool
        ? TOOL_TYPES[workTool].name.toLowerCase()
        : "tool";
      if (!workActive) {
        return `Take the ${toolName} down off the rail to finish the job.`;
      }
      if (inPlaceWork.kind === "saw") {
        return "Saw along the line — long, even push and pull.";
      }
      const band = inPlaceWork.interaction.band ?? "face";
      return band === "edge"
        ? "Run the plane along the edge until it cuts clean end to end."
        : inPlaceWork.operation.id.startsWith("handPlane")
          ? "Work the plane across the face until the whole board cuts clean."
          : "Rub the whole face down. The wood shows you where you've been.";
    };
    const heldWorkInstruction = () => {
      if (!heldWorkTool) return null;
      if (hoveredWork) {
        return hoveredWork.kind === "saw"
          ? "Press on the line to mark the cut. R swings the angle."
          : "Press and stroke the piece to work it over.";
      }
      return `Move the ${TOOL_TYPES[heldWorkTool].name.toLowerCase()} over a piece it can work.`;
    };
    // The clamps-first glue-up walks itself: clamps out, stock across
    // them, glue down the seams, tighten. Each line names the next move.
    const glueInstruction = (): string | null => {
      if (!glueContext) return null;
      if (glueRun) {
        if (runClamps.length < clampsNeeded) {
          return holdingClamp
            ? `Lay the bar across the boards (${runClamps.length}/${clampsNeeded} set).`
            : `The run wants ${clampsNeeded} clamps — one per foot of length (${runClamps.length}/${clampsNeeded} set).`;
        }
        if (seamsGluedCount < glueRun.seams.length) {
          return holdingGlue
            ? `Run the bead down each open seam (${seamsGluedCount}/${glueRun.seams.length}).`
            : "Take the glue and run a bead down each seam.";
        }
        return `Tighten each clamp — the last one starts the cure (${tightenedCount}/${runClamps.length}).`;
      }
      if (glueDetection.reason) return glueDetection.reason;
      if (holdingClamp) {
        return "Lay the bar down where the glue-up will sit.";
      }
      if (placedClamps.length > 0) {
        return "Clamps are set. Lay glue-ready stock across them, edge to edge.";
      }
      return null;
    };
    return {
      fit: sceneFit,
      instruction: curing
        ? "In the clamps — the glue cures on its own. Work something else."
        : (workInstruction() ??
          (scenePallet
            ? !hasHammer
              ? "A mounted hammer would pry those nails loose."
              : targets.length === 0 && scenePallet.nails.length > 0
                ? "The rest are nailed from the other side. Press F to flip the pallet."
                : hammerHeld
                  ? "Press a nail to pry it loose."
                  : "Take the hammer down off the rail."
            : assemblyScript
              ? assemblyInstruction()
              : (glueInstruction() ??
                heldWorkInstruction() ??
                (sceneOutputs.length > 0
                  ? "Finished work on the bench. Press E over a piece to take it."
                  : loosePieces.length > 0
                    ? "Loose stock on the bench. Drag to arrange it."
                    : "The bench is clear. Set stock down on it with F.")))),
      progressLine: inPlaceWork
        ? // The saw's progress reads off the board itself — the kerf
          // consuming the pencil line — so it carries no number.
          inPlaceWork.kind === "saw"
          ? null
          : `${progress}%`
        : scenePallet
          ? `${scenePallet.nails.length} nails left`
          : assemblyScript &&
              !(sceneOutputs.length > 0 && loosePieces.length === 0)
            ? `${seated.size}/${slotsTotal} placed · ${driven.length}/${assemblyBlueprint?.fasteners.length ?? 0} ${fastenerId === "screws" ? "screwed" : "nailed"}`
            : glueRun
              ? `${seamsGluedCount}/${glueRun.seams.length} glued · ${runClamps.length}/${clampsNeeded} clamps`
              : null,
      node: sceneActive ? (
        <>
          <BenchScene
            pallet={scenePallet}
            palletPlacement={palletPlacement}
            pieces={scenePieces}
            fit={sceneFit}
            hammerHeld={hammerHeld}
            prying={prying}
            hoveredNail={hoveredNail}
            hoveredId={hoveredId}
            draggingId={draggingId}
            assembly={
              assemblyBlueprint
                ? {
                    blueprint: assemblyBlueprint,
                    productPlacement,
                    toolHeld: driveToolHeld,
                    seated,
                    driven,
                    armed,
                    hoveredFastener,
                    driving,
                    snapCandidateSlot: snapCandidate?.slotId ?? null,
                  }
                : null
            }
          />
          {/* The running hand work, drawn on the piece where it lies */}
          {inPlaceWork?.kind === "stroke" && workPlacement && (
            <StrokeSurface
              interaction={inPlaceWork.interaction}
              workpiece={inPlaceWork.workpiece}
              finished={finishedPreview(inPlaceWork)}
              placement={workPlacement}
              fit={sceneFit}
              bus={bus}
              pointer={lastPointer}
              active={workActive}
              onComplete={finish}
              onWork={onWork}
              onProgress={onProgress}
            />
          )}
          {inPlaceWork?.kind === "saw" && workPlacement && (
            <SawSurface
              interaction={inPlaceWork.interaction}
              workpiece={inPlaceWork.workpiece}
              placement={workPlacement}
              fit={sceneFit}
              bus={bus}
              started
              active={workActive}
              params={machine.resolvedParameters(inPlaceWork.operation)}
              onComplete={finish}
              onWork={onWork}
              onProgress={onProgress}
            />
          )}
          {/* The held saw's pencil line, trailing the hand pre-mark */}
          {sawHoverPiece && sawHoverInteraction && (
            <SawSurface
              interaction={sawHoverInteraction}
              workpiece={sawHoverPiece.material as Board}
              placement={sawHoverPiece.placement}
              fit={sceneFit}
              bus={bus}
              started={false}
              active
              params={{ angle: sawAngle }}
              onComplete={() => {}}
              onWork={onWork}
            />
          )}
          {/* Seams, clamps, and ghosts over the run in the making */}
          {glueContext &&
            (glueRun || placedClamps.length > 0 || clampCursor) && (
              <GlueUpLayer
                run={glueRun}
                seamCoverage={seamCoverage}
                clamps={placedClamps}
                tightened={tightenedCount}
                ghosts={ghostPositions}
                cursor={holdingClamp ? clampCursor : null}
                fit={sceneFit}
              />
            )}
        </>
      ) : curingGlue ? (
        // The glue-up curing where it was tightened: the run's own
        // pieces on their persistent placements, every bar wound home
        <GlueCuringLayer
          pieces={machine.processingMaterials}
          placementFor={(material) =>
            placementInFrame(
              group,
              workMember,
              benchPlacementFor(machine, material),
            )
          }
          run={curingRun}
          fit={sceneFit}
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
      // Mid-zoom the stage transform and the fit disagree about where
      // the wood is — the hands wait until the lean-in lands.
      if (!interactive) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      pointerPos.current = { x, y };
      if (cursorRef.current) {
        cursorRef.current.style.transform = `translate(${x - 12}px, ${y - 11}px)`;
      }
      if (slotTipRef.current) {
        slotTipRef.current.style.transform = `translate(${x + 14}px, ${y + 16}px)`;
      }
      const fit = fitRef.current;
      if (!fit) return;
      const { xIn, yIn } = pointerToInches(
        fit,
        rect,
        event.clientX,
        event.clientY,
      );
      const benchEvent = {
        type,
        xIn,
        yIn,
        held: type === "move" ? event.buttons === 1 : type === "down",
      } as const;
      // The last pointer state, for surfaces that mount mid-press: the
      // claiming press arrives before the work overlay exists, and a
      // hand held perfectly still sends no further events — a powered
      // tool's dwell tick reads this snapshot at mount instead.
      lastPointer.current =
        type === "up" || type === "leave" ? null : benchEvent;
      bus.dispatch(benchEvent);
    };

  const scriptName = curing
    ? "curing"
    : inPlaceWork
      ? inPlaceWork.kind
      : assemblyScript
        ? "assembly"
        : glueRun
          ? "glue"
          : scenePallet
            ? "pry"
            : "idle";

  if (!isBench && !script) {
    return null;
  }

  // What F would do to the piece in hand or under the pointer — the same
  // one the key handler acts on.
  const flipPiece = (() => {
    const id = draggingId ?? hoveredId;
    return id ? scenePieces.find((p) => p.material.id === id) : undefined;
  })();
  const flipHint =
    flipPiece && tumbles(flipPiece.material)
      ? (FLIP_STOP_HINTS[nextFlipStop(flipStopOf(flipPiece.placement))] ??
        "flip")
      : "flip";

  const keyHints: Array<[string, string]> = holdingClamp
    ? [
        ["Click", "lay the clamp down"],
        ["Esc", "put the clamp back"],
        ["Tab", "step back"],
      ]
    : holdingGlue
      ? [
          ["Drag", "spread glue on a seam"],
          ["Esc", "put the glue away"],
          ["Tab", "step back"],
        ]
      : heldTool
        ? [
            ...(heldWorkTool
              ? ([
                  [
                    "Drag",
                    hoveredWork?.kind === "saw" || inPlaceWork?.kind === "saw"
                      ? "saw the line"
                      : "work the piece",
                  ],
                  ...(heldToolIsSaw && !inPlaceWork
                    ? ([["R", "swing the angle"]] as Array<[string, string]>)
                    : []),
                ] as Array<[string, string]>)
              : ([
                  [
                    "Click",
                    assemblyScript
                      ? fastenerId === "screws"
                        ? "drive a screw"
                        : "drive a nail"
                      : "pry a nail",
                  ],
                  ...(scenePallet
                    ? ([["F", "flip the pallet"]] as Array<[string, string]>)
                    : []),
                ] as Array<[string, string]>)),
            ["Esc", `hang the ${TOOL_TYPES[heldTool].name.toLowerCase()} up`],
            ["Tab", "step back"],
          ]
        : [
            ...(loosePieces.length > 0 || scenePallet
              ? ([
                  ["Drag", "move a piece"],
                  ["R", "turn"],
                  // The one flip verb: boards tip up on edge, the pallet
                  // turns over. With a board in reach the chip names the
                  // stop F is about to reach, so the three-stop cycle
                  // stops being a thing you discover by surprise.
                  ["F", flipHint],
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
      data-zoom={closing ? "out" : settled ? "open" : "in"}
    >
      {/* No backdrop of any kind here: the zoomed live shop underneath
          IS the backdrop, the whole time the view is open. The scene
          canvas only adds what's bench-local. */}
      <div
        ref={wrapRef}
        className={`absolute inset-0 select-none touch-none overflow-hidden ${
          !interactive
            ? "cursor-default"
            : heldTool || holdingClamp
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
        data-product-x={
          assemblyBlueprint
            ? (productPlacement.xIn - assemblyBlueprint.widthIn / 2).toFixed(2)
            : undefined
        }
        data-product-y={
          assemblyBlueprint
            ? (productPlacement.yIn - assemblyBlueprint.heightIn / 2).toFixed(2)
            : undefined
        }
        data-seated={assemblyScript ? seated.size : undefined}
        data-driven={assemblyScript ? driven.length : undefined}
        data-hovered={sceneActive ? (hoveredId ?? "") : undefined}
        data-work-hover={
          sceneActive && heldWorkTool
            ? (hoveredWork?.operationId ?? "")
            : undefined
        }
        data-glue-run={glueContext ? (glueRun?.pieces.length ?? 0) : undefined}
        data-glue-op={glueRun ? glueRun.operationId : undefined}
        data-glue-seams={
          glueRun ? `${seamsGluedCount}/${glueRun.seams.length}` : undefined
        }
        data-glue-clamps={
          glueRun ? `${runClamps.length}/${clampsNeeded}` : undefined
        }
        data-clamps-placed={glueContext ? placedClamps.length : undefined}
        data-work-x={workPlacement ? workPlacement.xIn.toFixed(2) : undefined}
        data-work-y={workPlacement ? workPlacement.yIn.toFixed(2) : undefined}
        onPointerDown={handlePointer("down")}
        onPointerMove={handlePointer("move")}
        onPointerUp={handlePointer("up")}
        onPointerLeave={handlePointer("leave")}
      >
        {/* The scene itself draws in the shop's canvas (published above,
            rendered by BenchDiveLayer); this wrapper only measures the
            stage and owns the pointer. */}
        {hoveredSlot && !heldTool && !draggingId && (
          // The outline's tag, trailing the pointer: what stock this
          // slot calls for, read before anything is picked up
          <div
            ref={slotTipRef}
            data-testid="slot-tip"
            className="pointer-events-none absolute left-0 top-0 z-10"
            style={{
              transform: pointerPos.current
                ? `translate(${pointerPos.current.x + 14}px, ${pointerPos.current.y + 16}px)`
                : "translate(-100px, -100px)",
            }}
          >
            <div className="whitespace-nowrap rounded bg-ink-black/80 px-2 py-1 font-condensed uppercase tracking-[0.12em] text-[0.62rem] text-paper-manila shadow-lg">
              <span className="font-semibold">{hoveredSlot.role}</span>
              {" — "}
              {describeMaterialRequirement(hoveredSlot.requirement)}
              {hoveredSlot.onEdge && (
                <span className="text-gold-light"> · stood on edge (F)</span>
              )}
              {hoveredSlot.onEnd && (
                <span className="text-gold-light"> · stood on end (F)</span>
              )}
            </div>
          </div>
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
                prying ? "bench-pry-swing" : driving ? "bench-drive-tap" : ""
              }`}
            />
          </div>
        )}
      </div>

      {/* The floating chrome settles in only once the lean-in lands, and
          lifts away the moment the camera starts back out. `inert` keeps
          every button in it out of reach while it's ghosted — opacity
          alone would leave them clickable. */}
      <div
        inert={!interactive}
        className={`transition-opacity ${
          interactive ? "opacity-100 duration-300" : "opacity-0 duration-150"
        }`}
      >
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
            machine={machine}
            heldTool={heldTool}
            interactive={sceneActive}
            onToggle={(toolId) => {
              setHoldingClamp(false);
              setHoldingGlue(false);
              setClampCursor(null);
              setHeldTool((current) => (current === toolId ? null : toolId));
            }}
          />
        )}

        {/* The glue-up's own supplies, off to the side of the rail: bar
          clamps off the rack and the glue bottle. No plan — set the
          clamps out, lay stock across them, glue, tighten.

          This sits directly under the top-bar chip, which draws above the
          bench view, so it takes the shared below-top-bar offset like the
          tool rail does. */}
        {isBench && glueOps.length > 0 && (
          <div className="pointer-events-auto absolute right-4 below-top-bar z-10 flex items-center gap-2 rounded border-2 border-black/40 bg-[#4a3826]/95 px-3 py-1.5 shadow-lg">
            <span className="mr-1 flex flex-col items-start font-condensed uppercase tracking-[0.15em] text-[0.6rem] text-paper-manila/60">
              <span>Glue-up</span>
              <span className="tabular-nums text-paper-manila/40">
                {clampsAvailable} clamps free
              </span>
            </span>
            <button
              type="button"
              data-testid="bench-clamp-supply"
              aria-label={
                holdingClamp ? "Put the clamps back" : "Take a bar clamp"
              }
              title={`Bar clamps — ${clampsAvailable} free on the rack`}
              disabled={
                !sceneActive || (clampsAvailable === 0 && !holdingClamp)
              }
              onClick={(event) => {
                event.stopPropagation();
                setHeldTool(null);
                setHoldingGlue(false);
                setClampCursor(null);
                setHoldingClamp((current) => !current);
              }}
              className={`rounded border px-2 py-1 font-condensed uppercase tracking-[0.12em] text-[0.62rem] transition-colors disabled:opacity-40 ${
                holdingClamp
                  ? "border-gold-light text-gold-light"
                  : "border-paper-manila/40 text-paper-manila hover:bg-paper-manila/10"
              }`}
            >
              Clamp
            </button>
            <button
              type="button"
              data-testid="bench-glue-bottle"
              aria-label={
                holdingGlue ? "Put the glue away" : "Take the glue bottle"
              }
              title="Wood glue — run a bead down each open seam"
              disabled={!sceneActive}
              onClick={(event) => {
                event.stopPropagation();
                setHeldTool(null);
                setHoldingClamp(false);
                setClampCursor(null);
                setHoldingGlue((current) => !current);
              }}
              className={`rounded border px-2 py-1 font-condensed uppercase tracking-[0.12em] text-[0.62rem] transition-colors disabled:opacity-40 ${
                holdingGlue
                  ? "border-gold-light text-gold-light"
                  : "border-paper-manila/40 text-paper-manila hover:bg-paper-manila/10"
              }`}
            >
              Glue
            </button>
          </div>
        )}

        {/* The plans pile in the corner and whatever the bench keeps
          underneath — the whole of the old paperwork card that survived */}
        {isBench && <BlueprintCorner machine={machine} />}
        {isBench && <UnderBenchPanel machine={machine} />}

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
            <div className="flex gap-2" data-testid="bench-key-hints">
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
    </div>
  );
};
