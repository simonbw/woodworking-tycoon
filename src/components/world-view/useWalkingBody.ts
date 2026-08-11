import { useCallback, useEffect, useRef } from "react";
import {
  CollisionWorld,
  directionFromInput,
  headingForDirection,
  motionCell,
  stepPlayerMotion,
} from "../../game/player-motion";
import { Direction, Vector, vectorEquals } from "../../game/Vectors";
import { readHeldMovement } from "./heldMovementInput";
import { playerMotion, snapPlayerMotionToCell } from "./playerMotionStore";

/**
 * Walking, wherever the walking happens. The body is continuous and
 * lives at render rate; the simulation only ever hears about the cell
 * underfoot. This hook owns the bridge between the two — reading the
 * held keys, integrating against whatever solids the venue has, and
 * reporting a cell change when there is one.
 *
 * It does not own the frame. Each venue runs its own `useTick` and calls
 * `walk` when walking is what should happen, because the things that
 * *stop* a walk differ from place to place: the shop floor pins the feet
 * while the player leans over a bench, and a store's aisles will have
 * their own. Handing the tick to the hook would mean teaching it every
 * venue's exceptions.
 *
 * There is one body (see playerMotionStore) and the venues are never on
 * screen together, so this drives that singleton rather than taking one.
 */
export interface WalkingBodyOptions {
  /**
   * The cell the simulation holds the walker in. Anything here that this
   * hook didn't write came from outside — a loaded save, a fixture, a
   * teleport — and the body snaps to it.
   */
  cell: Vector;
  /** The facing the simulation holds, used the same way. */
  direction: Direction;
  /** Called when the cell underfoot or the facing changes, never otherwise. */
  onCellChange: (cell: Vector, direction: Direction) => void;
}

export interface WalkingBody {
  /**
   * One frame of walking: read the keys and carry the body. No-op with
   * nothing held, apart from dropping the `moving` flag.
   */
  walk: (deltaMS: number, speed: number, world: CollisionWorld) => void;
  /**
   * Report a cell and facing the venue arrived at some other way — the
   * shop's bench stance walks the body itself. Calls `onCellChange` only
   * on a real change, and keeps this hook's idea of what it last wrote
   * honest so the next teleport is still spotted.
   */
  syncCell: (cell: Vector, direction: Direction) => void;
}

/** Clamp on a frame's dt: a hitch (tab switch, GC pause) can't fling the body. */
const MAX_FRAME_SECONDS = 0.1;

export function useWalkingBody({
  cell,
  direction,
  onCellChange,
}: WalkingBodyOptions): WalkingBody {
  // The last cell/facing this hook wrote out. Any authoritative cell that
  // doesn't match came from outside — that's the teleport signal.
  const lastSynced = useRef<{ cell: Vector; direction: Direction }>({
    cell,
    direction,
  });

  const onCellChangeRef = useRef(onCellChange);
  onCellChangeRef.current = onCellChange;

  const initialRef = useRef({ cell, direction });
  useEffect(() => {
    snapPlayerMotionToCell(initialRef.current.cell);
    // The body should come up already facing the way the simulation says.
    playerMotion.heading = headingForDirection(initialRef.current.direction);
  }, []);

  useEffect(() => {
    if (!vectorEquals(cell, lastSynced.current.cell)) {
      snapPlayerMotionToCell(cell);
      lastSynced.current = { cell, direction };
    }
    // `direction` is deliberately not a dependency: a facing change on its
    // own is never a teleport, and re-running on one would re-snap the body
    // to its cell's center mid-stride.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cell]);

  const syncCell = useCallback((next: Vector, nextDirection: Direction) => {
    if (
      vectorEquals(next, lastSynced.current.cell) &&
      nextDirection === lastSynced.current.direction
    ) {
      return;
    }
    lastSynced.current = { cell: next, direction: nextDirection };
    onCellChangeRef.current(next, nextDirection);
  }, []);

  const walk = useCallback(
    (deltaMS: number, speed: number, world: CollisionWorld) => {
      const input = readHeldMovement();
      if (input[0] === 0 && input[1] === 0) {
        playerMotion.moving = false;
        return;
      }

      // You face the way you're pushing, even pinned against a machine.
      playerMotion.heading = Math.atan2(input[1], input[0]);

      const dt = Math.min(deltaMS / 1000, MAX_FRAME_SECONDS);
      const next = stepPlayerMotion(playerMotion.pos, input, speed, dt, world);
      playerMotion.moving =
        next[0] !== playerMotion.pos[0] || next[1] !== playerMotion.pos[1];
      playerMotion.pos = next;

      syncCell(
        motionCell(next),
        directionFromInput(input, lastSynced.current.direction),
      );
    },
    [syncCell],
  );

  return { walk, syncCell };
}
