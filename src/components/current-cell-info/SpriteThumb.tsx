import { Application, Container } from "pixi.js";
import React, { useEffect, useRef } from "react";
import { MaterialInstance } from "../../game/Materials";
import { createMaterialSprite } from "../../views/material-sprites/MaterialSprite";
import { PIXELS_PER_CELL } from "../shop-view/shop-scale";

/**
 * A material drawn small, in its own little canvas — the icon for the
 * pieces that have no flat picture (an assembled product, a cutting
 * board, a stack of offcuts): the same sprite the shop floor draws,
 * scaled down to a chip.
 *
 * The canvas is built by hand rather than through a renderer component,
 * so a thumbnail is a plain DOM element like every other icon beside it.
 * One canvas per icon is only worth it because the alternatives — a
 * picture per material, or a shared atlas — can't follow a piece whose
 * look comes from its own dimensions and grain.
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
  const holder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = holder.current;
    if (!node) return;
    const app = new Application();
    let disposed = false;
    void app
      .init({
        width: size,
        height: size,
        backgroundAlpha: 0,
        antialias: true,
      })
      .then(() => {
        // Unmounted while the renderer was starting up: nothing to
        // attach it to, so it goes straight back down.
        if (disposed) {
          teardown(app);
          return;
        }
        const stage = new Container();
        stage.position.set(size / 2, size / 2);
        stage.scale.set(size / fit);
        stage.addChild(createMaterialSprite(material));
        app.stage.addChild(stage);
        node.appendChild(app.canvas);
      });
    return () => {
      disposed = true;
      app.canvas?.remove();
      teardown(app);
    };
  }, [material, size, fit]);

  return (
    <div
      ref={holder}
      className="rounded bg-zinc-700 p-0.5"
      style={{ width: size, height: size }}
    />
  );
};

/**
 * Take the thumbnail's canvas down: its own display objects go, and
 * nothing else. Textures are shared with the shop's renderer — the
 * pallet's art, the pooled text — so a thumbnail that took them with it
 * would pull them out from under the floor.
 */
function teardown(app: Application): void {
  app.destroy({ removeView: true }, { children: true });
}
