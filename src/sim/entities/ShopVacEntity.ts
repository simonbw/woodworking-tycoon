import { Persistence } from "../../config/constants";
import { BaseEntity } from "../../core/entity/BaseEntity";
import { Entity } from "../../core/entity/Entity";
import { SpeciesAmounts } from "../../game/Dust";
import { shopVacSchema } from "../../game/gameStateSchema";
import { ShopVacState } from "../../game/ShopVac";
import { Vector } from "../../game/Vectors";
import {
  registerSerializable,
  SerializableEntity,
} from "../save/serialization";

/**
 * The shop vac — the old `GameState.shopVac` slice as a singleton
 * entity. The old world spelled "not owned yet" as `shopVac: null`;
 * here the entity is simply absent until `buyShopVac` adds one, the
 * entity world's natural spelling of the same thing — readers go
 * through `tryGetSingleton`, and the projection maps absence back to
 * `null` for the shared helpers.
 *
 * Dragging is holding the hose: `position === null`, the same derived
 * "in hand" convention as the broom (see `src/game/ShopVac.ts` for the
 * fiction and constants). Suction and the passive trickle run in the
 * CleaningSystem; grabbing/parking comes through `cleaning-commands.ts`.
 */
export class ShopVacEntity
  extends BaseEntity
  implements Entity, SerializableEntity
{
  readonly saveType = "shopVac";
  id = "shopVac";
  persistenceLevel: number = Persistence.Game;

  /** Where it's parked; null while the player is dragging it. */
  position: Vector | null;
  /** Dust in the canister, by species. */
  canister: SpeciesAmounts;

  constructor(data: ShopVacState) {
    super();
    this.position = data.position ? [...data.position] : null;
    this.canister = data.canister;
  }

  /** The old data shape, for the shared pure helpers. */
  view(): ShopVacState {
    return { position: this.position, canister: this.canister };
  }

  /** The old `carryingShopVac`: the hose is in the player's hands. */
  get inHand(): boolean {
    return this.position === null;
  }

  toJSON(): ShopVacState {
    return {
      position: this.position ? ([...this.position] as [number, number]) : null,
      canister: this.canister,
    };
  }
}

registerSerializable({
  type: "shopVac",
  singleton: true,
  // A shop without a vac is a shop; a save without one is complete.
  optional: true,
  schema: shopVacSchema,
  fromJSON: (data) => new ShopVacEntity(data as ShopVacState),
});
