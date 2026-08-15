import { z } from "zod";
import { Persistence } from "../../config/constants";
import { BaseEntity } from "../../core/entity/BaseEntity";
import { Entity } from "../../core/entity/Entity";
import { materialSchema } from "../../game/gameStateSchema";
import { MaterialInstance } from "../../game/Materials";
import {
  registerSerializable,
  SerializableEntity,
} from "../save/serialization";

/**
 * The for-sale stand, as a sim entity — the old world's `GameState.stand`
 * slice. The table itself is lot geometry (its solid comes from
 * `standSolid` in the shared collision assembly, see `src/sim/collision.ts`);
 * this entity owns only its inventory: the pieces set out, oldest first.
 *
 * The stand-commands set pieces out and take them back; the StreetSystem
 * sells them off. The model — geometry, reach, what it accepts, what a
 * sale pays — stays in the shared `src/game/stand.ts`.
 */

const schema = z.object({
  pieces: z.array(materialSchema),
});

export class StandEntity
  extends BaseEntity
  implements Entity, SerializableEntity
{
  readonly saveType = "stand";
  id = "stand";
  persistenceLevel: number = Persistence.Game;

  /** The pieces set out on the table, oldest first. */
  pieces: MaterialInstance[];

  constructor(pieces: ReadonlyArray<MaterialInstance> = []) {
    super();
    this.pieces = [...pieces];
  }

  toJSON(): { pieces: MaterialInstance[] } {
    return { pieces: this.pieces.map((piece) => ({ ...piece })) };
  }
}

registerSerializable({
  type: "stand",
  singleton: true,
  schema,
  fromJSON: (data) =>
    new StandEntity(data.pieces as unknown as MaterialInstance[]),
});
