import { LRUCache } from "typescript-lru-cache";
import type { BenchPlacement } from "./bench-work/bench-layout";
import type { ConsumableAmount } from "./Consumable";
import { FinishedProductType, MaterialInstance } from "./Materials";
import type { BlueprintId } from "./bench-work/blueprint";
import { SkillId } from "./Skill";
import { TOOL_TYPES, ToolId } from "./Tool";
import { UPGRADE_TYPES, UpgradeId } from "./Upgrade";
import {
  Direction,
  rotateVec,
  translateVec,
  Vector,
  vectorEquals,
  vectorKey,
} from "./Vectors";
import { bandSaw } from "./machines/bandSaw";
import { garbageCan } from "./machines/garbageCan";
import { jobsiteTableSaw } from "./machines/jobsiteTableSaw";
import { jointer } from "./machines/jointer";
import { lumberShelf } from "./machines/lumberShelf";
import { lunchboxPlaner } from "./machines/lunchboxPlaner";
import { miterSaw } from "./machines/miterSaw";
import { sawhorses } from "./machines/sawhorses";
import { storageRack } from "./machines/storageRack";
import { workspace } from "./machines/workspace";
import { worktable1x1, worktable1x2 } from "./machines/worktables";

/**
 * One solid piece of a machine, in cell units in the machine's local
 * (unrotated) frame, with the origin cell's center at [0, 0] — so a box
 * exactly filling a 1×1 machine's tile is min [-0.5, -0.5],
 * max [0.5, 0.5]. A machine's silhouette is a *list* of these, so a
 * concave machine (a jointer's narrow beds on a wide body) doesn't cast
 * one fat invisible wall. The player's body collides with the shapes
 * instead of the full cellsOccupied tiles (see
 * docs/continuous-movement.md). Everything else — placement, targeting,
 * attendance — still works on whole cells, and the shape union is capped
 * below the player's radius inside the footprint so the cell underfoot
 * can never be a machine's (see machine-collision.ts).
 */
export type CollisionShape =
  | { readonly kind: "box"; readonly min: Vector; readonly max: Vector }
  | {
      readonly kind: "circle";
      readonly center: Vector;
      readonly radius: number;
    };

/**
 * The center of a footprint's bounding box, in cell units relative to the
 * origin cell's center — [0, -0.5] for a 3×2 machine occupying rows -1..0.
 * Image-based machine art mounts here (canvas center = this point), and
 * the collision-box generator applies the same offset to its measurements,
 * so art always sits centered in the cells it claims.
 */
export function footprintCenter(cells: ReadonlyArray<Vector>): Vector {
  const xs = cells.map(([x]) => x);
  const ys = cells.map(([, y]) => y);
  return [
    (Math.min(...xs) + Math.max(...xs)) / 2,
    (Math.min(...ys) + Math.max(...ys)) / 2,
  ];
}

