import { Application, Container, Rectangle } from "pixi.js";
import React, { useEffect, useRef } from "react";
import { MaterialInstance } from "../../game/Materials";
import { createMaterialSprite } from "../../views/material-sprites/MaterialSprite";
import { PIXELS_PER_CELL } from "../../views/shop-scale";

/**
 * A material drawn small — the icon for the pieces that have no flat
 * picture (an assembled product, a cutting board, a stack of offcuts):
 * the same sprite the shop floor draws, scaled down to a chip. Drawing
 * them rather than shipping a picture per material is what lets an icon
 * follow a piece whose look comes from its own dimensions and grain.
 *
 * Every thumbnail on screen is drawn by ONE renderer, kept here and
 * copied into each icon's own plain canvas. A renderer per icon would be
 * a WebGL context per icon, and a browser hands out about sixteen before
 * it starts dropping the oldest — a shelf of stock would take the shop's
 * own canvas down with it.
 */
export const SpriteThumb: React.FC<{
  material: MaterialInstance;
  /** Canvas edge, in CSS pixels. */
  size: number;
  /**
   * How much of the world the thumbnail has to show, in world pixels.
   * One cell covers every sprite drawn at pile scale; a blueprint-built
   * product spans its whole footprint and needs a wider fit.
   */
  fit?: number;
}> = ({ material, size, fit = PIXELS_PER_CELL }) => {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let live = true;
    void drawThumb(material, size, fit).then((source) => {
      const node = canvas.current;
      if (!live || !node || !source) return;
      node.width = source.width;
      node.height = source.height;
      node.getContext("2d")?.drawImage(source, 0, 0);
    });
    return () => {
      live = false;
    };
  }, [material, size, fit]);

  return (
    <canvas
      ref={canvas}
      className="rounded bg-zinc-700 p-0.5"
      style={{ width: size, height: size }}
    />
  );
};

/** The shared renderer, built on the first thumbnail and kept after. */
let thumbApp: Promise<Application> | null = null;

function thumbRenderer(): Promise<Application> {
  if (!thumbApp) {
    const app = new Application();
    thumbApp = app
      .init({ width: 1, height: 1, backgroundAlpha: 0, antialias: true })
      .then(() => app);
  }
  return thumbApp;
}

/** One thumbnail, rendered and handed back as a picture to copy. */
async function drawThumb(
  material: MaterialInstance,
  size: number,
  fit: number,
): Promise<HTMLCanvasElement | null> {
  const app = await thumbRenderer();
  const stage = new Container();
  stage.position.set(size / 2, size / 2);
  stage.scale.set(size / fit);
  stage.addChild(createMaterialSprite(material));
  try {
    return (await app.renderer.extract.canvas({
      target: stage,
      frame: new Rectangle(0, 0, size, size),
      antialias: true,
    })) as HTMLCanvasElement;
  } finally {
    // The sprite has been drawn; the display objects go, and the shared
    // textures they drew from stay.
    stage.destroy({ children: true });
  }
}
