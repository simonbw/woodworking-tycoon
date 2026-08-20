import { Persistence } from "../../config/constants";
import { Game } from "../../core/Game";
import { GameState } from "../../game/GameState";
import { cellCenter } from "../../game/player-motion";
import { CustomerEntity } from "../entities/CustomerEntity";
import { MachineCrateEntity } from "../entities/MachineCrateEntity";
import { MachineEntity } from "../entities/MachineEntity";
import { MaterialPileEntity } from "../entities/MaterialPileEntity";
import { Player } from "../entities/Player";
import { StandEntity } from "../entities/StandEntity";
import { TruckEntity } from "../entities/TruckEntity";
import { ShopVacEntity } from "../entities/ShopVacEntity";
import { Broom } from "../singletons/Broom";
import { Clock } from "../singletons/Clock";
import { Consumables } from "../singletons/Consumables";
import { DustLayer } from "../singletons/DustLayer";
import { Progression } from "../singletons/Progression";
import { Reputation } from "../singletons/Reputation";
import { ShopInfo } from "../singletons/ShopInfo";
import { StorageUpgrades } from "../singletons/StorageUpgrades";
import { TutorialTracker } from "../singletons/TutorialTracker";
import { Wallet } from "../singletons/Wallet";

/**
 * Build the entity world from an old-world `GameState` — the bridge that
 * lets the sequence tier keep its fixtures (tests/fixtures/*.ts are
 * GameStates) while the world it drives is entities. The inverse of
 * `projection.ts`, and the same clear-and-instantiate path a save load
 * takes.
 *
 * Slices whose systems haven't been ported yet are checked: a fixture
 * that carries state the entity world can't hold yet fails loudly here
 * rather than silently dropping it, so a green test can't be green by
 * omission.
 */
export function loadGameState(game: Game, state: GameState): void {
  game.clearScene(Persistence.Game);

  game.addEntity(
    new Player({
      name: state.player.name,
      position: cellCenter(state.player.position),
      direction: state.player.direction,
      inventory: state.player.inventory,
      carriedMachine: state.player.carriedMachine ?? null,
      busyTicks: state.player.busyTicks,
      away: state.player.away,
    }),
  );
  game.addEntity(
    new Clock({
      tick: state.tick,
      day: state.day,
      dayStartTick: state.dayStartTick,
    }),
  );
  game.addEntity(new Wallet({ money: state.money }));
  game.addEntity(new Reputation({ reputation: state.reputation }));
  game.addEntity(
    new Consumables({ stock: state.consumables, clamps: state.clamps }),
  );
  game.addEntity(
    new StorageUpgrades({ upgrades: [...state.storage.upgrades] }),
  );
  game.addEntity(
    new ShopInfo({
      name: state.shopInfo.name,
      electricity: state.shopInfo.electricity,
      size: [...state.shopInfo.size] as [number, number],
      materialDropoffPosition: [...state.shopInfo.materialDropoffPosition] as [
        number,
        number,
      ],
      entrancePosition: [...state.shopInfo.entrancePosition] as [
        number,
        number,
      ],
    }),
  );
  game.addEntity(
    new Progression({
      storeUnlocked: state.progression.storeUnlocked,
      lumberyardUnlocked: state.progression.lumberyardUnlocked,
      salesCompleted: state.progression.salesCompleted,
      sweepingUnlocked: state.progression.sweepingUnlocked,
      unlockedArticles: [...state.progression.unlockedArticles],
      readArticles: [...state.progression.readArticles],
      xp: state.progression.xp,
      skillPoints: state.progression.skillPoints,
      unlockedSkills: [...state.progression.unlockedSkills],
    }),
  );
  game.addEntity(
    new TutorialTracker({ tutorials: state.progression.tutorials }),
  );
  game.addEntity(new DustLayer({ dust: state.dust }));
  game.addEntity(
    new TruckEntity({ bed: state.truck.bed, crates: state.truck.crates }),
  );
  game.addEntity(new StandEntity(state.stand));
  game.addEntity(
    new Broom({
      owned: state.broomOwned,
      position: state.broomPosition,
      dustpan: state.dustpan,
    }),
  );
  if (state.shopVac !== null) {
    game.addEntity(new ShopVacEntity(state.shopVac));
  }

  for (const pile of state.materialPiles) {
    game.addEntity(
      new MaterialPileEntity(pile.material, pile.position, pile.rotation),
    );
  }
  for (const machine of state.machines) {
    game.addEntity(new MachineEntity(machine));
  }
  for (const crate of state.machineCrates) {
    game.addEntity(new MachineCrateEntity(crate.machine, crate.position));
  }
  for (const customer of state.customers) {
    game.addEntity(new CustomerEntity(customer));
  }

  // Slices the entity world can't hold yet. Each system's port claims
  // its slice and deletes its check here.
  const unsupported: string[] = [];
  if (unsupported.length > 0) {
    throw new Error(
      `Fixture uses slices the entity world hasn't ported yet: ${unsupported.join(", ")}`,
    );
  }
}
