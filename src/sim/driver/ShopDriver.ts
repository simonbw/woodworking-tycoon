import { Constructor } from "../../core/EntityList";
import { Entity } from "../../core/entity/Entity";
import { Game } from "../../core/Game";
import { mulberry32 } from "../../core/util/SeededRandom";
import { bootShop } from "../bootstrap";
import { SaveFile, serializeGame } from "../save/SaveFile";
import { Clock } from "../singletons/Clock";
import { Consumables } from "../singletons/Consumables";
import { Progression } from "../singletons/Progression";
import { Reputation } from "../singletons/Reputation";
import { ShopInfo } from "../singletons/ShopInfo";
import { StorageUpgrades } from "../singletons/StorageUpgrades";
import { TutorialTracker } from "../singletons/TutorialTracker";
import { Wallet } from "../singletons/Wallet";
import { TimeFlow } from "../TimeFlow";

/**
 * The sequence tier's harness for the entity world: a headless, seeded
 * Game booted from a fresh shop or a fixture save, advanced
 * synchronously, and inspected through its entities.
 *
 * This is the successor of `src/game/sequences/shop-driver.ts`. As phase
 * 2 of MIGRATION.md ports each system, this driver grows the same
 * job-level verbs the old one has (walkTo, mill, sellAtStand, …), each
 * implemented as calls into the command layer — the same surface the
 * input dispatcher uses, so a green sequence test vouches for what a
 * player can actually reach. Mutating the world any other way from a
 * test defeats that; the import-boundary test holds this file to the
 * command surface (plus read-only singleton access for assertions).
 */
export class ShopDriver {
  readonly game: Game;

  constructor({ seed = 1, save }: { seed?: number; save?: SaveFile } = {}) {
    this.game = new Game({ headless: true, random: mulberry32(seed) });
    bootShop(this.game, save);
  }

  /** Advance the world by whole engine ticks. */
  tick(ticks: number = 1): void {
    this.game.step(ticks);
  }

  /** Snapshot the world as a save file. */
  save(): SaveFile {
    return serializeGame(this.game);
  }

  // ------------------------------------------------------------------
  // Assertion surface: read-only access to the world's singletons.
  // ------------------------------------------------------------------

  singleton<T extends Entity>(constructor: Constructor<T>): T {
    return this.game.entities.getSingleton(constructor);
  }

  get timeFlow(): TimeFlow {
    return this.singleton(TimeFlow);
  }

  get clock(): Clock {
    return this.singleton(Clock);
  }

  get wallet(): Wallet {
    return this.singleton(Wallet);
  }

  get reputation(): Reputation {
    return this.singleton(Reputation);
  }

  get consumables(): Consumables {
    return this.singleton(Consumables);
  }

  get storageUpgrades(): StorageUpgrades {
    return this.singleton(StorageUpgrades);
  }

  get shopInfo(): ShopInfo {
    return this.singleton(ShopInfo);
  }

  get progression(): Progression {
    return this.singleton(Progression);
  }

  get tutorials(): TutorialTracker {
    return this.singleton(TutorialTracker);
  }
}
