import { Texture, TilingSprite } from "pixi.js";
import { BaseEntity } from "../core/entity/BaseEntity";
import { Entity } from "../core/entity/Entity";
import { GameSprite } from "../core/entity/GameSprite";

/**
 * Phase-0 placeholder scenery: a grass field with a driveway strip, so the
 * engine shell has something to look at while panning. Replaced by the real
 * environment views in phase 3.
 */
export class EmptyLot extends BaseEntity implements Entity {
  constructor() {
    super();

    const grass = makeGroundSprite("/images/grass.png", {
      x: -40,
      y: -30,
      width: 80,
      height: 60,
    });
    const driveway = makeGroundSprite("/images/asphalt.png", {
      x: -2,
      y: 0,
      width: 4,
      height: 30,
    });
    this.sprites = [grass, driveway];
  }
}

function makeGroundSprite(
  textureName: string,
  {
    x,
    y,
    width,
    height,
  }: { x: number; y: number; width: number; height: number },
): GameSprite {
  const texture = Texture.from(textureName);
  const sprite = new TilingSprite({
    texture,
    width,
    height,
  }) as TilingSprite & GameSprite;
  // One texture tile per world unit, whatever the source resolution.
  sprite.tileScale.set(1 / texture.source.width, 1 / texture.source.height);
  sprite.position.set(x, y);
  return sprite;
}
