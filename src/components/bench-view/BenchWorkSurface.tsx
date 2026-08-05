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
  placedPieceSize,
  rowLayout,
} from "../../game/bench-work/workpiece";
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
import { isBenchType, Machine, Operation } from "../../game/Machine";
import {
  Board,
  MaterialInstance,
  Pallet,
  PalletNail,
} from "../../game/Materials";
import { machineCanOperate, shopSupply } from "../../game/machine-helpers";
import { clampsFor } from "../../game/Clamp";
import { CONSUMABLE_TYPES } from "../../game/Consumable";
import { TOOL_TYPES, ToolId } from "../../game/Tool";
import { playSound } from "../../utils/sfx";
import { toolIconSrc } from "../../utils/uiImages";
import { useApplyGameAction, useGameState } from "../useGameState";
import { StatusText } from "../station/StatusText";
import { BenchPointerEvent, makeBenchPointerBus } from "./benchPointer";
import { AssemblySurface, ASSEMBLY_GAP_IN } from "./AssemblySurface";
import { BenchScene, LoosePiece, NAIL_HIT_RADIUS_IN } from "./BenchScene";
import { BenchSceneBackdrop } from "./BenchSceneBackdrop";
import { BenchToolRail } from "./BenchToolRail";
import { BlueprintCorner } from "./BlueprintCorner";
import { UnderBenchPanel } from "./UnderBenchPanel";
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

