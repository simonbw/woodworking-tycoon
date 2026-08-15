import { z } from "zod";
import { Persistence } from "../../config/constants";
import { BaseEntity } from "../../core/entity/BaseEntity";
import { Entity } from "../../core/entity/Entity";
import { machineStateSchema, vectorSchema } from "../../game/gameStateSchema";
import { MachineState } from "../../game/Machine";
import { Vector } from "../../game/Vectors";
import {
  registerSerializable,
  SerializableEntity,
} from "../save/serialization";

/**
 * A machine boxed up on the shop floor, waiting to be carried into
 * place (the old `GameState.machineCrates` entry). Crates don't block
 * walking — stand on one and pick it up.
 */

const schema = z.object({
  machine: machineStateSchema,
  position: vectorSchema,
});

export class MachineCrateEntity
  extends BaseEntity
  implements Entity, SerializableEntity
{
  readonly saveType = "machineCrate";
  persistenceLevel: number = Persistence.Game;

  machine: MachineState;
  position: Vector;

  constructor(machine: MachineState, position: Vector) {
    super();
    this.machine = machine;
    this.position = position;
  }

  toJSON(): z.input<typeof schema> {
    return {
      machine: this.machine as unknown as z.input<typeof machineStateSchema>,
      position: [...this.position] as [number, number],
    };
  }
}

registerSerializable({
  type: "machineCrate",
  schema,
  fromJSON: (data) =>
    new MachineCrateEntity(
      data.machine as unknown as MachineState,
      data.position,
    ),
});
