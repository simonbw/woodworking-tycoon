import { addConsumables, ConsumableAmount } from "../../game/Consumable";
import { Game } from "../../core/Game";
import { freshMachineState } from "../../game/game-actions/machine-actions";
import { TutorialTrackId } from "../../game/GameState";
import { isOutdoors } from "../../game/lot";
import { MachineId } from "../../game/Machine";
import { ALL_ARTICLE_IDS } from "../../game/manual";
import { makeMaterial, makePallet } from "../../game/material-helpers";
import {
  Board,
  BoardDimension,
  MaterialInstance,
  Species,
} from "../../game/Materials";
import { cellCenter } from "../../game/player-motion";
import { SKILL_IDS } from "../../game/Skill";
import { Vector } from "../../game/Vectors";
import { MaterialPileEntity } from "../entities/MaterialPileEntity";
import { Player } from "../entities/Player";
import { projectProgression } from "../projection";
import { Consumables } from "../singletons/Consumables";
import { DustLayer } from "../singletons/DustLayer";
import { Progression } from "../singletons/Progression";
import { Reputation } from "../singletons/Reputation";
import { ShopInfo } from "../singletons/ShopInfo";
import { TutorialTracker } from "../singletons/TutorialTracker";
import { Wallet } from "../singletons/Wallet";
import { deliverMachineCrate } from "../systems/grants";
import { TimeFlow } from "../TimeFlow";
import { dismissTutorial } from "./progression-commands";

/**
 * The dev menu's command surface (`src/shell/hud/dev/DevMenu.tsx`) —
 * cheats for playtesting, never reachable from the shipped game. They
 * follow the same rules as every other command (mutate, then announce
 * the domain event) so the live indexes and the DOM signal stay honest,
 * but they skip the validation a player-facing command would do: a
 * cheat's whole point is to not earn the thing.
 */

/** Money out of thin air. */
export function devGrantMoney(game: Game, amount: number): void {
  game.entities.getSingleton(Wallet).money += amount;
  game.dispatch("progressionChanged", {});
}

/** Reputation without the sales. */
export function devGrantReputation(game: Game, amount: number): void {
  game.entities.getSingleton(Reputation).reputation += amount;
  game.dispatch("progressionChanged", {});
}

/** Top up the supply shelf: consumable stock and clamps. */
export function devGrantSupplies(
  game: Game,
  amounts: ReadonlyArray<ConsumableAmount>,
  clamps: number,
): void {
  const consumables = game.entities.getSingleton(Consumables);
  consumables.stock = addConsumables(consumables.stock, amounts);
  consumables.clamps += clamps;
  game.dispatch("suppliesChanged", {});
}

/** A clean floor without the sweeping. */
export function devClearDust(game: Game): void {
  game.entities.getSingleton(DustLayer).map = {};
  game.dispatch("cleaningChanged", {});
}

/**
 * Open every gated channel and article at once: the store, the
 * lumberyard, sweeping, and the whole manual. Skills stay earned —
 * they have their own cheat.
 */
export function devUnlockChannels(game: Game): void {
  const progression = game.entities.getSingleton(Progression);
  progression.storeUnlocked = true;
  progression.lumberyardUnlocked = true;
  progression.sweepingUnlocked = true;
  progression.unlockedArticles = [...ALL_ARTICLE_IDS];
  game.dispatch("progressionChanged", {});
}

/** The whole skill tree, prerequisites and points be damned. */
export function devUnlockAllSkills(game: Game): void {
  const progression = game.entities.getSingleton(Progression);
  progression.unlockedSkills = [...SKILL_IDS];
  game.dispatch("progressionChanged", {});
}

/** Retire every tutorial card still up. */
export function devDismissTutorials(game: Game): void {
  const tracker = game.entities.getSingleton(TutorialTracker);
  for (const trackId of Object.keys(tracker.tutorials)) {
    dismissTutorial(game, trackId as TutorialTrackId);
  }
}

/** The stock a spawned board arrives as. */
export type DevBoardPreset = "rough" | "milled";

/**
 * Drop a board at the player's feet — rough off the rack, or milled
 * square and sanded, ready for joinery. Lands at the material dropoff
 * instead when the player is out on the lot, where piles can't live.
 */
export function devSpawnBoard(
  game: Game,
  species: Species,
  preset: DevBoardPreset,
): void {
  const board =
    preset === "rough"
      ? makeMaterial<Board>({
          type: "board",
          species,
          length: 96,
          width: 6,
          thickness: 4,
          surface: "rough",
          jointedFaces: 0,
          jointedEdges: 0,
        })
      : makeMaterial<Board>({
          type: "board",
          species,
          length: 48,
          width: 6 as BoardDimension,
          thickness: 4,
          surface: "sanded",
          jointedFaces: 2,
          jointedEdges: 2,
        });
  devLandPile(game, board);
}

/** Drop a fresh pallet at the player's feet. */
export function devSpawnPallet(game: Game): void {
  devLandPile(game, makePallet());
}

function devLandPile(game: Game, material: MaterialInstance): void {
  const player = game.entities.getSingleton(Player);
  const shopInfo = game.entities.getSingleton(ShopInfo).info;
  const cell: Vector = isOutdoors(shopInfo, player.cell)
    ? shopInfo.materialDropoffPosition
    : player.cell;
  game.addEntity(new MaterialPileEntity(material, cellCenter(cell), 0));
  game.dispatch("pilesChanged", {});
}

/** A crated machine on the floor, no purchase and no truck ride. */
export function devDeliverMachine(game: Game, machineId: MachineId): void {
  deliverMachineCrate(
    game,
    freshMachineState(machineId, projectProgression(game)),
  );
}

/** Burn an hour of the day's budget, served through the ordinary ticks. */
export function devSkipHour(game: Game): void {
  game.entities.getSingleton(TimeFlow).forceMinutes(60);
}

/**
 * Straight to bed from anywhere: the away flag goes up as if the truck
 * had been driven home, and the ordinary sleep overlay takes it from
 * there. Refused with a machine over the shoulders — waking up still
 * carrying one breaks the morning's set-down invariants.
 */
export function devSleepNow(game: Game): boolean {
  const player = game.entities.getSingleton(Player);
  if (player.away != null || player.carriedMachine != null) {
    console.warn("Can't head to bed right now");
    return false;
  }
  player.away = { kind: "home" };
  game.dispatch("playerChanged", {});
  return true;
}
