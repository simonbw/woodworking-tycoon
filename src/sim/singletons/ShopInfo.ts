import { z } from "zod";
import { Persistence } from "../../config/constants";
import { BaseEntity } from "../../core/entity/BaseEntity";
import { Entity } from "../../core/entity/Entity";
import {
  defaultEntrancePosition,
  ShopInfo as ShopInfoData,
} from "../../game/ShopInfo";
import { Vector } from "../../game/Vectors";
import {
  registerSerializable,
  SerializableEntity,
} from "../save/serialization";

/**
 * The building itself: the shop's name, its footprint in cells, its
 * electrical service, and the fixed positions the layout hangs off. The
 * data shape is shared with the old world (`src/game/ShopInfo.ts`).
 */

const vectorSchema = z.tuple([z.number(), z.number()]);

const schema = z.object({
  name: z.string(),
  electricity: z.union([z.literal(120), z.literal(240)]),
  size: vectorSchema,
  materialDropoffPosition: vectorSchema,
  entrancePosition: vectorSchema,
});

type ShopInfoSaveData = z.infer<typeof schema>;

const DEFAULT_SIZE: Vector = [12, 16];

export class ShopInfo extends BaseEntity implements Entity, SerializableEntity {
  readonly saveType = "shopInfo";
  id = "shopInfo";
  persistenceLevel: number = Persistence.Game;

  info: ShopInfoData;

  constructor(data?: ShopInfoSaveData) {
    super();
    this.info = data ?? {
      name: "One Car Garage",
      electricity: 120,
      size: DEFAULT_SIZE,
      materialDropoffPosition: [10, 13],
      entrancePosition: defaultEntrancePosition(DEFAULT_SIZE),
    };
  }

  toJSON(): ShopInfoSaveData {
    return {
      name: this.info.name,
      electricity: this.info.electricity,
      size: [...this.info.size] as [number, number],
      materialDropoffPosition: [...this.info.materialDropoffPosition] as [
        number,
        number,
      ],
      entrancePosition: [...this.info.entrancePosition] as [number, number],
    };
  }
}

registerSerializable({
  type: "shopInfo",
  singleton: true,
  schema,
  fromJSON: (data) => new ShopInfo(data),
});
