import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "../board-helpers";
import { GameState } from "../GameState";
import { initialGameState } from "../initialGameState";
import { makeMaterial } from "../material-helpers";
import { getSellValue } from "../material-values";
import { FinishedProduct, MaterialInstance } from "../Materials";
import {
  Customer,
  CUSTOMER_BROWSE_TICKS,
  saleReputationGain,
  standFrontage,
  standRect,
} from "../stand";
import {
  setOutAtStandAction,
  standTickPass,
  takeFromStandAction,
} from "./stand-actions";

function shelf(): FinishedProduct {
  return makeMaterial<FinishedProduct>({
    type: "rusticShelf",
    species: "pallet",
  });
}

function rawBoard() {
  return board();
}

/** The player standing beside the table, holding the given pieces. */
function atTheStand(
  inventory: ReadonlyArray<MaterialInstance>,
  overrides: Partial<GameState> = {},
): GameState {
  const rect = standRect(initialGameState.shopInfo);
  return {
    ...initialGameState,
    ...overrides,
    player: {
      ...initialGameState.player,
      position: [
        Math.floor((rect.min[0] + rect.max[0]) / 2),
        Math.floor(rect.min[1]) - 1,
      ],
      inventory,
    },
  };
}

/** An rng that plays back a scripted tape, then holds at `rest`. */
function tape(values: number[], rest = 0.99): () => number {
  let i = 0;
  return () => (i < values.length ? values[i++] : rest);
}

describe("setting work out", () => {
  it("moves sellable pieces from the arms to the table", () => {
    const piece = shelf();
    const result = setOutAtStandAction([piece])(atTheStand([piece]));
    assert.deepStrictEqual(result.stand, [piece]);
    assert.deepStrictEqual(result.player.inventory, []);
  });

  it("refuses raw stock", () => {
    const board = rawBoard();
    const state = atTheStand([board]);
    assert.strictEqual(setOutAtStandAction([board])(state), state);
  });

  it("refuses away from the stand", () => {
    const piece = shelf();
    const state: GameState = {
      ...atTheStand([piece]),
      player: {
        ...atTheStand([piece]).player,
        position: [2, 2],
      },
    };
    assert.strictEqual(setOutAtStandAction([piece])(state), state);
  });
});

describe("taking work back", () => {
  it("returns the newest piece first", () => {
    const first = shelf();
    const second = shelf();
    const state = atTheStand([], { stand: [first, second] });
    const result = takeFromStandAction()(state);
    assert.deepStrictEqual(result.player.inventory, [second]);
    assert.deepStrictEqual(result.stand, [first]);
  });

  it("takes no more than the hands can hold", () => {
    const pieces = [shelf(), shelf(), shelf()];
    const held = [shelf(), shelf(), shelf()];
    const state = atTheStand(held, { stand: pieces });
    const result = takeFromStandAction(3)(state);
    // Four is the cap and three are already in hand.
    assert.strictEqual(result.player.inventory.length, 4);
    assert.strictEqual(result.stand.length, 2);
  });
});