export interface MachineType {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly operations: ReadonlyArray<Operation>;
  readonly cellsOccupied: ReadonlyArray<Vector>;
  /**
   * See CollisionShape. Measured from the sprite art for image-based
   * machines (machine-collision-boxes.generated.ts), hand-set for
   * procedurally drawn ones. Omitted: the full cellsOccupied tiles block.
   */
  readonly collisionShapes?: ReadonlyArray<CollisionShape>;
  /**
   * The working surface of a bench, in inches, when it isn't simply the
   * footprint's bounding box — the makeshift bench's plywood top is
   * smaller than the paint buckets holding it up. Centered on the
   * footprint, and it's what stock is laid out on and clamped to (see
   * bench-work/bench-layout.ts). Worktables omit it: they're all top.
   */
  readonly benchTopIn?: { readonly widthIn: number; readonly heightIn: number };
  readonly freeCellsNeeded: ReadonlyArray<Vector>;
  readonly operationPosition?: Vector;
  /**
   * The station has no front: it's worked from any cell touching its
   * footprint, so `operationZone` is the whole ring around it rather than
   * an apron in front of one operation cell. A garbage can is the case —
   * you toss things in from wherever you're standing. Such a machine still
   * has no `operationPosition`, so it drops anywhere it fits (see
   * game-actions/machine-actions.ts).
   */
  readonly operableFromAnySide?: boolean;
  /**
   * Where finished stock lands on feed-through machines (planer, jointer,
   * table saw): the cell opposite the operation cell. Outputs are collected
   * standing there, not at the infeed. Omitted for single-point stations
   * like the miter saw and benches, where outputs stay at the machine.
   */
  readonly outputPosition?: Vector;
  readonly cost: number;
  /**
   * Materials the station can hold on its shelf (0 = no shelf). Stored
   * stock lives in MachineState.storedMaterials — a parking spot, not an
   * input queue.
   */
  readonly materialStorage: number;
  readonly toolSlots: number;
  readonly className?: string;
  readonly inputSpaces: number;
  /**
   * Attended hand work at this station runs this much faster (1 = the
   * makeshift baseline). A solid worktable holds the work still; hands-free
   * phases (glue curing) don't care where the clamps sit.
   */
  readonly workSpeed?: number;
  /**
   * The machine has an on/off switch the player must flip before operating
   * it, and the motor keeps running until switched off. Stationary power
   * tools (planer, jointer, table saw) have one; trigger tools like the
   * miter saw and unpowered benches don't.
   */
  readonly powerSwitch?: boolean;
  /**
   * The machine runs on a motor, so the shop view trails a power cord from
   * it to the nearest wall outlet (see shop-view/power-cords.ts). Purely
   * cosmetic. Independent of `powerSwitch`: the trigger-operated miter saw
   * has no switch but still plugs in.
   */
  readonly corded?: boolean;
  /**
   * The interface is the machine: no mode picker and no control panel.
   * A direct-feed machine is persistent settings plus one piece of
   * stock set down on it (F), run by holding Space — which operation
   * runs is inferred from what's on the machine (findFeedableOperation).
   * On a machine with several operations their input specs are
   * disjoint, so the stock itself decides — feed a rough board to the
   * jointer and it's a face pass, feed a face-jointed one and it's the
   * edge; where one board could honestly take two cuts,
   * `Operation.stockOrientation` splits them by how the stock is
   * presented. A real machine has no "load" step separate from
   * presenting the work, so the bay is the machine's table
   * (`inputSpaces: 1`).
   *
   * The settings are one bag shared across the machine's operations
   * (resolvedParameters fills per-op defaults), locked while a cut is
   * running, and read again at finish — the output reflects the dial,
   * not a snapshot at start. When a piece won't run, the machine
   * teaches its refusal (explainFeedRefusal) instead of graying out.
   */
  readonly directFeed?: boolean;
  /**
   * Stock travels in a straight line through the machine — in at the
   * operation side, out the other — so running long stock needs clear
   * lane beyond the static freeCellsNeeded, scaled to the stock's
   * length (see feed-clearance.ts). The planer, jointer, table saw, and
   * band saw feed through; the miter saw doesn't (the stock stays put
   * and the blade drops), which is deliberate — chopping long stock
   * down must always be possible, or an 8' board could never get
   * shorter.
   */
  readonly feedsThrough?: boolean;
  /**
   * The verb the UI uses for operating this machine. Defaults to "run";
   * feed-through machines say "Feed", the miter saw says "Cut" — nothing
   * is fed through a chop saw — and the garbage can says "Empty".
   */
  readonly feedVerb?: string;
  /**
   * The verb the UI uses for setting stock down here — the chip reads
   * "<verb> <the piece in hand>". Defaults to "place"; the garbage can
   * says "toss in".
   */
  readonly stageVerb?: string;
  /**
   * A station that only holds stock — its sheet is its contents, not a
   * plan picker, even when it has an operation of its own (the garbage
   * can's Empty). See ContentsSheet. A container is opened rather than
   * reached into: it takes stock from F on the floor but never answers
   * the interact key, so what's inside comes back out through the sheet.
   */
  readonly container?: boolean;
  /** A small machine that can sit on a worktable instead of the floor. */
  readonly benchtop?: boolean;
  /** A work surface benchtop machines can be mounted onto. */
  readonly worktable?: boolean;
  /**
   * How many upgrades (vise, drawers, …) this station can carry. Only
   * worktables have any; see Upgrade.ts.
   */
  readonly upgradeSlots?: number;
}

