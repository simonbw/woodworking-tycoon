import assert from "node:assert";
import { describe, it } from "node:test";
import { BaseEntity } from "../../core/entity/BaseEntity";
import { on } from "../../core/entity/handler";
import { board } from "../../game/board-helpers";
import { GameState } from "../../game/GameState";
import { initialGameState } from "../../game/initialGameState";
import { makeMaterial } from "../../game/material-helpers";
import { getSellValue } from "../../game/material-values";
import { FinishedProduct } from "../../game/Materials";
import { PayoutEvent } from "../../game/PayoutEvent";
import { roundToCents, saleReputationGain, standRect } from "../../game/stand";
import { setOutAtStand, takeFromStand } from "../commands/stand-commands";
import { CustomerEntity } from "../entities/CustomerEntity";
import { ShopDriver } from "../driver/ShopDriver";

/**
 * The street on the new driver: the StandEntity holds what's set out, one
 * CustomerEntity per passerby, and the StreetSystem runs the old
 * standTickPass minute for minute off the game's seeded rng — so a
 * stocked stand sells, a sale pays exactly what the old reducer paid,
 * and the same seed lands the same buyers every run.
 */

function shelf(): FinishedProduct {
  return makeMaterial<FinishedProduct>({
    type: "rusticShelf",
    species: "pallet",
  });
}

/** The old world's fixture shape, adjusted per test. */
function shopState(overrides: Partial<GameState> = {}): GameState {
  return { ...initialGameState, ...overrides };
}

/** Records every payout the street announces. */
class PayoutRecorder extends BaseEntity {
  events: PayoutEvent[] = [];

  @on("payout")
  onPayout({ payout }: { payout: PayoutEvent }) {
    this.events.push(payout);
  }
}

function recordPayouts(shop: ShopDriver): PayoutRecorder {
  return shop.game.addEntity(new PayoutRecorder());
}

function customerCount(shop: ShopDriver): number {
  return shop.game.entities.byConstructor(CustomerEntity).size;
}

describe("setting work out and taking it back", () => {
  it("moves sellable pieces from the arms to the table", () => {
    const shop = new ShopDriver();
    const piece = shelf();
    shop.player.inventory = [piece];
    shop.setOut();
    assert.deepStrictEqual(shop.stand.pieces, [piece]);
    assert.deepStrictEqual(shop.player.inventory, []);
  });

  it("refuses raw stock", () => {
    const shop = new ShopDriver();
    const stock = board();
    shop.player.inventory = [stock];
    shop.standAtStand();
    assert.strictEqual(setOutAtStand(shop.game, [stock]), false);
    assert.deepStrictEqual(shop.stand.pieces, []);
    assert.deepStrictEqual(shop.player.inventory, [stock]);
  });

  it("refuses away from the stand", () => {
    const shop = new ShopDriver();
    const piece = shelf();
    shop.player.inventory = [piece];
    shop.standAt([2, 2]);
    assert.strictEqual(setOutAtStand(shop.game, [piece]), false);
    assert.deepStrictEqual(shop.stand.pieces, []);
  });

  it("returns the newest piece first", () => {
    const shop = new ShopDriver();
    const first = shelf();
    const second = shelf();
    shop.player.inventory = [first, second];
    shop.setOut();
    assert.strictEqual(takeFromStand(shop.game), true);
    assert.deepStrictEqual(shop.player.inventory, [second]);
    assert.deepStrictEqual(shop.stand.pieces, [first]);
  });

  it("takes no more than the hands can hold", () => {
    const shop = new ShopDriver();
    shop.player.inventory = [shelf(), shelf(), shelf()];
    shop.setOut();
    shop.player.inventory = [shelf(), shelf(), shelf()];
    shop.standAtStand();
    assert.strictEqual(takeFromStand(shop.game, 3), true);
    // Four is the cap and three are already in hand.
    assert.strictEqual(shop.player.inventory.length, 4);
    assert.strictEqual(shop.stand.pieces.length, 2);
  });
});