describe("the street pass", () => {
  it("does nothing on a quiet street without burning state identity", () => {
    // No customers, no spawn roll success: the same object comes back.
    const state = atTheStand([]);
    assert.strictEqual(standTickPass(tape([0.99]))(state), state);
  });

  it("spawns nobody at night", () => {
    const state: GameState = {
      ...atTheStand([], { stand: [shelf()] }),
      // Past close: the whole day's budget is spent.
      tick: 700,
      dayStartTick: 0,
    };
    const result = standTickPass(tape([0]))(state);
    assert.strictEqual((result.customers ?? []).length, 0);
  });

  it("walks a customer up to a stocked stand, sells, and pays out", () => {
    const piece = shelf();
    const value = getSellValue(piece);
    const frontage = standFrontage(initialGameState.shopInfo);
    const shopper: Customer = {
      id: "customer-test",
      x: frontage.left - 0.1,
      walkDirection: 1,
      state: "walking",
      browseTicksLeft: 0,
    };
    let state: GameState = atTheStand([], {
      stand: [piece],
      customers: [shopper],
    });

    // One step carries them into the frontage; they stop to browse.
    state = standTickPass(tape([0.99]))(state);
    assert.strictEqual(state.customers[0].state, "browsing");

    // Browse down to the decision, keeping the spawn roll quiet.
    for (let i = 0; i < CUSTOMER_BROWSE_TICKS - 1; i++) {
      state = standTickPass(tape([0.99]))(state);
    }
    // Decision tick: spawn roll misses, the buy roll hits, the pick
    // takes the only piece.
    state = standTickPass(tape([0.99, 0.1, 0]))(state);

    assert.deepStrictEqual(state.stand, []);
    assert.strictEqual(state.money, initialGameState.money + value);
    assert.strictEqual(
      state.reputation,
      initialGameState.reputation + saleReputationGain(value),
    );
    assert.strictEqual(state.progression.salesCompleted, 1);
    assert.strictEqual(state.customers[0].state, "leaving");
    const payout = (state.pendingPayouts ?? [])[0];
    assert.ok(payout, "a sale announces itself");
    assert.strictEqual(payout.kind, "sale");
    assert.strictEqual(payout.money, value);
  });

  it("lets a browser walk away empty-handed", () => {
    const piece = shelf();
    const browser: Customer = {
      id: "customer-test",
      x: 2,
      walkDirection: 1,
      state: "browsing",
      browseTicksLeft: 1,
    };
    // A shop with a sale behind it — the first browse never walks away.
    const state = atTheStand([], {
      stand: [piece],
      customers: [browser],
      progression: { ...initialGameState.progression, salesCompleted: 1 },
    });
    // Spawn roll misses, then the buy roll misses too.
    const result = standTickPass(tape([0.99, 0.9]))(state);
    assert.deepStrictEqual(result.stand, [piece]);
    assert.strictEqual(result.money, state.money);
    assert.strictEqual(result.customers[0].state, "leaving");
  });
});

describe("the first sale", () => {
  it("summons a customer to a first-stocked stand without waiting on the dice", () => {
    const state = atTheStand([], { stand: [shelf()] });
    // The spawn roll never comes up — the customer appears anyway.
    const result = standTickPass(tape([], 0.99))(state);
    assert.strictEqual(result.customers.length, 1);

    // No second summons while that one is still headed for the table.
    const again = standTickPass(tape([], 0.99))(result);
    assert.strictEqual(again.customers.length, 1);
  });

  it("never summons after the shop has sold something", () => {
    const state = atTheStand([], {
      stand: [shelf()],
      progression: { ...initialGameState.progression, salesCompleted: 1 },
    });
    const result = standTickPass(tape([], 0.99))(state);
    assert.strictEqual(result.customers.length, 0);
  });

  it("the first browse always buys, even on a cold roll", () => {
    const piece = shelf();
    const browser: Customer = {
      id: "customer-test",
      x: 2,
      walkDirection: 1,
      state: "browsing",
      browseTicksLeft: 1,
    };
    const state = atTheStand([], { stand: [piece], customers: [browser] });
    const result = standTickPass(tape([], 0.99))(state);
    assert.deepStrictEqual(result.stand, []);
    assert.strictEqual(result.progression.salesCompleted, 1);
  });

  it("carries an unlucky shop all the way to its first sale", () => {
    // Every roll as cold as they come: no spawn would pass, no buy
    // would pass. The guarantee walks its customer to the table anyway.
    const cold = () => 0.99;
    let state = atTheStand([], { stand: [shelf()] });
    for (let i = 0; i < 400 && state.progression.salesCompleted === 0; i++) {
      state = standTickPass(cold)(state);
    }
    assert.strictEqual(state.progression.salesCompleted, 1);
    assert.deepStrictEqual(state.stand, []);
    assert.ok(state.money > initialGameState.money);
  });
});
