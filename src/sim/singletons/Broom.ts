import { z } from "zod";
import { Persistence } from "../../config/constants";
import { BaseEntity } from "../../core/entity/BaseEntity";
import { Entity } from "../../core/entity/Entity";
import { SpeciesAmounts } from "../../game/Dust";
import { speciesAmountsSchema, vectorSchema } from "../../game/gameStateSchema";
import { Vector } from "../../game/Vectors";
import {
  registerSerializable,
  SerializableEntity,
} from "../save/serialization";

/**
 * The shop broom and its dustpan — the old `GameState.broomOwned` /
 * `broomPosition` / `dustpan` slice as one singleton. Always present,
 * like the DustLayer: a shop that hasn't bought the broom yet holds an
 * unowned one (`owned: false`), matching the old state's always-present
 * fields. "In hand" stays derived, never stored: the broom is held when
 * it's owned and leaning nowhere (`position === null`) — the convention
 * `src/game/HeldTool.ts` documents, so there's no second flag to drift
 * out of sync. The sweeping itself runs in the CleaningSystem; the
 * pickup/lean/buy mutations come through `cleaning-commands.ts`.
 */

const schema = z.object({
  owned: z.boolean(),
  position: vectorSchema.nullable(),
  dustpan: speciesAmountsSchema,
});

export interface BroomData {
  owned: boolean;
  /** Where it leans on the shop floor; null = in the player's hands. */
  position: Vector | null;
  /** Sawdust in the dustpan, by species. */
  dustpan: SpeciesAmounts;
}

export class Broom extends BaseEntity implements Entity, SerializableEntity {
  readonly saveType = "broom";
  id = "broom";
  persistenceLevel: number = Persistence.Game;

  owned: boolean;
  /** Where it leans on the shop floor; null = in the player's hands. */
  position: Vector | null;
  /** Sawdust in the dustpan, by species. */
  dustpan: SpeciesAmounts;

  constructor(data: Partial<BroomData> = {}) {
    super();
    this.owned = data.owned ?? false;
    this.position = data.position ? [...data.position] : null;
    this.dustpan = data.dustpan ?? {};
  }

  /** The old `holdingBroom`: owned and leaning nowhere. */
  get inHand(): boolean {
    return this.owned && this.position === null;
  }

  toJSON(): BroomData {
    return {
      owned: this.owned,
      position: this.position ? ([...this.position] as [number, number]) : null,
      dustpan: this.dustpan,
    };
  }
}

registerSerializable({
  type: "broom",
  singleton: true,
  schema,
  fromJSON: (data) => new Broom(data as BroomData),
});
