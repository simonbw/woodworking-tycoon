import { Container, Graphics, Sprite } from "pixi.js";
import { LayerName } from "../../config/layers";
import { ImageName } from "../../resources/resources";
import { WithOwner } from "./WithOwner";

/**
 * An extension of Pixi's Container class that lets us easily specify which layer a
 * sprite should be rendered in, as well as keep track of the entity that owns this sprite.
 */
export interface GameSprite extends Container, WithOwner {
  layerName?: LayerName;
}

export function loadGameSprite(
  name: ImageName,
  layerName?: LayerName,
  options?: { anchor?: [number, number]; size?: [number, number] },
): Sprite & GameSprite {
  const sprite = Sprite.from(name) as Sprite & GameSprite;
  sprite.layerName = layerName;
  if (options?.anchor) {
    sprite.anchor.set(...options.anchor);
  }
  if (options?.size) {
    sprite.setSize(...options.size);
  }
  return sprite;
}

export function createGraphics(layerName: LayerName): GameSprite & Graphics {
  const graphics = new Graphics() as GameSprite & Graphics;
  graphics.layerName = layerName;
  return graphics;
}
