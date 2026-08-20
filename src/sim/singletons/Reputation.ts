import { z } from "zod";
import { Persistence } from "../../config/constants";
import { BaseEntity } from "../../core/entity/BaseEntity";
import { Entity } from "../../core/entity/Entity";
import {
  registerSerializable,
  SerializableEntity,
} from "../save/serialization";

/**
 * The shop's reputation, earned one sale at a time off the for-sale
 * stand. Gates the lumberyard's channels.
 */

const schema = z.object({
  reputation: z.number(),
});

type ReputationData = z.infer<typeof schema>;

export class Reputation
  extends BaseEntity
  implements Entity, SerializableEntity
{
  readonly saveType = "reputation";
  id = "reputation";
  persistenceLevel: number = Persistence.Game;

  reputation: number;

  constructor(data: Partial<ReputationData> = {}) {
    super();
    this.reputation = data.reputation ?? 0;
  }

  toJSON(): ReputationData {
    return { reputation: this.reputation };
  }
}

registerSerializable({
  type: "reputation",
  singleton: true,
  schema,
  fromJSON: (data) => new Reputation(data),
});
