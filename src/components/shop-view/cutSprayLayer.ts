import { RenderLayer } from "pixi.js";
import { createContext, useContext } from "react";

/**
 * Where the machines' cut spray actually renders. The particle emitters
 * live inside each machine's sprite (aimed at its blade and chip port),
 * but that subtree wears the targeting OutlineFilter whenever the player
 * stands at the machine — which is exactly when it sprays — so the
 * filter rimmed every airborne fleck in white. Children attached to a
 * RenderLayer skip their ancestors' filter pass while keeping their
 * logical parent's transform, so CutParticles attaches its graphics
 * here: the chips still fly with the machine's position and rotation,
 * just outside its outline. ShopView mounts the layer over the machines,
 * so a spray also clears a neighbouring machine instead of vanishing
 * under it.
 */
export const cutSprayLayerContext = createContext<RenderLayer | null>(null);

export function useCutSprayLayer(): RenderLayer | null {
  return useContext(cutSprayLayerContext);
}
