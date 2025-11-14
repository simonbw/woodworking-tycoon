// This file sets up and extends PIXI components for use with @pixi/react v8
import { extend } from "@pixi/react";
import { Container, Graphics, Sprite, TilingSprite } from "pixi.js";

// Register PIXI components to be used in React
// Note: Stage is built-in to @pixi/react and doesn't need to be extended
extend({
  Container,
  Graphics,
  Sprite,
  TilingSprite,
});
