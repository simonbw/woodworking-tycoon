import { z } from "zod";
import { Persistence } from "../../config/constants";
import { BaseEntity } from "../../core/entity/BaseEntity";
import { Entity } from "../../core/entity/Entity";
import { machineStateSchema, materialSchema } from "../../game/gameStateSchema";
import { MachineState } from "../../game/Machine";
import { MaterialInstance } from "../../game/Materials";
import {
  registerSerializable,
  SerializableEntity,
} from "../save/serialization";

/**
 * The pickup parked in the driveway — the old `GameState.truck` slice as
 * a singleton entity. Its bed carries all physical cargo: loose stock
 * (`bed`) and machines still crated after a store run (`crates`). The
 * bed is unbounded — hauling is what a truck is for; the player's hands
 * (HAND_CAPACITY) are what meter the trips to it. Loaded and unloaded
 * standing at the bed (see `atTruckBed` in `src/game/lot.ts`), through
 * the commands in `commands/truck-commands.ts`.
 *
 * The parked body's collision solid stays with the lot geometry the
 * collision world assembles (see `collision.ts`) — this entity owns the
 * cargo, not the sheet metal.
 */

const schema = z.object({
  bed: z.array(materialSchema),
  crates: z.array(machineStateSchema),
});

export interface TruckData {
  bed: ReadonlyArray<MaterialInstance>;
  crates: ReadonlyArray<MachineState>;
}

export class TruckEntity
  extends BaseEntity
  implements Entity, SerializableEntity
{
  readonly saveType = "truck";
  id = "truck";
  persistenceLevel: number = Persistence.Game;

  /** Loose stock in the bed. */
  bed: MaterialInstance[];
  /** Machines still crated, lying in the bed after a store run. */
  crates: MachineState[];

  constructor(data?: Partial<TruckData>) {
    super();
    this.bed = [...(data?.bed ?? [])];
    this.crates = [...(data?.crates ?? [])];
  }

  toJSON(): z.input<typeof schema> {
    return {
      bed: this.bed.map(
        (material) => ({ ...material }) as z.input<typeof materialSchema>,
      ),
      crates: this.crates.map(
        (crate) => crate as unknown as z.input<typeof machineStateSchema>,
      ),
    };
  }
}

registerSerializable({
  type: "truck",
  singleton: true,
  schema,
  fromJSON: (data) => new TruckEntity(data as unknown as TruckData),
});