/**
 * A bench: a station where hand work happens on the work surface — the
 * makeshift workbench and every built worktable. Benches take any stock
 * a bench recipe could ever want (a bench is a table; you can set things
 * on a table) and host the bench view's tool-driven work, as opposed to
 * direct-feed machines (the stock decides the cut) and containers.
 */
export function isBenchType(type: MachineType): boolean {
  return type.worktable === true || type.id === "workspace";
}

/**
 * Whether this station is worked from the shop floor: a plan to pick, a
 * setting to dial, a hold to run it.
 *
 * Direct-feed machines are — the floor is their whole interface, which is
 * the point of them. So is the garbage can: Space empties it where it
 * stands. A bench is not. Since the bench view took hand work over
 * (docs/bench-work.md), a bench out on the floor is a table and nothing
 * more — you set stock on it, take stock off it, carry it, and lean into
 * it. Choosing the work, dialing it, and doing it all happen in there,
 * over the bench top, with the drawing and the tool rail in front of
 * you. So out here the bench wears no operation chips and answers no
 * operation keys: it has no control panel to offer.
 */
export function hasFloorControls(type: MachineType): boolean {
  return !isBenchType(type);
}

export const MACHINE_TYPES = {
  workspace,
  worktable1x1,
  worktable1x2,
  jobsiteTableSaw,
  miterSaw,
  lunchboxPlaner,
  jointer,
  bandSaw,
  garbageCan,
  storageRack,
  lumberShelf,
  sawhorses,
} satisfies { [id: string]: MachineType };
export type MachineId = keyof typeof MACHINE_TYPES;

/**
 * One stretch of an operation. Attended phases only progress while the
 * player is standing at the machine's operation cell; phases with
 * attended: false run on their own (glue curing, and someday kilns and
 * finishes). An operation can't ENTER an attended phase without the player
 * there — it sits ready until they arrive.
 */
export interface OperationPhase {
  readonly name: string;
  readonly duration: number;
  readonly attended: boolean;
}

/**
 * How stock sits on a saw table: lying flat on a face, or standing on edge
 * against a tall fence. One physical fact per machine, kept in the shared
 * settings bag under `stockOrientation` (see stockOrientationParameter) and
 * flipped with R like any other rotating setting — turning the workpiece
 * over is the shop's most literal rotation.
 */
export type StockOrientation = "on edge" | "flat";

/**
 * The settings-bag parameter that records which way stock sits on the
 * machine. Declared by every operation that needs the stock a particular
 * way (see Operation.stockOrientation), with one consistent defaultValue
 * per machine — the bag is shared, so disagreeing defaults would leave the
 * machine in two modes at once.
 *
 * (The values are a literal in here, not a module const: machine modules
 * call this while Machine.ts is still initializing — the MACHINE_TYPES
 * cycle — where a top-level const would still be in its temporal dead
 * zone.)
 */
export function stockOrientationParameter(
  defaultValue: StockOrientation,
): OperationParameter {
  return {
    id: "stockOrientation",
    name: "Stock",
    values: ["on edge", "flat"] satisfies StockOrientation[],
    defaultValue,
    presentation: "rotate",
  };
}

/**
 * How the player performs an operation's attended work with their own
 * hands in the bench view (see docs/bench-work.md). Declaring this
 * converts the operation: it no longer advances on held Space — the bench
 * view runs the script and commits through the actions in
 * `game-actions/operation-actions.ts`. Omitted, the operation keeps the
 * legacy attended-tick behavior (the op-by-op migration path).
 *
 * One small gesture vocabulary, composed per operation: strokes (coverage
 * work), points (pry a nail, place a clamp, drive a fastener, snap a
 * part), and marks (the hand saw's cut line).
 */
