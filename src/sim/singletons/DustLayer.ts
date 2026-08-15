import { z } from "zod";
import { Persistence } from "../../config/constants";
import { BaseEntity } from "../../core/entity/BaseEntity";
import { Entity } from "../../core/entity/Entity";
import { speciesAmountsSchema } from "../../game/gameStateSchema";
import { DustMap } from "../../game/Dust";
import {
  registerSerializable,
  SerializableEntity,
} from "../save/serialization";

/**
 * Sawdust on the shop floor: per-cell (keyed "x,y"), per-species
 * amounts, dropped when clean — the old `GameState.dust` slice as a
 * singleton. Machines lay dust down while they cut (MachineSystem);
 * sweeping and the vac take it away (the cleaning system). All the dust
 * math stays in the shared `src/game/Dust.ts`.
 */

const schema = z.object({
  dust: z.record(speciesAmountsSchema),
});

type DustData = z.infer<typeof schema>;

export class DustLayer
  extends BaseEntity
  implements Entity, SerializableEntity
{
  readonly saveType = "dust";
  id = "dust";
  persistenceLevel: number = Persistence.Game;

  map: DustMap;

  constructor(data: Partial<DustData> = {}) {
    super();
    this.map = data.dust ?? {};
  }

  toJSON(): DustData {
    return { dust: this.map };
  }
}

registerSerializable({
  type: "dust",
  singleton: true,
  schema,
  fromJSON: (data) => new DustLayer(data),
});
