import { Game } from "../../core/Game";
import { benchGroupAt } from "../../game/bench-work/bench-group";
import { withValidSelectedOperation } from "../../game/game-actions/tool-actions";
import { getMachines, machineKey } from "../../game/Machine";
import { makeToolItem } from "../../game/material-helpers";
import { ToolItem } from "../../game/Materials";
import { handSpaceLeft } from "../../game/Person";
import { TOOL_TYPES, ToolId } from "../../game/Tool";
import { MachineEntity } from "../entities/MachineEntity";
import { Player } from "../entities/Player";
import { findMachineEntity } from "./machine-commands";
import { projectGameState } from "../projection";

/**
 * Mounting and unmounting handheld tools. A loose tool is a physical
 * thing — a MaterialInstance of kind "tool" carried in the arms, dropped
 * into floor piles, hauled in the truck's bed — so the mount/unmount
 * trade happens between the hands and the station's rack. Each command
 * validates against a projection snapshot, then writes onto the entities,
 * keeping the rail's selected operation valid through
 * `withValidSelectedOperation`. A refusal logs and returns false, and
 * neither command emits a sound.
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
  game.dispatch("machineStateChanged", { machine: entity });
  game.dispatch("playerChanged", {});
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
  game.dispatch("machineStateChanged", { machine: entity });
  game.dispatch("playerChanged", {});
  return true;
}

/**
 * Slides a tool mounted on a neighbouring table in the same bench run
 * onto this one — the tool-rack half of what `gatherBenchPieces` does
 * for stock. Tables pushed together are one bench
 * (bench-work/bench-group.ts) and the rail shows the whole run's tools,
 * but an operation still resolves tools off a single machine's rack, so
 * reaching for a neighbour's tool moves it here first and everything
 * downstream runs as if it had always hung here.
 */
export function gatherBenchTool(
  game: Game,
  target: MachineEntity,
  toolId: ToolId,
): boolean {
  const machine = target.view();
  if (target.state.tools.length >= machine.toolSlots) {
    console.warn(`No free tool slots on ${machine.type.name}`);
    return false;
  }
  const compatible = TOOL_TYPES[toolId].compatibleMachines;
  if (compatible && !compatible.includes(target.state.machineTypeId)) {
    console.warn(`${toolId} doesn't mount on a ${machine.type.name}`);
    return false;
  }
  if (target.state.operationProgress.status === "inProgress") {
    console.warn("Can't mount tools while the station is working");
    return false;
  }

  // Only within the run this table belongs to — a tool two benches over
  // across the shop stays where it hangs.
  const gameState = projectGameState(game);
  const group = benchGroupAt(getMachines(gameState.machines), machine);
  const from = group.members
    .map((member) => member.machine)
    .filter(
      (candidate) => machineKey(candidate.state) !== machineKey(machine.state),
    )
    .find(
      (candidate) =>
        candidate.state.tools.includes(toolId) &&
        candidate.state.operationProgress.status !== "inProgress",
    );
  const fromEntity = from ? findMachineEntity(game, from.state) : null;
  if (!fromEntity) {
    console.warn(`No idle table in the run has a ${toolId} to gather`);
    return false;
  }

  const toolIndex = fromEntity.state.tools.indexOf(toolId);
  fromEntity.state = withValidSelectedOperation({
    ...fromEntity.state,
    tools: [
      ...fromEntity.state.tools.slice(0, toolIndex),
      ...fromEntity.state.tools.slice(toolIndex + 1),
    ],
  });
  target.state = withValidSelectedOperation({
    ...target.state,
    tools: [...target.state.tools, toolId],
  });
  game.dispatch("machineStateChanged", { machine: fromEntity });
  game.dispatch("machineStateChanged", { machine: target });
  return true;
}