export type OperationInteraction =
  | {
      /** Drag the tool across the workpiece to full coverage: sanding,
       * planing. Brush size and speed are the tool's feel — a block is
       * narrow and slow, the orbit sander wide and fast. */
      readonly kind: "stroke";
      /** Brush diameter on the workpiece, in inches. */
      readonly brushWidthIn: number;
      /** Coverage laid down per second of active stroking, in in²/s —
       * with area from the actual workpiece, this IS the work budget. */
      readonly coveragePerSecond: number;
      /** Where the strokes land: a face, or the narrow edge band. */
      readonly band?: "face" | "edge";
      /** The tool does its own scrubbing: held down, it keeps working
       * the spot under the pad even while the hand rests (the orbit
       * sander's orbit). Unpowered tools only cut while they move. */
      readonly powered?: boolean;
    }
  | {
      /** Mark the cut line, then push–pull strokes deepen the kerf. The
       * budget scales with the stock's cross-section. */
      readonly kind: "saw";
      /** Kerf area cut per second of stroking, in in² of cross-section
       * per second (width × thickness quarters / 4). */
      readonly kerfPerSecond: number;
    }
  | {
      /** Pry marked nails one at a time; every pull commits immediately
       * (see pryPalletNailAction — the pallet transforms nail by nail). */
      readonly kind: "pry";
    }
  | {
      /** A glue-up on the bench scene, clamps first: no plan is ever
       * selected — the contiguous edge-to-edge run lying in the clamps
       * decides the composition (bench-work/glue-up.ts), the glue is
       * spread along the open seams, and tightening the last clamp
       * commits start + cure in one stroke. The recipes declaring this
       * kind are the credited shapes (previews, the manual, the legacy
       * driver path), not pickable plans. */
      readonly kind: "glue";
    }
  | {
      /** Lay each part on its ghost slot on the bench scene, then
       * drive a fastener at every derived point — the blueprint (see
       * bench-work/blueprint.ts, resolved via productBlueprintFor,
       * referenced by id to keep this module import-light) is the
       * whole script: slots, orientations, fasteners. Product and
       * equipment builds alike; every assembly has one. */
      readonly kind: "assembly";
      readonly blueprint: BlueprintId;
    };

export interface Operation<TParams extends ParameterValues = ParameterValues> {
  readonly id: string;
  readonly name: string;
  /** Total ticks; must equal the sum of phases when phases are declared. */
  readonly duration: number;
  /**
   * Omitted for ordinary hand work: the whole duration is one attended
   * phase. Declared only when part of the operation runs without you.
   */
  readonly phases?: ReadonlyArray<OperationPhase>;
  /**
   * What the station reads out while this is under way, when "running" is
   * the wrong word for it — a garbage can being emptied isn't running.
   * Phased operations name their current phase instead and don't need it.
   */
  readonly runningName?: string;
  /**
   * The machine pulls the stock through on its own once fed (the planer's
   * power feed): the player doesn't have to stand there, so attended
   * phases keep ticking — with the dust, noise, and dust-slowdown of any
   * machine cut — while they walk off. Power is still required; switching
   * the machine off still pauses the cut. Unlike a phase with
   * `attended: false` (glue curing), this is active machine work.
   */
  readonly powerFeed?: boolean;
  /**
   * The hand-work script for this operation's attended stretch (see
   * OperationInteraction). Declared, the bench view owns the work and the
   * tick never advances the attended phase; omitted, held Space does.
   */
  readonly interaction?: OperationInteraction;
  /** Skill that must be unlocked before this recipe is usable (see Skill.ts). */
  readonly requiredSkill?: SkillId;
  /**
   * The way the stock must sit on the table for this to be the cut that
   * runs: a band saw rips a board lying flat and resaws one standing on
   * edge. Omitted, the operation doesn't care how the stock sits and is
   * never gated by it. Declaring this keeps two operations that would
   * accept the same board disjoint — the machine's current orientation
   * (see stockOrientation in machine-helpers) picks between them, and R
   * turns the stock over.
   */
  readonly stockOrientation?: StockOrientation;
  /**
   * Shop supplies drawn from GameState.consumables when the operation
   * starts (no refunds — the glue is already out of the bottle).
   */
  readonly requiredConsumables?: ReadonlyArray<ConsumableAmount>;
  /**
   * Clamps tied up for the operation's run, returned when it finishes
   * (see Clamp.ts). Declared only for work that pins something down and
   * isn't a glue-up — a glue-up derives its count from the stock's
   * length instead, and doesn't set this.
   */
  readonly clampsHeld?: number;
  /**
   * Sawdust thrown per attended tick while this runs, landed around the
   * machine (see Dust.ts). Omitted: no appreciable mess (assembly, glue).
   */
  readonly dustOutput?: number;
  /**
   * Settings this operation exposes (the saw's angle detents, the
   * planer's depth stop). Omitted for ordinary fixed recipes; consumers
   * read it through `operationParameters`.
   */
  readonly parameters?: ReadonlyArray<OperationParameter>;
  /**
   * The stock this operation takes, given its resolved settings. Fixed
   * recipes ignore the argument and return a constant list.
   */
  readonly getInputMaterials: (
    params: TParams,
  ) => ReadonlyArray<InputMaterialWithQuantity>;
  readonly output: (
    materials: ReadonlyArray<MaterialInstance>,
    params: TParams,
  ) => OperationOutput;
  /**
   * The mentor line for stock this operation refuses: given a carried
   * material that doesn't meet the inputs (and the resolved parameters),
   * say why in the machine's own vocabulary — "no flat reference face",
   * "can't ride the fence". Return null to fall back to the generic
   * requirement description. See explainFeedRefusal in machine-helpers.
   */
  readonly explainRejection?: (
    material: MaterialInstance,
    params?: ParameterValues,
  ) => string | null;
}

