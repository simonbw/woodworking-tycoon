import { useMemo } from "react";
import { Assets, Texture } from "pixi.js";

/**
 * Hook to get a loaded texture by path
 */
export function useTexture(path: string): Texture {
  return useMemo(() => Assets.get(path), [path]);
}