describe("the street", () => {
  it("sells a stocked stand's piece and pays out the old reducer's exact sums", () => {
    const shop = new ShopDriver();
    const recorder = recordPayouts(shop);
    const piece = shelf();
    const value = roundToCents(getSellValue(piece));
    shop.player.inventory = [piece];
    shop.setOut().awaitSales(1);

    assert.deepStrictEqual(shop.stand.pieces, []);
    assert.strictEqual(shop.wallet.money, value);
    assert.strictEqual(shop.reputation.reputation, saleReputationGain(value));
    assert.strictEqual(shop.progression.salesCompleted, 1);

    assert.strictEqual(recorder.events.length, 1);
    const payout = recorder.events[0];
    assert.strictEqual(payout.kind, "sale");
    assert.strictEqual(payout.money, value);
    assert.strictEqual(payout.reputation, saleReputationGain(value));
    assert.strictEqual(payout.xp, 0);
  });

  it("deals the first sale while the player is still standing there", () => {
    // The guarantee, not the dice: a first-stocked stand summons its
    // customer immediately, and the first browse always buys — the walk
    // in plus the browse is all it takes (about seventy minutes from the
    // far end of the block).
    const shop = new ShopDriver();
    shop.player.inventory = [shelf()];
    shop.setOut();
    shop.tick(100);
    assert.strictEqual(shop.progression.salesCompleted, 1);
    assert.deepStrictEqual(shop.stand.pieces, []);
  });

  it("sells nothing off an empty stand", () => {
    const shop = new ShopDriver();
    const recorder = recordPayouts(shop);
    const moneyBefore = shop.wallet.money;
    shop.tick(300);
    assert.strictEqual(shop.progression.salesCompleted, 0);
    assert.strictEqual(shop.wallet.money, moneyBefore);
    assert.strictEqual(shop.reputation.reputation, 0);
    assert.deepStrictEqual(recorder.events, []);
  });

  it("spawns nobody at night, not even the guaranteed first buyer", () => {
    const shop = new ShopDriver({
      // Past close: the whole day's budget is spent.
      state: shopState({ tick: 700, stand: [shelf()] }),
    });
    shop.tick(50);
    assert.strictEqual(customerCount(shop), 0);
    assert.strictEqual(shop.progression.salesCompleted, 0);
  });

  it("sells several pieces within awaitSales, dice and all", () => {
    const shop = new ShopDriver();
    const pieces = [shelf(), shelf()];
    const total = pieces.reduce(
      (sum, piece) => sum + roundToCents(getSellValue(piece)),
      0,
    );
    shop.player.inventory = [...pieces];
    shop.setOut().awaitSales(2);
    assert.strictEqual(shop.progression.salesCompleted, 2);
    assert.deepStrictEqual(shop.stand.pieces, []);
    assert.strictEqual(shop.wallet.money, roundToCents(total));
  });
});

describe("determinism", () => {
  /** A stocked shop run to two sales; returns the run's full trace. */
  function salesTrace(seed: number) {
    const shop = new ShopDriver({ seed });
    const recorder = recordPayouts(shop);
    shop.player.inventory = [shelf(), shelf()];
    shop.setOut().awaitSales(2);
    return {
      payouts: recorder.events,
      tick: shop.clock.tick,
      money: shop.wallet.money,
      reputation: shop.reputation.reputation,
      customers: [...shop.game.entities.byConstructor(CustomerEntity)].map(
        (customer) => customer.toCustomer(),
      ),
    };
  }

  it("lands the same sales trace for the same seed", () => {
    // Payout ids derive from tick and title, customer ids from tick and
    // street position — none of it minted — so identical seeds must
    // produce byte-identical traces.
    assert.deepStrictEqual(salesTrace(7), salesTrace(7));
  });
});

describe("serialization", () => {
  it("round-trips byte-identically with customers mid-stroll", () => {
    const shop = new ShopDriver({
      state: shopState({ stand: [shelf()] }),
    });
    // The first-sale guarantee summons a walker on the first minute; ten
    // minutes in they're mid-stroll, short of the table.
    shop.tick(10);
    assert.ok(customerCount(shop) > 0, "someone should be on the sidewalk");
    assert.strictEqual(shop.progression.salesCompleted, 0);

    const save = shop.save();
    const reloaded = new ShopDriver({ save });
    assert.strictEqual(JSON.stringify(reloaded.save()), JSON.stringify(save));
    assert.strictEqual(customerCount(reloaded), customerCount(shop));
    assert.deepStrictEqual(
      [...reloaded.game.entities.byConstructor(CustomerEntity)].map(
        (customer) => customer.toCustomer(),
      ),
      [...shop.game.entities.byConstructor(CustomerEntity)].map((customer) =>
        customer.toCustomer(),
      ),
    );
    assert.deepStrictEqual(reloaded.stand.pieces, shop.stand.pieces);
  });

  it("round-trips a fixture's preset customers in their serialized order", () => {
    const state = shopState({
      stand: [shelf()],
      customers: [
        {
          id: "customer-a",
          x: 2.5,
          walkDirection: 1,
          state: "walking",
          browseTicksLeft: 0,
        },
        {
          id: "customer-b",
          x: 0.8,
          walkDirection: -1,
          state: "browsing",
          browseTicksLeft: 3,
        },
      ],
      progression: { ...initialGameState.progression, salesCompleted: 1 },
    });
    const shop = new ShopDriver({ state });
    const save = shop.save();
    assert.strictEqual(
      JSON.stringify(new ShopDriver({ save }).save()),
      JSON.stringify(save),
    );
    assert.deepStrictEqual(
      [...shop.game.entities.byConstructor(CustomerEntity)].map(
        (customer) => customer.customerId,
      ),
      ["customer-a", "customer-b"],
    );
  });
});