/** An operation's declared settings ([] for fixed recipes). */
export function operationParameters(
  operation: Operation,
): ReadonlyArray<OperationParameter> {
  return operation.parameters ?? [];
}

/**
 * The parameter values a freshly-selected operation starts with: each
 * parameter's declared resting value, or its first listed one. {} for
 * fixed recipes.
 */
export function defaultParametersFor(operation: Operation): ParameterValues {
  const params: ParameterValues = {};
  for (const param of operationParameters(operation)) {
    params[param.id] = param.defaultValue ?? param.values[0];
  }
  return params;
}

export type InputMaterial<T extends MaterialInstance = MaterialInstance> = {
  [K in keyof T]?: ReadonlyArray<T[K]>;
} & {
  /**
   * Escape hatch for constraints the flat allowed-values fields can't
   * express (e.g. conditions on a panel's strip list). Checked in addition
   * to the flat fields by materialMeetsInput.
   *
   * NOT serializable — recipe constants only. Requirements that live in
   * GameState must stay declarative or they'd silently lose the
   * predicate on save/load.
   */
  readonly matches?: (material: MaterialInstance) => boolean;
  /**
   * What the `matches` predicate demands, in shop language ("one end
   * mitered 45°"). A predicate is invisible to the requirement
   * describer, so any recipe that gates on one should say what it wants
   * here — the sheet and the slot tip render this as a qualifier.
   */
  readonly matchesNote?: string;
  /**
   * Minimum derived width in inches for panel requirements — a panel's
   * width lives in its strip list, not a flat field, so allowed-value
   * arrays can't express "at least this wide". Serializable, unlike
   * `matches`, so generated job offers can ask for wide glue-ups.
   */
  readonly minPanelWidth?: number;
};

export type InputMaterialWithQuantity<
  T extends MaterialInstance = MaterialInstance,
> = InputMaterial<T> & {
  readonly quantity: number;
};

