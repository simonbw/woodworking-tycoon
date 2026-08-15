import { z } from "zod";
import { Persistence } from "../../config/constants";
import { TickLayerName } from "../../config/tickLayers";
import { BaseEntity } from "../../core/entity/BaseEntity";
import { Entity } from "../../core/entity/Entity";
import { on } from "../../core/entity/handler";
import {
  awayTripSchema,
  directionSchema,
  machineStateSchema,
  materialSchema,
  vectorSchema,
} from "../../game/gameStateSchema";
import { MachineState } from "../../game/Machine";
import { MaterialInstance } from "../../game/Materials";
import { AwayTrip, HAND_CAPACITY } from "../../game/Person";
import {
  BASE_WALK_SPEED,
  cellCenter,
  directionFromInput,
  motionCell,
  stepPlayerMotion,
} from "../../game/player-motion";
import { Direction, Vector } from "../../game/Vectors";
import { buildCollisionWorld } from "../collision";
import {
  registerSerializable,
  SerializableEntity,
} from "../save/serialization";
import { TimeFlow } from "../TimeFlow";

/**
 * The player, as a sim entity — exemplar #1 for the entity ports (see
 * MIGRATION.md phase 2).
 *
 * What it owns is the old world's `Person` slice plus the continuous
 * body the React hook (`useWalkingBody`) used to keep: the body is a
 * point with a radius integrated at the engine rate from `moveInput`,
 * colliding with the lot's geometry and every "solids"-tagged entity
 * (see collision.ts). `position` is the body's continuous position; the
 * cell underfoot the simulation thinks in is derived (`cell`).
 *
 * Two time streams meet here, per the migration's architecture: the body
 * integrates on raw engine dt (movement is presentation-speed, never
 * scaled by the game clock), while `busyTicks` — game minutes the player
 * is still occupied by their last action — burns down on TimeFlow's
 * gameDt. The entity registers itself with TimeFlow: a busy body at home
 * is a spender (working pace), the held wait key is the waiting
 * provider, and being home in bed is the hard stop.
 *
 * Transient key state (`operating`, `waiting`, `sweepAim`, `moveInput`)
 * is deliberately unserialized, exactly like the old world: a load
 * starts with the hands empty of every key.
 */

const schema = z.object({
  name: z.string(),
  /** Continuous body position, in lot cell coordinates. */
  position: vectorSchema,
  direction: directionSchema,
  inventory: z.array(materialSchema),
  carriedMachine: machineStateSchema.nullable(),
  busyTicks: z.number(),
  away: awayTripSchema.nullable(),
});

/** The parsed shape, with the shared game types restored. */
export interface PlayerData {
  name: string;
  position: Vector;
  direction: Direction;
  inventory: ReadonlyArray<MaterialInstance>;
  carriedMachine: MachineState | null;
  busyTicks: number;
  away: AwayTrip | null;
}

/** Where a fresh shop's player stands (the old initialGameState's cell). */
const INITIAL_CELL: Vector = [6, 12];

export class Player extends BaseEntity implements Entity, SerializableEntity {
  readonly saveType = "player";
  id = "player";
  tickLayer: TickLayerName = "player";
  persistenceLevel: number = Persistence.Game;

  name: string;
  /** Continuous body position, in lot cell coordinates. */
  position: Vector;
  direction: Direction;
  inventory: MaterialInstance[];
  carriedMachine: MachineState | null;
  /** Game minutes still owed to the last action (trudging, sweeping). */
  busyTicks: number;
  away: AwayTrip | null;

  // ---- Transient input state (never serialized) ----
  /** The movement input driving the body, [-1..1] per axis. */
  moveInput: Vector = [0, 0];
  /** Whether the operate key is held right now. */
  operating = false;
  /** Whether the wait key is held right now. */
  waiting = false;
  /** The cell the mouse steers the broom toward, clamped to reach. */
  sweepAim: Vector | null = null;

  /**
   * Extra walk-speed penalties (deep sawdust, a dragged vac, an active
   * sweep), registered by the systems that own them. Each returns its
   * current penalty; speed divides by one plus their sum.
   */
  private speedPenalties = new Set<() => number>();

  private unregisterSpender: (() => void) | null = null;

  constructor(data?: Partial<PlayerData>) {
    super();
    this.name = data?.name ?? "Player";
    this.position = data?.position
      ? [...data.position]
      : cellCenter(INITIAL_CELL);
    this.direction = data?.direction ?? 1;
    this.inventory = [...(data?.inventory ?? [])];
    this.carriedMachine = data?.carriedMachine ?? null;
    this.busyTicks = data?.busyTicks ?? 0;
    this.away = data?.away ?? null;
  }

  /** The cell underfoot — what the simulation reasons about. */
  get cell(): Vector {
    return motionCell(this.position);
  }

  /** Arm room left over what's already carried. */
  get handSpaceLeft(): number {
    return Math.max(0, HAND_CAPACITY - this.inventory.length);
  }

  /**
   * Whether the player is free to start work right now: in the shop and
   * not still occupied by their last action.
   */
  canWork(): boolean {
    return this.away === null && this.busyTicks === 0;
  }

  /** Register an extra walk-speed penalty; returns the unregister. */
  registerSpeedPenalty(penalty: () => number): () => void {
    this.speedPenalties.add(penalty);
    return () => this.speedPenalties.delete(penalty);
  }

  /** Walking pace right now, in cells per second. */
  walkSpeed(): number {
    let penalty = 0;
    for (const provider of this.speedPenalties) {
      penalty += provider();
    }
    return BASE_WALK_SPEED / (1 + penalty);
  }

  @on("afterAdded")
  onAfterAdded() {
    const timeFlow = this.game.entities.tryGetSingleton(TimeFlow);
    if (timeFlow) {
      this.unregisterSpender = timeFlow.registerSpender(
        () => this.busyTicks > 0 && this.away === null,
      );
      timeFlow.setWaitingProvider(() => this.waiting);
      timeFlow.setStopProvider(() => this.away?.kind === "home");
    }
  }

  @on("destroy")
  onDestroy() {
    this.unregisterSpender?.();
    this.unregisterSpender = null;
  }

  @on("tick")
  onTick(dt: number) {
    // Busy time burns one minute per sim tick, exactly like the old
    // world's playerTickPass; it doesn't burn while away (a sweep waits
    // where it was left).
    const timeFlow = this.game.entities.tryGetSingleton(TimeFlow);
    if (timeFlow && this.busyTicks > 0 && this.away === null) {
      this.busyTicks = Math.max(0, this.busyTicks - timeFlow.wholeTicks);
    }

    // The body moves on raw dt — never while out of the shop.
    if (this.away === null) {
      const [ix, iy] = this.moveInput;
      if (ix !== 0 || iy !== 0) {
        this.direction = directionFromInput(this.moveInput, this.direction);
        this.position = stepPlayerMotion(
          this.position,
          this.moveInput,
          this.walkSpeed(),
          dt,
          buildCollisionWorld(this.game, { truckParked: true }),
        );
      }
    }
  }

  toJSON(): PlayerData {
    return {
      name: this.name,
      position: [...this.position] as [number, number],
      direction: this.direction,
      inventory: this.inventory.map((m) => ({ ...m })),
      carriedMachine: this.carriedMachine ? { ...this.carriedMachine } : null,
      busyTicks: this.busyTicks,
      away: this.away ? (structuredClone(this.away) as AwayTrip) : null,
    };
  }
}

registerSerializable({
  type: "player",
  singleton: true,
  schema,
  fromJSON: (data) => new Player(data as unknown as PlayerData),
});
