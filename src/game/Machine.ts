import { LRUCache } from "typescript-lru-cache";
import type { ConsumableAmount } from "./Consumable";
import { MaterialInstance } from "./Materials";
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
import { lunchboxPlaner } from "./machines/lunchboxPlaner";
import { miterSaw } from "./machines/miterSaw";
import { storageRack } from "./machines/storageRack";
import { workspace } from "./machines/workspace";
import {
  worktable1x1,
  worktable1x2,
  worktable1x3,
  worktable2x2,
} from "./machines/worktables";

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
  readonly freeCellsNeeded: ReadonlyArray<Vector>;
  readonly operationPosition?: Vector;
  /**
   * The station has no front: it's worked from any cell touching its
   * footprint, so `operationZone` is the whole ring around it rather than
   * an apron in front of one operation cell. A garbage can is the case —
   * you toss things in from wherever you're standing. Such a machine still
   * has no `operationPosition`, so it drops anywhere it fits (see
   * docs/carrying-machines.md).
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
   * Stock feeds straight from the player's hands into the machine — there
   * is no staged input bay (`inputSpaces` should be 0) and no mode to
   * pick. Operating a direct-feed machine runs the first operation that
   * accepts something the player is carrying (see findFeedableOperation);
   * on a machine with several operations their input specs are disjoint,
   * so the stock itself decides — feed a rough board to the jointer and
   * it's a face pass, feed a face-jointed one and it's the edge. A real
   * machine has no "load" step separate from presenting the work.
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
   * The verb the UI uses for setting stock down here. Defaults to "load"
   * ("set stock on it" on a direct-feed machine's table); the garbage can
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

export const MACHINE_TYPES = {
  workspace,
  worktable1x1,
  worktable1x2,
  worktable1x3,
  worktable2x2,
  jobsiteTableSaw,
  miterSaw,
  lunchboxPlaner,
  jointer,
  bandSaw,
  garbageCan,
  storageRack,
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
   * The machine pulls the stock through on its own once fed (the planer's
   * power feed): the player doesn't have to stand there, so attended
   * phases keep ticking — with the dust, noise, and dust-slowdown of any
   * machine cut — while they walk off. Power is still required; switching
   * the machine off still pauses the cut. Unlike a phase with
   * `attended: false` (glue curing), this is active machine work.
   */
  readonly powerFeed?: boolean;
  /** Skill that must be unlocked before this recipe is usable (see Skill.ts). */
  readonly requiredSkill?: SkillId;
  /**
   * Shop supplies drawn from GameState.consumables when the operation
   * starts (no refunds — the glue is already out of the bottle).
   */
  readonly requiredConsumables?: ReadonlyArray<ConsumableAmount>;
  /**
   * Clamps this operation ties up while it runs — checked against the free
   * ones before it can start, and released when it finishes. Unlike
   * supplies these are borrowed, not spent, so a wide glue-up doesn't cost
   * money, it costs the rack (see Clamp.ts).
   */
  readonly requiredClamps?: number;
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
   * GameState (job offers, commissions) must stay declarative or they'd
   * silently lose the predicate on save/load.
   */
  readonly matches?: (material: MaterialInstance) => boolean;
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
   * Tools granted on completion (delivered to tool storage). This is how
   * shop-made jigs like the crosscut sled come into the world — some
   * recipes produce tooling, not product.
   */
  toolOutputs?: ReadonlyArray<ToolId>;
  /**
   * Supplies recovered on completion (added to GameState.consumables) —
   * e.g. the nails that come out of a dismantled pallet.
   */
  consumableOutputs?: ReadonlyArray<ConsumableAmount>;
  /**
   * Machines granted on completion (landed as delivery crates beside the
   * bench, to be carried into place). Shop-built furniture — worktables —
   * enters the world this way, the machine sibling of toolOutputs.
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
   * why a machine can usefully carry one of each. See
   * docs/direct-feed-machines.md.
   */
  readonly presentation?: "slide" | "rotate";
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
   * of every mounted tool, minus the ones a mounted jig physically
   * displaces (ToolType.supersedes).
   */
  get operations(): ReadonlyArray<Operation> {
    const tools = this.state.tools.map((toolId) => TOOL_TYPES[toolId]);
    const superseded = new Set(tools.flatMap((tool) => tool.supersedes ?? []));
    return [
      ...this.type.operations.filter((op) => !superseded.has(op.id)),
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