export interface OperationOutput {
  inputs: ReadonlyArray<MaterialInstance>;
  outputs: ReadonlyArray<MaterialInstance>;
  /**
   * Supplies recovered on completion (added to GameState.consumables) —
   * e.g. the nails that come out of a dismantled pallet.
   */
  consumableOutputs?: ReadonlyArray<ConsumableAmount>;
  /**
   * Machines granted on completion (landed as delivery crates beside the
   * bench, to be carried into place). Shop-built furniture — worktables —
   * enters the world this way. (Shop-made tooling like the crosscut sled
   * is just a regular output: tools are materials.)
   */
  machineOutputs?: ReadonlyArray<MachineId>;
  /**
   * Worktable upgrades granted on completion (delivered to upgrade
   * storage) — how the shop-built drawers and shelves come into the
   * world.
   */
  upgradeOutputs?: ReadonlyArray<UpgradeId>;
}

// Parameterized operation system
export interface OperationParameter<T = number | string> {
  readonly id: string;
  readonly name: string;
  readonly values: ReadonlyArray<T>;
  /**
   * Where a fresh machine's setting rests. Defaults to the first value —
   * declare this when the natural resting detent sits mid-scale, like the
   * saw head parked square in the middle of its swing.
   */
  readonly defaultValue?: T;
  /** Suffix appended to numeric values in the UI. Defaults to inches. */
  readonly unit?: string;
  /**
   * How the setting is drawn and driven, and which key drives it.
   *
   * "slide" positions the stock itself (the board under the miter saw's
   * blade) instead of a printed detent scale, and the key slides it
   * between marks it can actually reach. "rotate" is a setting you swing
   * rather than shift — the miter head off square.
   *
   * Everything else is a plain linear scale. Linear settings (slide
   * included) answer to Z/X; a "rotate" setting answers to R, which is
   * why a machine can usefully carry one of each.
   */
  readonly presentation?: "slide" | "rotate";
  /**
   * How many detents a shifted press jumps. Declare it on a scale whose
   * marks are fine enough that walking them one at a time is a chore —
   * the miter saw's inch marks, where shift moves a whole foot. Left off,
   * shift steps one detent like a bare press.
   */
  readonly coarseStep?: number;
}

export type ParameterValues = Record<string, number | string>;

export interface OperationProgress {
  readonly status: "notStarted" | "inProgress" | "finished";
  /** Index into the operation's phase list (0 for single-phase ops). */
  readonly phaseIndex: number;
  /**
   * Ticks left in the current phase. 0 while inProgress means the phase
   * finished but the next one is attended and waiting for the player.
   */
  readonly ticksRemaining: number;
}

/**
 * Serializable machine state - the source of truth
 * Uses IDs instead of object references so it can be JSON.stringify'd
 */
export interface MachineState {
  readonly machineTypeId: MachineId;
  readonly position: Vector;
  readonly rotation: Direction;
  readonly selectedOperationId: string;
  readonly selectedParameters?: ParameterValues;
  readonly operationProgress: OperationProgress;
  readonly inputMaterials: ReadonlyArray<MaterialInstance>;
  readonly processingMaterials: ReadonlyArray<MaterialInstance>;
  readonly outputMaterials: ReadonlyArray<MaterialInstance>;
  /** Handheld tools mounted at this station (max: type.toolSlots) */
  readonly tools: ReadonlyArray<ToolId>;
  /**
   * Materials parked on the station's shelf (max: the Machine view's
   * materialStorage). Optional so pre-shelf saves load untouched.
   */
  readonly storedMaterials?: ReadonlyArray<MaterialInstance>;
  /**
   * Upgrades installed at this station (max: type.upgradeSlots).
   * Optional so pre-upgrade saves load untouched.
   */
  readonly upgrades?: ReadonlyArray<UpgradeId>;
  /**
   * Whether the machine's power switch is flipped on. Only meaningful on
   * types with `powerSwitch`; optional so pre-switch saves load untouched
   * (machines come up switched off, like after any power outage).
   */
  readonly poweredOn?: boolean;
  /**
   * Where each staged piece lies on a bench's top, keyed by material id
   * (see bench-work/bench-layout.ts). Real state, not view state: the
   * arrangement survives closing the bench view and shows in the shop
   * view. Pieces without an entry sit at their seeded default; stale ids
   * are pruned whenever the layout is written.
   */
  readonly benchLayout?: Readonly<Record<string, BenchPlacement>>;
}

