import { Game } from "../core/Game";
import { SaveFile, loadSaveFile } from "./save/SaveFile";
import { Clock } from "./singletons/Clock";
import { Consumables } from "./singletons/Consumables";
import { Progression } from "./singletons/Progression";
import { Reputation } from "./singletons/Reputation";
import { ShopInfo } from "./singletons/ShopInfo";
import { StorageUpgrades } from "./singletons/StorageUpgrades";
import { TutorialTracker } from "./singletons/TutorialTracker";
import { Wallet } from "./singletons/Wallet";
import { TimeFlow } from "./TimeFlow";

/**
 * World setup shared by every way a game starts: the browser shell, the
 * headless driver, and tests.
 *
 * The session singletons (TimeFlow — transient, above save persistence)
 * are added once per Game. The persistent singletons come either fresh
 * (a new shop) or from a save file; loading clears the persistent scene
 * first, so booting from a save on a fresh Game and loading one into a
 * running Game are the same path.
 */

/** Add the session-lifetime singletons every game needs exactly once. */
export function addSessionSingletons(game: Game): void {
  game.addEntity(new TimeFlow());
}

/** Add a fresh shop's persistent singletons (a brand-new game). */
export function addFreshShopSingletons(game: Game): void {
  game.addEntity(new Clock());
  game.addEntity(new Wallet());
  game.addEntity(new Reputation());
  game.addEntity(new Consumables());
  game.addEntity(new StorageUpgrades());
  game.addEntity(new ShopInfo());
  game.addEntity(new Progression());
  game.addEntity(new TutorialTracker());
}

/** Boot a world: session singletons plus a fresh shop or a save file. */
export function bootShop(game: Game, save?: SaveFile): void {
  addSessionSingletons(game);
  if (save) {
    loadSaveFile(game, save);
  } else {
    addFreshShopSingletons(game);
  }
}
