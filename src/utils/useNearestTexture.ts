import { Texture } from "pixi.js";
import { useEffect, useState } from "react";

/**
 * A texture loaded with nearest-neighbor sampling, independent of the
 * Assets cache — for drawing pixel art well above its native resolution
 * (the bench view's close-up of the machine sprites) without linear
 * filtering smearing it into a blur. The shop view keeps using the
 * shared, linearly-sampled copy at its own scale.
 */
const cache = new Map<string, Texture>();

export function useNearestTexture(url: string): Texture | null {
  const [texture, setTexture] = useState<Texture | null>(
    () => cache.get(url) ?? null,
  );
  useEffect(() => {
    const cached = cache.get(url);
    if (cached) {
      setTexture(cached);
      return;
    }
    let cancelled = false;
    const image = new Image();
    image.src = url;
    image
      .decode()
      .then(() => {
        if (cancelled) return;
        const loaded = Texture.from(image);
        loaded.source.scaleMode = "nearest";
        cache.set(url, loaded);
        setTexture(loaded);
      })
      .catch(() => {
        // A missing image just draws nothing; the scene survives.
      });
    return () => {
      cancelled = true;
    };
  }, [url]);
  return texture;
}
