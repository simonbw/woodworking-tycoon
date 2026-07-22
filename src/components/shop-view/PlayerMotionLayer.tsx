import { useTick } from "@pixi/react";
import { Ticker } from "pixi.js";
import React, { useEffect, useRef } from "react";
import { CellMap } from "../../game/CellMap";
import { cellObstruction } from "../../game/machine-collision";
import { setPlayerPositionAction } from "../../game/game-actions/player-actions";
import {
  directionFromInput,
  motionCell,
  playerWalkSpeed,
  stepPlayerMotion,
} from "../../game/player-motion";
import { Direction, Vector, vectorEquals } from "../../game/Vectors";
import { useApplyGameAction, useGameState } from "../useGameState";
import { readHeldMovement } from "./heldMovementInput";
import { playerMotion, snapPlayerMotionToCell } from "./playerMotionStore";

/**
 * Integrates the player's continuous body every render frame: reads the
 * held movement keys, walks the body with collision against machines and
 * walls, and stamps the cell underfoot back into GameState whenever it
 * changes. Renders nothing — it's the bridge between the 60fps world of
 * the body and the tick-rate world of the simulation.
 *
 * GameState remains the authority on *which cell* the player occupies;
 * this layer is the authority on *where in it* they are. When the
 * simulation moves the player without us (a fixture load, a loaded save),
 * the body snaps to the new cell's center.
 */
export const PlayerMotionLayer: React.FC<{ paused: boolean }> = ({
  paused,
}) => {
  const gameState = useGameState();
  const applyAction = useApplyGameAction();

  const stateRef = useRef(gameState);
  stateRef.current = gameState;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  // The last cell/facing this layer wrote into GameState. Any state cell
  // that doesn't match came from outside — that's the teleport signal.
  const lastSynced = useRef<{ cell: Vector; direction: Direction }>({
    cell: gameState.player.position,
    direction: gameState.player.direction,
  });

  useEffect(() => {
    snapPlayerMotionToCell(stateRef.current.player.position);
    // The body should come up already facing the way the simulation says.
    playerMotion.heading = headingForDirection(
      stateRef.current.player.direction,
    );
  }, []);

  const statePosition = gameState.player.position;
  useEffect(() => {
    if (!vectorEquals(statePosition, lastSynced.current.cell)) {
      snapPlayerMotionToCell(statePosition);
      lastSynced.current = {
        cell: statePosition,
        direction: stateRef.current.player.direction,
      };
    }
  }, [statePosition]);

  useTick((ticker: Ticker) => {
    const gs = stateRef.current;
    if (gs.player.away || pausedRef.current || (gs.player.busyTicks ?? 0) > 0) {
      playerMotion.moving = false;
      return;
    }

    const input = readHeldMovement();
    if (input[0] === 0 && input[1] === 0) {
      playerMotion.moving = false;
      return;
    }

    // You face the way you're pushing, even pinned against a machine.
    playerMotion.heading = Math.atan2(input[1], input[0]);

    // Clamp dt so a hitch (tab switch, GC pause) can't fling the body.
    const dt = Math.min(ticker.deltaMS / 1000, 0.1);
    const cellMap = CellMap.fromGameState(gs);
    const obstructionAt = (cell: Vector) =>
      cellObstruction(cellMap.at(cell), cell);

    const next = stepPlayerMotion(
      playerMotion.pos,
      input,
      playerWalkSpeed(gs),
      dt,
      obstructionAt,
    );
    playerMotion.moving =
      next[0] !== playerMotion.pos[0] || next[1] !== playerMotion.pos[1];
    playerMotion.pos = next;

    const cell = motionCell(next);
    const direction = directionFromInput(input, lastSynced.current.direction);
    if (
      !vectorEquals(cell, lastSynced.current.cell) ||
      direction !== lastSynced.current.direction
    ) {
      lastSynced.current = { cell, direction };
      applyAction(setPlayerPositionAction(cell, direction));
    }
  });

  return null;
};

/** The continuous heading matching a 4-way simulation direction. */
function headingForDirection(direction: Direction): number {
  switch (direction) {
    case 0:
      return 0;
    case 1:
      return -Math.PI / 2;
    case 2:
      return Math.PI;
    case 3:
      return Math.PI / 2;
  }
}
