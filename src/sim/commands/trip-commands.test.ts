import assert from "node:assert";
import { describe, it } from "node:test";
import { endGrainShop } from "../../../tests/fixtures/end-grain-shop";
import { board } from "../../game/board-helpers";
import { CLAMP_COST } from "../../game/Clamp";
import { CONSUMABLE_TYPES } from "../../game/Consumable";
import { truckCabSideCell } from "../../game/lot";
import { MACHINE_TYPES } from "../../game/Machine";
import { ScavengingTrip, ShoppingTrip } from "../../game/Person";
import { ShopDriver } from "../driver/ShopDriver";
import {
  addToCart,
  canCheckOut,
  checkout,
  clearCart,
  removeFromCart,
} from "./cart-commands";
import {
  buyClamp,
  buyConsumablePack,
  buyMachine,
  buyMaterial,
  buyUpgrade,
} from "./store-commands";
import {
  continueScavenging,
  DRIVE_TICKS_ONE_WAY,
  headHomeFromScavenging,
  keepScavengingBlock,
  rollScavengeStops,
  SCAVENGE_STOP_NAMES,
  SCAVENGE_STOP_TICKS,
  setShoppingPosition,
  startScavenging,
} from "./trip-commands";
import { TICKS_PER_DAY } from "../../game/time";
import { needsFirstPallet } from "../../game/tutorial";
import { projectGameState } from "../projection";

/**
 * The trips port's contract: scavenging runs the same stop-by-stop
 * circuit the old actions did (seeded rolls, the searching spender, the
 * reveal at the half hour, the haul into the bed), a store run charges
 * its drive legs and settles every kind of purchase into the right
 * entity, the lumberyard's direct counters ring up the same, and a save
 * taken mid-trip round-trips byte-identically.
 */

/** Every roll low: a (battered) find at every stop, deterministically. */
const alwaysFinds = () => 0;

/** The end-grain fixture with a fatter wallet — the shopping testbed. */
function stockedShop(): ShopDriver {
  const shop = new ShopDriver({ state: endGrainShop });
  shop.wallet.money = 500;
  return shop;
}

const isPallet = (m: { type: string }) => m.type === "pallet";

