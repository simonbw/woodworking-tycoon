import { Persistence } from "../../config/constants";
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
 * A machine standing on the shop floor — exemplar #2 for the entity
 * ports (see MIGRATION.md phase 2).
 *
 * The entity owns its `MachineState` — the same data shape the old world
 * kept in `GameState.machines`, mutated in place through the command
 * layer and the MachineSystem's minute pass. The pure `Machine` class
 * from `src/game/Machine.ts` stays what it always was: a computed view
 * over the state (operations, footprints, parameters), shared with the
 * old world and reachable here through `view()`.
 *
 * Operations advance in the MachineSystem (one pass per sim minute over
 * every machine, exactly the old `machineTickPass`), not per-entity —
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

  state: MachineState;

  constructor(state: MachineState) {
    super();
    this.state = state;
  }

  /** The shared computed view over this machine's state. */
  view(): Machine {
    return new Machine(this.state);
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
