import { Game } from "../core/Game";
import {
  GameState,
  MaterialPile,
  ProgressionState,
  TutorialFacts,
} from "../game/GameState";
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
 * Since issue #230 the full projection lives at the serialization
 * boundary, where a snapshot is genuinely the product: the save file
 * (sim/save), the fixture loader's inverse, the ShopDriver's assertion
 * surface, the dev/test hooks, and the DOM's `useShopState` (one
 * assembly per render signal). Runtime code asks the entities that hold
 * the state — commands, systems, and views read the slice projections
 * below (`projectPerson`, `projectProgression`, `projectTutorialFacts`,
 * `projectShopInfo`) or the singletons directly, and the pure helpers
 * take what they read. It is a snapshot for reading, never a place to
 * write — there is deliberately no way to load one back in.
 *
 * The machine array's order is entity insertion order, which the save
 * file preserves, so projections are deterministic across save/load.
 */
export function projectGameState(game: Game): GameState {
  const player = game.entities.getSingleton(Player);
  const clock = game.entities.getSingleton(Clock);
  const wallet = game.entities.getSingleton(Wallet);
  const reputation = game.entities.getSingleton(Reputation);
  const consumables = game.entities.getSingleton(Consumables);
  const storage = game.entities.getSingleton(StorageUpgrades);
  const shopInfo = game.entities.getSingleton(ShopInfo);
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
    player: projectPerson(game),
    storage: { upgrades: storage.upgrades },
    progression: projectProgression(game),
    stand: stand?.pieces ?? [],
    customers,
    dust: dust?.map ?? {},
    shopVac: shopVac?.view() ?? null,
    broomOwned: broom?.owned ?? false,
    broomPosition: broom?.position ?? null,
    dustpan: broom?.dustpan ?? {},
  };
}

/**
 * The tutorial/milestone predicates' read (issue #230, phase 4): the
 * "assorted facts" slice, assembled from singleton reads — no customer
 * mapping, no clock, no geometry. See `TutorialFacts` in GameState.ts.
 */
export function projectTutorialFacts(game: Game): TutorialFacts {
  const player = game.entities.getSingleton(Player);
  const truck = game.entities.getSingleton(TruckEntity);
  const consumables = game.entities.getSingleton(Consumables);
  const broom = game.entities.tryGetSingleton(Broom);
  const shopVac = game.entities.tryGetSingleton(ShopVacEntity);
  const dust = game.entities.tryGetSingleton(DustLayer);
  const stand = game.entities.tryGetSingleton(StandEntity);
  return {
    money: game.entities.getSingleton(Wallet).money,
    reputation: game.entities.getSingleton(Reputation).reputation,
    clamps: consumables.clamps,
    consumables: consumables.stock,
    materialPiles: [...game.entities.byConstructor(MaterialPileEntity)].map(
      (entity) => entity.pile,
    ),
    machines: [...game.entities.byConstructor(MachineEntity)].map(
      (entity) => entity.state,
    ),
    machineCrates: [...game.entities.byConstructor(MachineCrateEntity)].map(
      (crate) => ({ machine: crate.machine, position: crate.position }),
    ),
    truck: { bed: truck.bed, crates: truck.crates },
    player: {
      inventory: player.inventory,
      away: player.away,
      carriedMachine: player.carriedMachine,
    },
    progression: projectProgression(game),
    stand: stand?.pieces ?? [],
    dust: dust?.map ?? {},
    shopVac: shopVac?.view() ?? null,
    broomOwned: broom?.owned ?? false,
    dustpan: broom?.dustpan ?? {},
  };
}

/**
 * Just the player slice, for readers that need nothing else. Keeps the
 * projection's one unit conversion in one place: the pure world's
 * `position` is the cell underfoot, not the body's continuous point.
 */
export function projectPerson(game: Game): GameState["player"] {
  const player = game.entities.getSingleton(Player);
  return {
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
  };
}

/** The shop's fixed geometry, for readers that need nothing else. */
export function projectShopInfo(game: Game): GameState["shopInfo"] {
  return game.entities.getSingleton(ShopInfo).info;
}

/**
 * Just the progression slice, for readers that need nothing else — the
 * same shape `projectGameState` embeds, without paying for the arrays.
 */
export function projectProgression(game: Game): ProgressionState {
  const progression = game.entities.getSingleton(Progression);
  const tutorials = game.entities.getSingleton(TutorialTracker);
  return {
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
  };
}
