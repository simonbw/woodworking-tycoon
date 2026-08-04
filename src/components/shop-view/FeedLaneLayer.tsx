import { Graphics } from "pixi.js";
import React, { useCallback } from "react";
import {
  feedClearanceShortfall,
  feedLaneCells,
} from "../../game/feed-clearance";
import { findFeedableOperation } from "../../game/machine-helpers";
import { availableOperations } from "../../game/skill-helpers";
import { Vector } from "../../game/Vectors";
import { useTargetedMachine } from "../TargetedMachineContext";
import { useCellMap } from "../useCellMap";
import { useGameState } from "../useGameState";
import { PIXELS_PER_CELL } from "./shop-scale";

/**
 * Shows the feed lane long stock would need when the targeted machine is
 * refusing a cut for room: the run each side of the machine painted on
 * the floor, with the cells in the way (a machine, the wall) in red. Only
 * drawn while there's a shortfall — a cut with room just runs, and the
 * floor stays quiet.
 */
export const FeedLaneLayer: React.FC = () => {
  const gameState = useGameState();
  const cellMap = useCellMap();
  const { machine } = useTargetedMachine();

  // Advise on what's already on the machine if anything, else what's in
  // hand — the same stock the refusal chip is explaining (MachineChips).
  const stock =
    machine !== undefined && machine.inputMaterials.length > 0
      ? machine.inputMaterials
      : (gameState.player.inventory ?? []);

  const shortfall =
    machine !== undefined &&
    machine.type.feedsThrough &&
    !gameState.player.away &&
    stock.length > 0
      ? (() => {
          const match = findFeedableOperation(
            machine,
            availableOperations(machine, gameState.progression),
            stock,
          );
          return match
            ? feedClearanceShortfall(machine, match.materials, cellMap)
            : null;
        })()
      : null;

  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      if (!machine || !shortfall) {
        return;
      }
      const lane = feedLaneCells(machine, cellMap, shortfall.lengthIn);
      const paint = (cells: Vector[], color: number) => {
        for (const [x, y] of cells) {
          g.rect(
            x * PIXELS_PER_CELL,
            y * PIXELS_PER_CELL,
            PIXELS_PER_CELL,
            PIXELS_PER_CELL,
          );
          g.fill({ color, alpha: 0.28 });
        }
      };
      paint(lane.clear, 0x22c55e);
      paint(lane.blocked, 0xef4444);
    },
    [machine, shortfall, cellMap],
  );

  return <pixiGraphics draw={draw} eventMode="none" />;
};