/**
 * A cell plus its eight neighbors, minus the given footprint cells.
 * Empty when the anchor is null (machines with no operation position).
 */
function zoneAround(anchor: Vector | null, excluded: Vector[]): Vector[] {
  if (anchor === null) {
    return [];
  }
  const zone: Vector[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cell: Vector = [anchor[0] + dx, anchor[1] + dy];
      if (!excluded.some((occupied) => vectorEquals(occupied, cell))) {
        zone.push(cell);
      }
    }
  }
  return zone;
}

/**
 * Every cell touching the footprint, the footprint itself excluded — the
 * band you can stand in to reach a machine with no front (see
 * MachineType.operableFromAnySide).
 */
function ringAround(footprint: Vector[]): Vector[] {
  const occupied = new Set(footprint.map(vectorKey));
  const ring = new Map<string, Vector>();
  for (const [x, y] of footprint) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cell: Vector = [x + dx, y + dy];
        const key = vectorKey(cell);
        if (!occupied.has(key)) {
          ring.set(key, cell);
        }
      }
    }
  }
  return [...ring.values()];
}

/**
 * Whether two machine states refer to the same placed machine. Position
 * alone isn't enough: a benchtop machine mounted on a worktable shares the
 * table's anchor cell, so identity is position plus type. (Two machines of
 * the same type can never share a cell.)
 */
export function isSameMachine(a: MachineState, b: MachineState): boolean {
  return (
    a.machineTypeId === b.machineTypeId &&
    a.position[0] === b.position[0] &&
    a.position[1] === b.position[1]
  );
}

/**
 * Stable string identity for a placed machine — the key form of
 * isSameMachine (type + anchor cell). Used wherever a machine needs to key
 * a Map or a React list (sound voices, sheet targeting, render keys).
 */
export function machineKey(state: MachineState): string {
  return `${state.machineTypeId}@${vectorKey(state.position)}`;
}

/**
 * Machine view class - provides convenient access to MachineType and operations
 * Similar to CellMap pattern - a computed view over the raw state
 */
export class Machine {
  readonly state: MachineState;

  constructor(state: MachineState) {
    this.state = state;
  }

  // Computed properties with lookups
  get type(): MachineType {
    const machineType = MACHINE_TYPES[this.state.machineTypeId];
    if (!machineType) {
      throw new Error(`Unknown machine type: ${this.state.machineTypeId}`);
    }
    return machineType;
  }

  /**
   * All operations available at this station: the machine's own plus those
   * of every mounted tool. Two operations that would accept the same stock
   * stay disjoint through Operation.stockOrientation, not by hiding one.
   */
  get operations(): ReadonlyArray<Operation> {
    const tools = this.state.tools.map((toolId) => TOOL_TYPES[toolId]);
    return [
      ...this.type.operations,
      ...tools.flatMap((tool) => tool.operations),
    ];
  }

  get selectedOperation(): Operation {
    const operation = this.selectedOperationOrNull;
    if (!operation) {
      throw new Error(
        `Unknown operation: ${this.state.selectedOperationId} for machine ${this.state.machineTypeId}`,
      );
    }
    return operation;
  }

  /**
   * Like selectedOperation, but null when the id doesn't resolve (e.g. a
   * station whose recipes are all still locked, or "none").
   */
  get selectedOperationOrNull(): Operation | null {
    return (
      this.operations.find((op) => op.id === this.state.selectedOperationId) ??
      null
    );
  }

  /**
   * True when the machine has the power it needs to run: either it has no
   * power switch, or the switch is flipped on.
   */
  get isPowered(): boolean {
    return !this.type.powerSwitch || (this.state.poweredOn ?? false);
  }

  /** Convert a machine-local cell offset into a shop cell. */
  localToShop(local: Vector): Vector {
    return translateVec(rotateVec(local, this.rotation), this.position);
  }

  /** The shop cells this machine's footprint occupies. */
  get occupiedCells(): Vector[] {
    return this.type.cellsOccupied.map((cell) => this.localToShop(cell));
  }