describe("scavenging trips", () => {
  it("runs the circuit and hauls the finds home", () => {
    const shop = new ShopDriver();
    shop.scavenge({ stops: 2 });
    assert.strictEqual(shop.player.away, null);
    // Each stop costs its half hour (the live pace model may creep a few
    // extra minutes past the forced ones while the search spends time).
    assert.ok(shop.clock.tick >= 2 * SCAVENGE_STOP_TICKS);
    const pallets = shop.stock(isPallet);
    assert.strictEqual(pallets.length, 2, "two stops, two pristine pallets");
    for (const pallet of pallets) {
      assert.ok(
        pallet.type === "pallet" && pallet.deckBoards.every(Boolean),
        "the driver's default rng finds pallets with every deck board",
      );
    }
  });

  it("spends time searching and thinks for free at the decision", () => {
    const shop = new ShopDriver();
    shop.standAtCab();
    startScavenging(shop.game, alwaysFinds);
    assert.strictEqual(
      shop.timeFlow.resolveSpeed(),
      "working",
      "the search's half hour is spent time",
    );
    shop.tick(SCAVENGE_STOP_TICKS + 1);
    const away = shop.player.away as ScavengingTrip;
    assert.strictEqual(away.phase.kind, "deciding");
    assert.strictEqual(
      shop.timeFlow.resolveSpeed(),
      "idle",
      "weighing another stop is thinking, and thinking is nearly free",
    );
  });

  it("reveals a stop only when its half hour is up", () => {
    const shop = new ShopDriver();
    shop.standAtCab();
    startScavenging(shop.game, alwaysFinds);
    // Well short of the half hour (even with the live pace's creep on
    // top of the forced minutes): still digging, nothing revealed.
    shop.tick(SCAVENGE_STOP_TICKS - 10);
    let away = shop.player.away as ScavengingTrip;
    assert.strictEqual(away.phase.kind, "searching");
    assert.strictEqual(away.stopsSearched, 0);
    // Past the half hour: the stop is revealed and the trip parks at a
    // decision until the player calls the next leg.
    shop.tick(12);
    away = shop.player.away as ScavengingTrip;
    assert.strictEqual(away.phase.kind, "deciding");
    assert.strictEqual(away.stopsSearched, 1);
    assert.ok(away.stops[0].pallet, "the first stop's find is revealed");
  });

  it("refuses to push on outside a decision", () => {
    const shop = new ShopDriver();
    shop.standAtCab();
    startScavenging(shop.game, alwaysFinds);
    shop.tick(5);
    assert.ok(!continueScavenging(shop.game));
    const away = shop.player.away as ScavengingTrip;
    assert.strictEqual(away.phase.kind, "searching");
    assert.strictEqual(
      away.phase.kind === "searching" && away.phase.doneTick,
      SCAVENGE_STOP_TICKS,
      "a refused call doesn't restart the search's timer",
    );
  });

  it("won't start a trip away from the cab", () => {
    const shop = new ShopDriver();
    shop.standAt([5, 5]);
    assert.ok(!startScavenging(shop.game, alwaysFinds));
    assert.strictEqual(shop.player.away, null);
  });

  it("lands the haul in the bed and steps out beside the cab", () => {
    const shop = new ShopDriver();
    shop.standAtCab();
    startScavenging(shop.game, alwaysFinds);
    shop.tick(SCAVENGE_STOP_TICKS + 1);
    assert.ok(headHomeFromScavenging(shop.game));
    assert.strictEqual(shop.player.away, null);
    assert.strictEqual(shop.truck.bed.filter(isPallet).length, 1);
    assert.deepStrictEqual(
      shop.player.cell,
      truckCabSideCell(shop.shopInfo.info),
    );
  });
});

/** rng stub cycling through the given values */
function fakeRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe("rolling the circuit", () => {
  it("rolls a result for every stop on the circuit", () => {
    const stops = rollScavengeStops(fakeRng([0.1]));
    assert.strictEqual(stops.length, SCAVENGE_STOP_NAMES.length);
    assert.deepStrictEqual(
      stops.map((stop) => stop.stopName),
      [...SCAVENGE_STOP_NAMES],
    );
  });

  it("produces pallets with 5-8 deck boards and 2-3 stringers", () => {
    for (const roll of [0, 0.25, 0.5, 0.75, 0.999]) {
      const [first] = rollScavengeStops(fakeRng([0.1, roll]));
      assert.ok(first.pallet, "a 0.1 find roll should find a pallet");
      const deckCount = first.pallet.deckBoards.filter(Boolean).length;
      assert.ok(deckCount >= 5 && deckCount <= 8, `deck=${deckCount}`);
      const stringerCount = first.pallet.stringers.filter(Boolean).length;
      assert.ok(stringerCount >= 2 && stringerCount <= 3);
    }
  });

  it("plants one find on an all-empty roll — no trip can strike out completely", () => {
    const stops = rollScavengeStops(fakeRng([0.9]));
    assert.strictEqual(stops.filter((stop) => stop.pallet !== null).length, 1);
  });
});

