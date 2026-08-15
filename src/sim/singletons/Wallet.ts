import { z } from "zod";
import { Persistence } from "../../config/constants";
import { BaseEntity } from "../../core/entity/BaseEntity";
import { Entity } from "../../core/entity/Entity";
import {
  registerSerializable,
  SerializableEntity,
} from "../save/serialization";

/** The shop's money, in dollars. Sales pay into it, purchases draw it down. */

const schema = z.object({
  money: z.number(),
});

type WalletData = z.infer<typeof schema>;

export class Wallet extends BaseEntity implements Entity, SerializableEntity {
  readonly saveType = "wallet";
  id = "wallet";
  persistenceLevel: number = Persistence.Game;

  money: number;

  constructor(data: Partial<WalletData> = {}) {
    super();
    this.money = data.money ?? 0;
  }

  toJSON(): WalletData {
    return { money: this.money };
  }
}

registerSerializable({
  type: "wallet",
  singleton: true,
  schema,
  fromJSON: (data) => new Wallet(data),
});