/** One nail driven per strike, same clocking as the pry. */
export const DRIVE_MS = 240;

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
 * shows on the shop floor too. Single-piece tool work is tool-first and
 * in place: the held tool over a piece it can work IS the operation
 * (bench-work/tool-work.ts), and the strokes, kerf, and finished piece
 * all land through the piece's own placement. Only glue-ups and the
 * legacy row assemblies still mount a takeover surface over the scene.
 * See docs/bench-minigames.md. The world does not stop while it's open,
 * but the body does: leaning over the bench pins the feet (ShopView
 * disables held movement via sheetIsBenchView) until Tab steps back.
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
  // Stroke and saw work happens ON the scene (in place, tool in hand);
  // only glue-ups and legacy row assemblies still mount a takeover
  // surface. Blueprint assembly happens on the scene itself too.
  const surfaceScript =
    script &&
    (script.kind === "glue" ||
      (script.kind === "assembly" && !script.blueprint)) &&
    (canOperate || started)
      ? script
      : null;
  // The in-progress hand work drawn in place over the scene
  const inPlaceWork =
    script && (script.kind === "stroke" || script.kind === "saw")
      ? script
      : null;
  const curing = script?.kind === "curing";
  const isBench = isBenchType(machine.type);
  const sceneActive = isBench && !surfaceScript && !curing;
  // The mounted tool the running work needs back in hand to continue
  const workTool = inPlaceWork
    ? toolForOperation(machine, inPlaceWork.operation)
    : null;
  const workActive =
    inPlaceWork !== null && heldTool !== null && heldTool === workTool;
  const workPlacement = inPlaceWork
    ? benchPlacementFor(machine, inPlaceWork.workpiece)
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
    sceneActive && script?.kind === "assembly" && script.blueprint
      ? script
      : null;
  const assemblyBlueprint: ProductBlueprint | null =
    assemblyScript?.blueprint ?? null;

  // ---------------------------------------------------------- the scene
  // The scene frame: the bench top plus enough floor around it to hold a
  // staged pallet's overhang. Constant per bench type — so the zoom never
  // jumps as boards come and go — except when a plan bigger than the
  // bench is pulled (a worktable builds a 48×48 frame on the makeshift
  // bench): the scene leans back far enough to hold the whole build.
  const benchSize = benchTopSizeIn(machine.type);
  const planWidthIn = assemblyBlueprint?.widthIn ?? 0;
  const planHeightIn = assemblyBlueprint?.heightIn ?? 0;
  const frame = useMemo(
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
  const benchOriginIn = {
    xIn: (frame.widthIn - benchSize.widthIn) / 2,
    yIn: (frame.heightIn - benchSize.heightIn) / 2,
  };
  const scenePallet: Pallet | null =
    sceneActive && script?.kind === "pry" ? script.pallet : null;
  const loose: ReadonlyArray<MaterialInstance> = sceneActive
    ? machine.inputMaterials.filter((m) => m !== scenePallet)
    : [];
  // Finished work lies on the bench too — hover it, nudge it, E takes it
  const sceneOutputs: ReadonlyArray<MaterialInstance> = sceneActive
    ? machine.outputMaterials
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

  const outputPieces: ReadonlyArray<LoosePiece> = sceneOutputs.map(
    (material) => ({ material, placement: placementOf(material) }),
  );
  /** Everything lying on the bench, draw order: staged stock first,
   * finished work on top. */
  const scenePieces: ReadonlyArray<LoosePiece> = [
    ...loosePieces,
    ...outputPieces,
  ];

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
      // A release near an open, fitting slot settles the piece onto it
      const snapped = snapRef.current;
      applyAction(
        arrangeBenchMaterialAction(
          machine,
          draggingId,
          snapped ? snapped.placement : dragPlacement.current,
        ),
      );
      if (snapped) playSound("material-drop", 0.4);
    }
    dragPlacement.current = null;
    setDraggingId(null);
  }, [applyAction, draggingId, machine]);

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
        // One pull per swing — clocked, not gated on the animation state,
        // so a throttled timer can never eat a press
        if (performance.now() - lastPryAt.current < PRY_MS) return;
        if (hammerHeld && scenePallet) {
          const hit = nailAt(xIn, yIn);
          if (hit) beginPry(hit);
          return;
        }
        if (driveToolHeld && assemblyBlueprint) {
          // Driving only starts when the plan could actually run — the
          // last fastener spends the supplies and claims the stock
          if (!canOperate) return;
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
      if (event.type === "up") commitDrag();
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
      commitDrag,
      draggingId,
      driveToolHeld,
      driving,
      frame.widthIn,
      frame.heightIn,
      gameState.progression,
      hammerHeld,
      heldTool,
      machine,
      nailAt,
      pieceAt,
      productPlacement,
      prying,
      sawAngle,
      scenePallet,
      setHoveredId,
      setHoveredWork,
      slotAt,
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
          applyAction(
            arrangeBenchMaterialAction(machine, scenePallet.id, {
              ...palletPlacement,
              flipped: !palletPlacement.flipped,
            }),
          );
        }
        return;
      }
      const id = draggingId ?? hoveredIdRef.current;
      if (!id) return;
      // A nailed-on part is part of the build: no taking, no turning
      if (fastenedRef.current.has(id)) return;
      const material =
        machine.inputMaterials.find((m) => m.id === id) ??
        machine.outputMaterials.find((m) => m.id === id);
      if (!material) return;
      const isOutput = machine.outputMaterials.some((m) => m.id === id);
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
            ? takeOutputsFromMachineAction([material], machine)
            : takeInputsFromMachineAction([material], machine),
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
          : benchPlacementFor(machine, material);
      // One flip verb: a board flips up onto its long edge (and back
      // flat); anything else — the pallet — turns over. Mirroring a
      // board face-for-face never showed anyway.
      const turned: BenchPlacement =
        event.code === "KeyR"
          ? { ...current, angleDeg: current.angleDeg + 90 }
          : material.type === "board"
            ? { ...current, onEdge: !current.onEdge }
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
    heldToolIsSaw,
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
    const slotsTotal = assemblyBlueprint?.slots.length ?? 0;
    // An empty on-edge slot with a fitting piece still lying flat: the
    // next move is tipping it up, and the instruction line says so.
    const tippableSlot = assemblyBlueprint?.slots.find(
      (slot) =>
        slot.onEdge &&
        !seated.has(slot.id) &&
        loosePieces.some(
          (p) =>
            !p.placement.onEdge &&
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
        ? `Flip each ${tippableSlot.role} up on its long edge (F), then lay it on its thin outline.`
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
              : (heldWorkInstruction() ??
                (sceneOutputs.length > 0
                  ? "Finished work on the bench. Press E over a piece to take it."
                  : loosePieces.length > 0
                    ? "Loose stock on the bench. Drag to arrange it."
                    : "The bench is clear. Set stock down on it with F.")))),
      progressLine: inPlaceWork
        ? `${progress}%`
        : scenePallet
          ? `${scenePallet.nails.length} nails left`
          : assemblyScript &&
              !(sceneOutputs.length > 0 && loosePieces.length === 0)
            ? `${seated.size}/${slotsTotal} placed · ${driven.length}/${assemblyBlueprint?.fasteners.length ?? 0} ${fastenerId === "screws" ? "screwed" : "nailed"}`
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
        </>
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
      : surfaceScript
        ? surfaceScript.kind
        : assemblyScript
          ? "assembly"
          : scenePallet
            ? "pry"
            : "idle";

  if (!isBench && !script) {
    return null;
  }

  const keyHints: Array<[string, string]> = heldTool
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
              // turns over
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
        data-work-x={workPlacement ? workPlacement.xIn.toFixed(2) : undefined}
        data-work-y={workPlacement ? workPlacement.yIn.toFixed(2) : undefined}
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
          onToggle={(toolId) =>
            setHeldTool((current) => (current === toolId ? null : toolId))
          }
        />
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
