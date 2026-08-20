import { z } from "zod";
import { Persistence } from "../../config/constants";
import { BaseEntity } from "../../core/entity/BaseEntity";
import { Entity } from "../../core/entity/Entity";
import { materialSchema, vectorSchema } from "../../game/gameStateSchema";
import { MaterialPile } from "../../game/GameState";
import { MaterialInstance } from "../../game/Materials";
import { Vector } from "../../game/Vectors";
import {
  registerSerializable,
  SerializableEntity,
} from "../save/serialization";

/**
 * A piece of stock resting on the shop floor — one entity per old-world
 * `GameState.materialPiles` entry.
 *
 * The pile sits at a continuous position (the material's center point, in
 * cell units) at the rotation it was dropped in, exactly the old shape:
 * reach is geometry against the material's resting footprint (see
 * `pile-helpers.ts`), never cell membership. Piles are not solids — the
 * body walks over loose stock — so this carries no solids tag.
 */

const schema = z.object({
  material: materialSchema,
  position: vectorSchema,
  rotation: z.number(),
});

export class MaterialPileEntity
  extends BaseEntity
  implements Entity, SerializableEntity
{
  readonly saveType = "materialPile";
  persistenceLevel: number = Persistence.Game;

  material: MaterialInstance;
  /** The material's center point, continuous, in cell units. */
  position: Vector;
  /** How the piece lies, in radians, world frame (see MaterialPile). */
  rotation: number;

  constructor(material: MaterialInstance, position: Vector, rotation: number) {
    super();
    this.material = material;
    this.position = [...position];
    this.rotation = rotation;
  }

  /** The shared data shape the pure helpers read (pileWithinReach, …). */
  get pile(): MaterialPile {
    return {
      material: this.material,
      position: this.position,
      rotation: this.rotation,
    };
  }

  toJSON(): z.input<typeof schema> {
    return {
      material: { ...this.material },
      position: [...this.position] as [number, number],
      rotation: this.rotation,
    };
  }
}

registerSerializable({
  type: "materialPile",
  schema,
  fromJSON: (data) =>
    new MaterialPileEntity(
      data.material as unknown as MaterialInstance,
      data.position,
      data.rotation,
    ),
});
