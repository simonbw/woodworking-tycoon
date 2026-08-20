import { Persistence } from "../../config/constants";
import { BaseEntity } from "../../core/entity/BaseEntity";
import { Entity } from "../../core/entity/Entity";
import { customerSchema } from "../../game/gameStateSchema";
import { Customer } from "../../game/stand";
import {
  registerSerializable,
  SerializableEntity,
} from "../save/serialization";

/**
 * A passerby on the sidewalk line, as a sim entity — one entity per
 * customer, the old world's `GameState.customers` entries (see the
 * `Customer` docs in `src/game/stand.ts` for the walking → browsing →
 * leaving life). Spawned, walked, and retired by the StreetSystem;
 * entity insertion order is the old array's order (survivors keep their
 * places, newcomers append), which the save file preserves, so saves
 * round-trip byte-identically.
 *
 * The customer's own id stays plain data (`customerId`) rather than the
 * entity id — it exists for React keys in the view layer, not lookup.
 */
export class CustomerEntity
  extends BaseEntity
  implements Entity, SerializableEntity
{
  readonly saveType = "customer";
  persistenceLevel: number = Persistence.Game;

  customerId: string;
  /** Continuous x in cell coordinates; y is always the sidewalk line. */
  x: number;
  /** Which way they're strolling: +1 rightward, -1 leftward. */
  walkDirection: 1 | -1;
  state: Customer["state"];
  /** Ticks of browsing left before they decide. Only while browsing. */
  browseTicksLeft: number;

  constructor(data: Customer) {
    super();
    this.customerId = data.id;
    this.x = data.x;
    this.walkDirection = data.walkDirection;
    this.state = data.state;
    this.browseTicksLeft = data.browseTicksLeft;
  }

  /** The shared data shape (projection, serialization). */
  toCustomer(): Customer {
    return {
      id: this.customerId,
      x: this.x,
      walkDirection: this.walkDirection,
      state: this.state,
      browseTicksLeft: this.browseTicksLeft,
    };
  }

  toJSON(): Customer {
    return this.toCustomer();
  }
}

registerSerializable({
  type: "customer",
  schema: customerSchema,
  fromJSON: (data) => new CustomerEntity(data),
});
