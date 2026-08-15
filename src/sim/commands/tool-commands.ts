import { Game } from "../../core/Game";
import { withValidSelectedOperation } from "../../game/game-actions/tool-actions";
import { makeToolItem } from "../../game/material-helpers";
import { ToolItem } from "../../game/Materials";
import { handSpaceLeft } from "../../game/Person";
import { TOOL_TYPES, ToolId } from "../../game/Tool";
import { MachineEntity } from "../entities/MachineEntity";
import { Player } from "../entities/Player";
import { projectGameState } from "../projection";

/**
 * Mounting and unmounting handheld tools, ported from the old
 * `tool-actions.ts` (`mountToolAction` / `unmountToolAction`). A loose
 * tool is a physical thing — a MaterialInstance of kind "tool" carried in
 * the arms, dropped into floor piles, hauled in the truck's bed — so the
 * mount/unmount trade happens between the hands and the station's rack.
 * Each command validates against a projection snapshot with the same
 * guards the old actions had, then writes onto the entities. Refusals log
 * and return false, matching the old quiet-refusal contract. Neither old
 * action queued a sound, so neither command emits one.
 */

function player(game: Game): Player {
  return game.entities.getSingleton(Player);
}

/**
 * Mounts a tool the player is carrying into a station's free tool slot,
 * making the tool's operations available there. The tool has to be in
 * hand — there is no shop-wide storage to pull from. Refused while the
 * station is working, like unmounting.
 */
export function mountTool(
  game: Game,
  entity: MachineEntity,
  tool: ToolItem,
): boolean {
  const gameState = projectGameState(game);
  const machine = entity.view();
  if (!gameState.player.inventory.some((item) => item === tool)) {
    console.warn(`Tried to mount ${tool.toolId} without carrying it`);
    return false;
  }
  if (entity.state.tools.length >= machine.toolSlots) {
    console.warn(`No free tool slots on ${machine.type.name}`);
    return false;
  }
  const compatible = TOOL_TYPES[tool.toolId].compatibleMachines;
  if (compatible && !compatible.includes(entity.state.machineTypeId)) {
    console.warn(`${tool.toolId} doesn't mount on a ${machine.type.name}`);
    return false;
  }
  // Nor bolt one on mid-cut: a new tool re-picks the selected operation,
  // which would cancel the running one out from under the stock
  if (entity.state.operationProgress.status === "inProgress") {
    console.warn("Can't mount tools while the station is working");
    return false;
  }

  const thePlayer = player(game);
  thePlayer.inventory = thePlayer.inventory.filter((item) => item !== tool);
  entity.state = withValidSelectedOperation({
    ...entity.state,
    tools: [...entity.state.tools, tool.toolId],
  });
  return true;
}

/** Takes a tool off a station's rack into the player's hands. */
export function unmountTool(
  game: Game,
  entity: MachineEntity,
  toolId: ToolId,
): boolean {
  const gameState = projectGameState(game);
  const toolIndex = entity.state.tools.indexOf(toolId);
  if (toolIndex === -1) {
    console.warn(`Tried to unmount ${toolId} but it's not mounted`);
    return false;
  }
  // Don't yank a tool out from under a running operation
  if (entity.state.operationProgress.status === "inProgress") {
    console.warn("Can't unmount tools while the station is working");
    return false;
  }
  // The tool comes off into the arms, so they need room for it
  if (handSpaceLeft(gameState.player) < 1) {
    console.warn("Can't unmount a tool with full hands");
    return false;
  }

  const thePlayer = player(game);
  thePlayer.inventory = [...thePlayer.inventory, makeToolItem(toolId)];
  entity.state = withValidSelectedOperation({
    ...entity.state,
    tools: [
      ...entity.state.tools.slice(0, toolIndex),
      ...entity.state.tools.slice(toolIndex + 1),
    ],
  });
  return true;
}
