/**
 * Tiny pub/sub connecting the particle emitters to the baked dust floor.
 * When a CutParticles chip comes to rest it publishes a stamp here, and
 * DustLayer bakes it into the floor texture — the chip you watched fly is
 * the smudge it leaves. A bus (not props) because the emitters live deep
 * inside rotated machine-sprite containers and the floor layer doesn't.
 */

export interface DustStamp {
  /** Stage (shop-pixel) coordinates — emitters convert via toGlobal. */
  readonly x: number;
  readonly y: number;
  readonly color: number;
  readonly size: number;
  readonly kind: "dust" | "shavings";
  /** Resting angle, for shaving curls. */
  readonly angle: number;
}

type StampListener = (stamp: DustStamp) => void;

const listeners = new Set<StampListener>();

export function onDustStamp(listener: StampListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitDustStamp(stamp: DustStamp): void {
  for (const listener of listeners) {
    listener(stamp);
  }
}