  /**
   * The cells that count as standing at this machine to work it. A body
   * is wider than one 1-ft cell, so the operator "cell" is really the
   * canonical operation position plus its eight neighbors (minus the
   * machine's own footprint) — a small apron in front of the machine.
   */
  get operationZone(): Vector[] {
    if (this.type.operableFromAnySide) {
      return ringAround(this.occupiedCells);
    }
    return zoneAround(this.absoluteOperationPosition, this.occupiedCells);
  }

  /** Same apron, around the outfeed cell — where outputs are collected. */
  get outputZone(): Vector[] {
    return zoneAround(this.absoluteOutputPosition, this.occupiedCells);
  }

  /** The shop cell the player stands in to work this machine, or null. */
  get absoluteOperationPosition(): Vector | null {
    const local = this.type.operationPosition;
    if (local === undefined) {
      return null;
    }
    return this.localToShop(local);
  }

  /** The shop cell where this machine's outputs are collected, or null
   * when outputs stay at the machine itself. */
  get absoluteOutputPosition(): Vector | null {
    const local = this.type.outputPosition;
    if (local === undefined) {
      return null;
    }
    return translateVec(rotateVec(local, this.rotation), this.position);
  }

  // Pass-through properties for convenience
  get position(): Vector {
    return this.state.position;
  }

  get rotation(): Direction {
    return this.state.rotation;
  }

  get selectedParameters(): ParameterValues | undefined {
    return this.state.selectedParameters;
  }

  /**
   * An operation's parameters resolved against this machine's settings
   * bag: its declared defaults filled in under whatever the player has
   * dialed. The one way to get the params an operation would actually run
   * with here. ({} for fixed recipes.)
   */
  resolvedParameters(operation: Operation): ParameterValues {
    return {
      ...defaultParametersFor(operation),
      ...this.state.selectedParameters,
    };
  }

  get operationProgress(): OperationProgress {
    return this.state.operationProgress;
  }

  get inputMaterials(): ReadonlyArray<MaterialInstance> {
    return this.state.inputMaterials;
  }

  get processingMaterials(): ReadonlyArray<MaterialInstance> {
    return this.state.processingMaterials;
  }

  get outputMaterials(): ReadonlyArray<MaterialInstance> {
    return this.state.outputMaterials;
  }

  get storedMaterials(): ReadonlyArray<MaterialInstance> {
    return this.state.storedMaterials ?? [];
  }

  get upgrades(): ReadonlyArray<UpgradeId> {
    return this.state.upgrades ?? [];
  }

  /**
   * The station's effective stats — the type's base values with installed
   * upgrades folded in. Anything reading capacity or speed off a placed
   * machine should come through these, not the raw MachineType.
   */
  get toolSlots(): number {
    return this.upgrades.reduce(
      (slots, id) => slots + (UPGRADE_TYPES[id].extraToolSlots ?? 0),
      this.type.toolSlots,
    );
  }

  get materialStorage(): number {
    return this.upgrades.reduce(
      (spaces, id) => spaces + (UPGRADE_TYPES[id].extraMaterialStorage ?? 0),
      this.type.materialStorage,
    );
  }

  get workSpeed(): number {
    return this.upgrades.reduce(
      (speed, id) => speed * (UPGRADE_TYPES[id].workSpeedFactor ?? 1),
      this.type.workSpeed ?? 1,
    );
  }
}

// Keep computed machines array for game states
const machinesCache = new LRUCache<
  ReadonlyArray<MachineState>,
  ReadonlyArray<Machine>
>({
  maxSize: 100,
});

/**
 * Converts MachineState[] to Machine[] with caching
 * Similar to CellMap.fromGameState pattern
 */
export function getMachines(
  machineStates: ReadonlyArray<MachineState>,
): ReadonlyArray<Machine> {
  if (!machinesCache.has(machineStates)) {
    const machines = machineStates.map((state) => new Machine(state));
    machinesCache.set(machineStates, machines);
  }
  return machinesCache.get(machineStates)!;
}