describe("the first-trip guarantee", () => {
  it("moves the washout plant to the first stop", () => {
    const stops = rollScavengeStops(fakeRng([0.9]), true);
    assert.ok(stops[0].pallet, "stop one should hold the guaranteed find");
  });

  it("leaves a lucky circuit alone", () => {
    const stops = rollScavengeStops(fakeRng([0.1]), true);
    // Every stop found its own pallet; nothing extra was planted
    assert.strictEqual(
      stops.filter((stop) => stop.pallet !== null).length,
      SCAVENGE_STOP_NAMES.length,
    );
  });

  it("a brand-new shop's trip can't miss at stop one", () => {
    const shop = new ShopDriver();
    const stops = rollScavengeStops(
      fakeRng([0.9]),
      needsFirstPallet(projectGameState(shop.game)),
    );
    assert.ok(stops[0].pallet);
  });

  it("a shop that has wood rolls the circuit straight", () => {
    const pallet = rollScavengeStops(fakeRng([0.1]))[0].pallet;
    assert.ok(pallet);
    const shop = new ShopDriver();
    shop.truck.bed = [pallet];
    const stops = rollScavengeStops(
      fakeRng([0.9]),
      needsFirstPallet(projectGameState(shop.game)),
    );
    // The washout plant lands wherever the roll says, not at stop one
    assert.strictEqual(stops[0].pallet, null);
    assert.strictEqual(stops.filter((stop) => stop.pallet !== null).length, 1);
  });
});

describe("keepScavengingBlock", () => {
  /** A trip parked at a decision with one stop searched. */
  function atDecision(): ShopDriver {
    const shop = new ShopDriver();
    shop.standAtCab();
    startScavenging(shop.game, alwaysFinds);
    shop.tick(SCAVENGE_STOP_TICKS + 1);
    const away = shop.player.away;
    assert.ok(away?.kind === "scavenging" && away.phase.kind === "deciding");
    return shop;
  }

  it("allows another stop with daylight and circuit to spare", () => {
    const shop = atDecision();
    assert.strictEqual(keepScavengingBlock(projectGameState(shop.game)), null);
  });

  it("refuses outside a decision", () => {
    const shop = new ShopDriver();
    shop.standAtCab();
    startScavenging(shop.game, alwaysFinds);
    shop.tick(5);
    assert.strictEqual(
      keepScavengingBlock(projectGameState(shop.game)),
      "notDeciding",
    );
  });

  it("refuses once the circuit is used up", () => {
    const shop = atDecision();
    const away = shop.player.away as ScavengingTrip;
    shop.player.away = {
      ...away,
      stopsSearched: SCAVENGE_STOP_NAMES.length,
    };
    assert.strictEqual(
      keepScavengingBlock(projectGameState(shop.game)),
      "outOfStops",
    );
  });

  it("refuses when the search would run past close", () => {
    const shop = atDecision();
    // One minute short of the last slot the next half hour fits in
    shop.clock.tick =
      shop.clock.dayStartTick + TICKS_PER_DAY - SCAVENGE_STOP_TICKS;
    assert.strictEqual(keepScavengingBlock(projectGameState(shop.game)), null);
    shop.clock.tick += 1;
    assert.strictEqual(
      keepScavengingBlock(projectGameState(shop.game)),
      "outOfDaylight",
    );
  });
});

