import { z } from "zod";
import { Persistence } from "../../config/constants";
import { BaseEntity } from "../../core/entity/BaseEntity";
import { Entity } from "../../core/entity/Entity";
import {
  CONSUMABLE_TYPES,
  ConsumableId,
  ConsumableStock,
  NO_CONSUMABLES,
} from "../../game/Consumable";
import {
  registerSerializable,
  SerializableEntity,
} from "../save/serialization";

/**
 * Shop-wide supplies (nails, finishes) that operations draw from, plus
 * the clamp count. Clamps come back — a glue-up ties some up until it's
 * cured — while consumables only go down (or return through salvage).
 * The registry of what exists is shared with the old world
 * (`src/game/Consumable.ts`).
 */

const consumableIdSchema = z
  .string()
  .refine((id): id is ConsumableId => id in CONSUMABLE_TYPES, {
    message: "unknown consumable id",
  });

const schema = z.object({
  stock: z.record(consumableIdSchema, z.number()),
  clamps: z.number().int(),
});

type ConsumablesData = z.infer<typeof schema>;

export class Consumables
  extends BaseEntity
  implements Entity, SerializableEntity
{
  readonly saveType = "consumables";
  id = "consumables";
  persistenceLevel: number = Persistence.Game;

  stock: ConsumableStock;
  clamps: number;

  constructor(data: Partial<ConsumablesData> = {}) {
    super();
    this.stock = { ...NO_CONSUMABLES, ...data.stock };
    this.clamps = data.clamps ?? 0;
  }

  toJSON(): ConsumablesData {
    return { stock: { ...this.stock }, clamps: this.clamps };
  }
}

registerSerializable({
  type: "consumables",
  singleton: true,
  schema,
  fromJSON: (data) => new Consumables(data),
});
