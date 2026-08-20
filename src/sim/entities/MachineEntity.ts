import { Persistence } from "../../config/constants";
import { Game } from "../../core/Game";
import { BaseEntity } from "../../core/entity/BaseEntity";
import { Entity } from "../../core/entity/Entity";
import { machineStateSchema } from "../../game/gameStateSchema";
import {
  Machine,
  MachineState,
  MachineType,
  MACHINE_TYPES,
} from "../../game/Machine";
import { machineSolids } from "../../game/machine-collision";
import { Solid } from "../../game/player-motion";
import { SOLIDS_TAG } from "../collision";
import {
  registerSerializable,
  SerializableEntity,
} from "../save/serialization";

/**
 * A machine standing on the shop floor — the second entity ported to
 * the sim (after `Player`), establishing the pattern the rest followed.
 *
 * The entity owns its `MachineState` — the same data shape the old world
 * kept in `GameState.machines`, mutated in place through the command
 * layer and the MachineSystem's minute pass. The pure `Machine` class
 * from `src/game/Machine.ts` stays what it always was: a computed view
 * over the state (operations, footprints, parameters), shared with the
 * old world and reachable here through `view()`.
 *
 * Operations advance in the MachineSystem (one pass per sim minute over
 * every machine), not per-entity —
 * attendance, dust multipliers, and completion grants read a consistent
 * pre-minute snapshot that way. The progress model stays the serialized
 * `operationProgress` state machine rather than a live coroutine: a save
 * can land mid-cure, and the resumable state IS the progress record.
 */
export class MachineEntity
  extends BaseEntity
  implements Entity, SerializableEntity
{
  readonly saveType = "machine";
  tags = [SOLIDS_TAG];
  persistenceLevel: number = Persistence.Game;

  private _state: MachineState;
  private _view: Machine | null = null;

  constructor(state: MachineState) {
    super();
    this._state = state;
  }

  get state(): MachineState {
    return this._state;
  }

  /** Every mutation replaces the state object (the commands' contract),
   * so assignment is the one place the computed view goes stale. */
  set state(next: MachineState) {
    this._state = next;
    this._view = null;
  }

  /** The computed view over this machine's state — one per state object
   * (issue #230, phase 3: one machine, one object), rebuilt only when a
   * command replaces the state. */
  view(): Machine {
    return (this._view ??= new Machine(this._state));
  }

  get type(): MachineType {
    return MACHINE_TYPES[this.state.machineTypeId];
  }

  getSolids(): ReadonlyArray<Solid> {
    return machineSolids(this.view());
  }

  toJSON(): MachineState {
    return this.state;
  }
}

registerSerializable({
  type: "machine",
  schema: machineStateSchema,
  fromJSON: (data) => new MachineEntity(data as unknown as MachineState),
});

/**
 * Every machine standing on the floor, as its cached view — the entity
 * world's `getMachines`. Skips entities destroyed earlier in the same
 * tick (they stay listed until the tick ends).
 */
export function floorMachines(game: Game): Machine[] {
  return [...game.entities.byConstructor(MachineEntity)]
    .filter((entity) => !entity.isDestroyed)
    .map((entity) => entity.view());
}
