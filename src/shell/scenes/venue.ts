import { Game } from "../../core/Game";
import {
  DRIVE_TICKS_ONE_WAY,
  goToStore,
  returnFromStore,
} from "../../sim/commands/trip-commands";
import { Player } from "../../sim/entities/Player";
import { TimeFlow } from "../../sim/TimeFlow";
import { StoreId } from "../../game/lumberStock";
import { DaylightView } from "../../views/DaylightView";
import { DustMotionView } from "../../views/DustMotionView";
import { EnvironmentView } from "../../views/EnvironmentView";
import { FeedLaneView } from "../../views/FeedLaneView";
import { FloorView } from "../../views/FloorView";
import { PowerCordView } from "../../views/PowerCordView";

/**
 * Which place the world canvas draws (migration phase 6's scene swap).
 * The sim never swaps — machines cure and customers stroll wherever the
 * player is — only the view side does: the shop's scenery and the sim
 * entities' paired views for the shop, the StoreSceneRoot's own tree
 * for the walkable Orange Box. The lumberyard stays a menu overlay, so
 * its trips keep the shop venue underneath.
 */
export type Venue = "shop" | "orangeBox";

export function currentVenue(game: Game): Venue {
  const away = game.entities.tryGetSingleton(Player)?.away;
  return away?.kind === "shopping" && away.store === "orangeBox"
    ? "orangeBox"
    : "shop";
}

/**
 * The shop's scenery views — Level-persistence, spawned by the
 * SceneDirector whenever the shop venue needs drawing (boot, a save
 * load's clearScene, the drive home).
 */
export function spawnShopScenery(game: Game): void {
  game.addEntity(new EnvironmentView());
  game.addEntity(new FloorView());
  game.addEntity(new PowerCordView());
  game.addEntity(new FeedLaneView());
  game.addEntity(new DustMotionView());
  game.addEntity(new DaylightView());
}

/**
 * Tear the drawn world down to bare sim: every registry-spawned view
 * child, and every top-level Level-persistence entity (the scenery, a
 * scene root). `clearScene` alone can't do this — it deliberately skips
 * children, and the views hang off Game-persistence sim entities.
 */
export function teardownWorldViews(game: Game): void {
  for (const entity of [...game.entities.all]) {
    if (entity.isRegistryView) {
      entity.destroy();
    } else if (!entity.parent && entity.persistenceLevel <= 0) {
      entity.destroy();
    }
  }
}

/** Re-pair every sim entity with its registered view (the drive home). */
export function respawnSimViews(game: Game): void {
  for (const entity of [...game.entities.all]) {
    if (entity.parent || entity.isRegistryView) continue;
    game.spawnRegisteredView(entity);
  }
}

/**
 * Drive out to a store: the trip command plus the drive's minutes,
 * charged through TimeFlow so the leg runs on the next engine tick with
 * the trip already underway — the old goToStoreAction's ordering.
 */
export function driveToStore(game: Game, store: StoreId): boolean {
  if (!goToStore(game, store)) return false;
  game.entities.getSingleton(TimeFlow).forceMinutes(DRIVE_TICKS_ONE_WAY);
  return true;
}

/**
 * Charge the drive home. The SceneDirector owns the deferred half —
 * `returnFromStore` runs only after these minutes are served, so the
 * trip is still underway while they pass (the old
 * returnFromStoreAction's ordering); see its `requestDriveHome`.
 */
export function chargeDriveHome(game: Game): boolean {
  const player = game.entities.tryGetSingleton(Player);
  if (player?.away?.kind !== "shopping") return false;
  game.entities.getSingleton(TimeFlow).forceMinutes(DRIVE_TICKS_ONE_WAY);
  return true;
}

/** The drive-home charge is spent; finish the trip. */
export function completeDriveHome(game: Game): boolean {
  return returnFromStore(game);
}

/** Whether a charged leg is still unserved (the director's wait). */
export function driveMinutesPending(game: Game): boolean {
  const timeFlow = game.entities.tryGetSingleton(TimeFlow);
  return timeFlow !== undefined && timeFlow.pendingForcedMinutes > 0;
}