describe("shopping trips", () => {
  it("drives out, rings the cart up, and comes home with the goods", () => {
    const shop = stockedShop();
    const t0 = shop.clock.tick;
    shop.goShopping("orangeBox");
    assert.strictEqual(
      shop.clock.tick,
      t0 + DRIVE_TICKS_ONE_WAY,
      "the drive out charges its minutes",
    );
    let away = shop.player.away;
    assert.ok(away?.kind === "shopping" && away.store === "orangeBox");
    shop.takeCart();

    addToCart(shop.game, {
      kind: "material",
      material: board("pine", 96, 4, 8, "smooth"),
      price: 12,
    });
    addToCart(shop.game, {
      kind: "machine",
      machineTypeId: "sawhorses",
      price: MACHINE_TYPES.sawhorses.cost,
    });
    addToCart(shop.game, {
      kind: "consumablePack",
      consumableId: "nails",
      price: CONSUMABLE_TYPES.nails.packPrice,
    });
    addToCart(shop.game, { kind: "clamp", price: CLAMP_COST });

    const total =
      12 +
      MACHINE_TYPES.sawhorses.cost +
      CONSUMABLE_TYPES.nails.packPrice +
      CLAMP_COST;
    const moneyBefore = shop.wallet.money;
    const nailsBefore = shop.consumables.stock.nails ?? 0;
    const clampsBefore = shop.consumables.clamps;
    assert.ok(canCheckOut(shop.game));
    assert.ok(checkout(shop.game));
    assert.strictEqual(shop.wallet.money, moneyBefore - total);
    away = shop.player.away;
    assert.ok(away?.kind === "shopping" && away.cart.length === 0);

    shop.comeHome();
    assert.strictEqual(shop.player.away, null);
    assert.strictEqual(
      shop.clock.tick,
      t0 + 2 * DRIVE_TICKS_ONE_WAY,
      "the drive home charges its minutes too",
    );
    // The board rode home in the bed and is staged on the floor now;
    // the machine waits crated in the bed; the supplies and the clamp
    // went straight to the shop's stock.
    assert.strictEqual(shop.stock((m) => m.type === "board").length, 1);
    assert.strictEqual(shop.truck.crates.length, 1);
    assert.strictEqual(shop.truck.crates[0].machineTypeId, "sawhorses");
    assert.strictEqual(
      shop.consumables.stock.nails,
      nailsBefore + CONSUMABLE_TYPES.nails.packSize,
    );
    assert.strictEqual(shop.consumables.clamps, clampsBefore + 1);
  });

  it("the register refuses a cart the wallet can't cover", () => {
    const shop = stockedShop();
    shop.wallet.money = 5;
    shop.goShopping("orangeBox").takeCart();
    addToCart(shop.game, { kind: "clamp", price: CLAMP_COST });
    assert.ok(!canCheckOut(shop.game));
    assert.ok(!checkout(shop.game));
    assert.strictEqual(shop.wallet.money, 5);
    const away = shop.player.away as ShoppingTrip;
    assert.strictEqual(away.cart.length, 1, "a refused cart keeps its lines");
  });

  it("keeps the cart's bookkeeping straight", () => {
    const shop = stockedShop();
    assert.ok(
      !addToCart(shop.game, { kind: "clamp", price: CLAMP_COST }),
      "no cart to add to while home",
    );
    shop.goShopping("orangeBox").takeCart();
    const line = {
      kind: "material",
      material: board("pine", 96, 4, 8, "smooth"),
      price: 10,
    } as const;
    addToCart(shop.game, line);
    addToCart(shop.game, line);
    let cart = (shop.player.away as ShoppingTrip).cart;
    assert.strictEqual(cart.length, 2);
    const [first, second] = cart;
    assert.ok(
      first.kind === "material" &&
        second.kind === "material" &&
        first.material.id !== second.material.id,
      "picking the same line twice mints two distinct boards",
    );
    removeFromCart(shop.game, 0);
    cart = (shop.player.away as ShoppingTrip).cart;
    assert.strictEqual(cart.length, 1);
    clearCart(shop.game);
    assert.strictEqual((shop.player.away as ShoppingTrip).cart.length, 0);
  });

  it("tracks the shopper's walk across the store floor", () => {
    const shop = stockedShop();
    assert.ok(!setShoppingPosition(shop.game, [4, 7], 2), "no-op while home");
    shop.goShopping("orangeBox");
    assert.ok(setShoppingPosition(shop.game, [4, 7], 2));
    const away = shop.player.away as ShoppingTrip;
    assert.deepStrictEqual(away.position, [4, 7]);
    assert.strictEqual(away.direction, 2);
  });
});

