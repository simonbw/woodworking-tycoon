import { Game } from "../core/Game";
import { GameState, MaterialPile } from "../game/GameState";
import { MachineState } from "../game/Machine";
import { CustomerEntity } from "./entities/CustomerEntity";
import { MachineCrateEntity } from "./entities/MachineCrateEntity";
import { MachineEntity } from "./entities/MachineEntity";
import { MaterialPileEntity } from "./entities/MaterialPileEntity";
import { Player } from "./entities/Player";
import { StandEntity } from "./entities/StandEntity";
import { TruckEntity } from "./entities/TruckEntity";
import { ShopVacEntity } from "./entities/ShopVacEntity";
import { Broom } from "./singletons/Broom";
import { Clock } from "./singletons/Clock";
import { Consumables } from "./singletons/Consumables";
import { DustLayer } from "./singletons/DustLayer";
import { Progression } from "./singletons/Progression";
import { Reputation } from "./singletons/Reputation";
import { ShopInfo } from "./singletons/ShopInfo";
import { StorageUpgrades } from "./singletons/StorageUpgrades";
import { TutorialTracker } from "./singletons/TutorialTracker";
import { Wallet } from "./singletons/Wallet";

/**
 * A read-only `GameState` assembled from the entity world.
 *
 * The migration's contract is that registries and pure helpers are
 * shared between both worlds, never forked — and nearly every old helper
 * (attendance, dust multipliers, cell maps, clamp counts) reads a
 * `GameState`. This projection is the bridge: commands and systems build
 * one, hand it to the shared helpers, and write their results back onto
 * the entities. It is a snapshot for reading, never a place to write —
 * there is deliberately no way to load one back in.
 *
 * Slices whose systems haven't been ported yet project as their empty
 * initial values; each system's port claims its slice. The machine
 * array's order is entity insertion order, which the save file preserves,
 * so projections are deterministic across save/load.
 */
export function projectGameState(game: Game): GameState {
  const player = game.entities.getSingleton(Player);
  const clock = game.entities.getSingleton(Clock);
  const wallet = game.entities.getSingleton(Wallet);
  const reputation = game.entities.getSingleton(Reputation);
  const consumables = game.entities.getSingleton(Consumables);
  const storage = game.entities.getSingleton(StorageUpgrades);
  const shopInfo = game.entities.getSingleton(ShopInfo);
  const progression = game.entities.getSingleton(Progression);
  const tutorials = game.entities.getSingleton(TutorialTracker);
  const dust = game.entities.tryGetSingleton(DustLayer);
  const stand = game.entities.tryGetSingleton(StandEntity);

  const truck = game.entities.getSingleton(TruckEntity);

  const customers = [...game.entities.byConstructor(CustomerEntity)].map(
    (customer) => customer.toCustomer(),
  );
  const broom = game.entities.tryGetSingleton(Broom);
  const shopVac = game.entities.tryGetSingleton(ShopVacEntity);

  const machines: MachineState[] = [
    ...game.entities.byConstructor(MachineEntity),
  ].map((entity) => entity.state);
  const machineCrates = [
    ...game.entities.byConstructor(MachineCrateEntity),
  ].map((crate) => ({ machine: crate.machine, position: crate.position }));
  const materialPiles: MaterialPile[] = [
    ...game.entities.byConstructor(MaterialPileEntity),
  ].map((entity) => entity.pile);

  return {
    tick: clock.tick,
    day: clock.day,
    dayStartTick: clock.dayStartTick,
    money: wallet.money,
    reputation: reputation.reputation,
    materialPiles,
    consumables: consumables.stock,
    clamps: consumables.clamps,
    machines,
    machineCrates,
    truck: { bed: truck.bed, crates: truck.crates },
    shopInfo: shopInfo.info,
    player: {
      name: player.name,
      position: player.cell,
      direction: player.direction,
      inventory: player.inventory,
      carriedMachine: player.carriedMachine,
      busyTicks: player.busyTicks,
      away: player.away,
      operating: player.operating,
      waiting: player.waiting,
      sweepAim: player.sweepAim,
    },
    storage: { upgrades: storage.upgrades },
    progression: {
      tutorials: tutorials.tutorials,
      storeUnlocked: progression.storeUnlocked,
      lumberyardUnlocked: progression.lumberyardUnlocked,
      salesCompleted: progression.salesCompleted,
      sweepingUnlocked: progression.sweepingUnlocked,
      unlockedArticles: progression.unlockedArticles,
      readArticles: progression.readArticles,
      xp: progression.xp,
      skillPoints: progression.skillPoints,
      unlockedSkills: progression.unlockedSkills,
    },
    stand: stand?.pieces ?? [],
    customers,
    dust: dust?.map ?? {},
    shopVac: shopVac?.view() ?? null,
    broomOwned: broom?.owned ?? false,
    broomPosition: broom?.position ?? null,
    dustpan: broom?.dustpan ?? {},
  };
}
