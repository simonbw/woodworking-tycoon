/**
 * The bench stage's pointer plumbing: the DOM wrapper owns the real
 * pointer events (the same choice ShopView makes for the broom), maps
 * them into workpiece inches, and hands them to whichever surface script
 * is mounted inside the PIXI stage. A tiny mutable bus rather than React
 * state — pointer moves arrive at display rate and must not render.
 */

export interface BenchPointerEvent {
  readonly type: "down" | "move" | "up" | "leave";
  /** Pointer position in workpiece inches (may be out of bounds). */
  readonly xIn: number;
  readonly yIn: number;
  /** Whether the primary button is held (moves only). */
  readonly held: boolean;
}

export type BenchPointerHandler = (event: BenchPointerEvent) => void;

export interface BenchPointerBus {
  register(handler: BenchPointerHandler): () => void;
  dispatch(event: BenchPointerEvent): void;
}

export function makeBenchPointerBus(): BenchPointerBus {
  // A set, not a single slot: in-place tool work listens alongside the
  // scene's own hover/drag handler — the scene stands down from grabbing
  // while a tool is held, the work overlay ignores everything until then.
  const handlers = new Set<BenchPointerHandler>();
  return {
    register(handler) {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    dispatch(event) {
      for (const handler of [...handlers]) {
        handler(event);
      }
    },
  };
}