describe("direct purchases", () => {
  it("buys boards off the lumberyard racks at channel prices", () => {
    const shop = stockedShop();
    const before = shop.wallet.money;
    shop.buyBoards(
      "s2sRack",
      "maple",
      { length: 96, width: 6, thickness: 4 },
      2,
    );
    assert.strictEqual(shop.truck.bed.length, 2);
    const bought = shop.truck.bed[0];
    assert.ok(
      bought.type === "board" &&
        bought.species === "maple" &&
        bought.surface === "smooth",
    );
    assert.ok(shop.wallet.money < before, "the rack charged for the boards");
  });

  it("keeps reputation-gated racks out of reach", () => {
    const shop = stockedShop();
    assert.throws(
      () =>
        shop.buyBoards("roughRack", "walnut", {
          length: 96,
          width: 6,
          thickness: 4,
        }),
      /reputation/,
    );
  });

  it("covers the other counters: sheets, supplies, clamps, tools", () => {
    const shop = stockedShop();
    shop.buySheet("plywoodB", "project");
    assert.strictEqual(
      shop.truck.bed.filter((m) => m.type === "plywood").length,
      1,
    );
    const nails = shop.consumables.stock.nails ?? 0;
    shop.buySupplies("nails");
    assert.strictEqual(
      shop.consumables.stock.nails,
      nails + CONSUMABLE_TYPES.nails.packSize,
    );
    const clamps = shop.consumables.clamps;
    shop.buyClamps(2);
    assert.strictEqual(shop.consumables.clamps, clamps + 2);
    shop.buyTool("circularSaw");
    assert.ok(
      shop.truck.bed.some(
        (m) => m.type === "tool" && m.toolId === "circularSaw",
      ),
    );
  });

  it("buys a machine and carries it into place", () => {
    const shop = stockedShop();
    shop.putEverythingDown();
    shop.buyAndPlaceMachine("sawhorses", MACHINE_TYPES.sawhorses.cost, [3, 10]);
    assert.strictEqual(shop.truck.crates.length, 0);
    assert.strictEqual(shop.player.carriedMachine, null);
    assert.ok(shop.machine("sawhorses"), "the horses stand on the floor");
  });

  it("refuses every counter without the money", () => {
    const shop = stockedShop();
    shop.wallet.money = 0;
    assert.ok(!buyMaterial(shop.game, board("pine", 96, 4, 8, "smooth"), 10));
    assert.strictEqual(shop.truck.bed.length, 0);
    assert.ok(
      !buyMachine(shop.game, "sawhorses", MACHINE_TYPES.sawhorses.cost),
    );
    assert.strictEqual(shop.truck.crates.length, 0);
    assert.ok(!buyClamp(shop.game));
    assert.ok(!buyConsumablePack(shop.game, "nails"));
    assert.ok(!buyUpgrade(shop.game, "vise"));
    assert.strictEqual(shop.wallet.money, 0);
  });
});

describe("mid-trip saves", () => {
  it("round-trips byte-identically mid-shopping with a cart", () => {
    const shop = new ShopDriver();
    shop.progression.storeUnlocked = true;
    shop.wallet.money = 500;
    shop.goShopping("orangeBox").takeCart();
    addToCart(shop.game, {
      kind: "material",
      material: board("pine", 96, 4, 8, "smooth"),
      price: 12,
    });
    addToCart(shop.game, { kind: "clamp", price: CLAMP_COST });
    setShoppingPosition(shop.game, [4, 7], 2);
    const first = shop.save();
    const reloaded = new ShopDriver({ save: first });
    assert.strictEqual(JSON.stringify(reloaded.save()), JSON.stringify(first));
    const away = reloaded.player.away;
    assert.ok(
      away?.kind === "shopping" && away.hasCart && away.cart.length === 2,
      "the reload finds the cart in hand where it was left",
    );
    assert.deepStrictEqual(away.position, [4, 7]);
  });

  it("round-trips byte-identically mid-scavenge at a decision", () => {
    const shop = new ShopDriver();
    shop.standAtCab();
    startScavenging(shop.game, alwaysFinds);
    shop.tick(SCAVENGE_STOP_TICKS + 1);
    const away = shop.player.away;
    assert.ok(away?.kind === "scavenging" && away.phase.kind === "deciding");
    const first = shop.save();
    const reloaded = new ShopDriver({ save: first });
    assert.strictEqual(JSON.stringify(reloaded.save()), JSON.stringify(first));
    const reloadedAway = reloaded.player.away;
    assert.ok(
      reloadedAway?.kind === "scavenging" &&
        reloadedAway.phase.kind === "deciding" &&
        reloadedAway.stopsSearched === 1,
    );
  });
});
