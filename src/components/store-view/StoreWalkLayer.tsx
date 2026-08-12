import { useTick } from "@pixi/react";
import { Ticker } from "pixi.js";
import React, { MutableRefObject, useCallback, useMemo, useRef } from "react";
import { setShoppingPositionAction } from "../../game/game-actions/door-actions";
import {
  BASE_WALK_SPEED,
  CollisionWorld,
  SolidCircle,
} from "../../game/player-motion";
import { StoreLayout, storeCollisionWorld } from "../../game/store-layout";
import { Direction, Vector } from "../../game/Vectors";
import { playerMotion } from "../world-view/playerMotionStore";
import { useWalkingBody } from "../world-view/useWalkingBody";
import { useApplyGameAction, useGameState } from "../useGameState";
import { SHOPPER_RADIUS } from "./storeShoppers";

/**
 * The store's frame for the shared walk (see useWalkingBody): its
 * solids come from the planogram, its speed is the clean-floor stride —
 * no sawdust in a store — and the cell it reports lands on the trip
 * (`away.position`) rather than on `player.position`, which keeps
 * meaning "the cell underfoot back home".
 *
 * Only mounted while a walkable store trip is on screen, so its mount
 * snap puts the body at wherever the trip stands — the spawn beside the
 * cab on arrival, or mid-aisle on a reload.
 */
export const StoreWalkLayer: React.FC<{
  layout: StoreLayout;
  paused: boolean;
  /** The ambient shoppers' positions, read fresh each frame — they're
   * solid, walking people, not scenery the body clips through. */
  shoppersRef: MutableRefObject<ReadonlyArray<Vector>>;
}> = ({ layout, paused, shoppersRef }) => {
  const gameState = useGameState();
  const applyAction = useApplyGameAction();

  const away = gameState.player.away;
  const trip = away?.kind === "shopping" ? away : null;

  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const onCellChange = useCallback(
    (cell: Vector, direction: Direction) => {
      applyAction(setShoppingPositionAction(cell, direction));
    },
    [applyAction],
  );

  const { walk } = useWalkingBody({
    cell: trip?.position ?? layout.spawn.cell,
    direction: trip?.direction ?? layout.spawn.direction,
    onCellChange,
  });

  const baseWorld = useMemo(() => storeCollisionWorld(layout), [layout]);

  useTick((ticker: Ticker) => {
    if (pausedRef.current) {
      playerMotion.moving = false;
      return;
    }
    const shopperSolids: SolidCircle[] = shoppersRef.current.map((center) => ({
      kind: "circle",
      center,
      radius: SHOPPER_RADIUS,
    }));
    const world: CollisionWorld = {
      size: baseWorld.size,
      solids: [...baseWorld.solids, ...shopperSolids],
    };
    walk(ticker.deltaMS, BASE_WALK_SPEED, world);
  });

  return null;
};
