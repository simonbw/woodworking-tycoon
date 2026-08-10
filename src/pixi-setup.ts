// This file sets up and extends PIXI components for use with @pixi/react v8
import { extend } from "@pixi/react";
import {
  Container,
  Graphics,
  RenderLayer,
  Sprite,
  Text,
  TilingSprite,
} from "pixi.js";

// Register PIXI components to be used in React
// Note: Stage is built-in to @pixi/react and doesn't need to be extended
// Note: a pixiRenderLayer must stay childless in JSX — RenderLayer takes
// objects via attach(), and its addChild throws
extend({
  Container,
  Graphics,
  RenderLayer,
  Sprite,
  Text,
  TilingSprite,
});
