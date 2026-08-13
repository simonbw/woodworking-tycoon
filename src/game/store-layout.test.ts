import assert from "node:assert";
import { describe, it } from "node:test";
import { GameState } from "./GameState";
import { initialGameState } from "./initialGameState";
import { PLAYER_RADIUS, Solid } from "./player-motion";
import {
  cabStandCell,
  fixtureStandCell,
  machinesForSale,
  registerStandCell,
  storeCollisionWorld,
  storeLayout,
  toolsForSale,
  withinStoreReach,
} from "./store-layout";
import { resolveStoreInteract, cartIndexToReturn } from "./store-interact";
import { addToCartAction } from "./game-actions/cart-actions";
import { StoreId, unlockedLumberChannels } from "./lumberStock";
import { SHEET_SIZES, unlockedSheetSkus } from "./sheetStock";
import { Vector } from "./Vectors";

function stateWith(overrides: Partial<GameState> = {}): GameState {
  return { ...initialGameState, ...overrides };
}

/** Distance from a point to a solid's surface (negative means inside). */
function distanceToSolid([x, y]: Vector, solid: Solid): number {
  if (solid.kind === "circle") {
    return Math.hypot(x - solid.center[0], y - solid.center[1]) - solid.radius;
  }
  const dx = Math.max(solid.min[0] - x, 0, x - solid.max[0]);
  const dy = Math.max(solid.min[1] - y, 0, y - solid.max[1]);
  return Math.hypot(dx, dy);
}

/**
 * Every lattice point (half-cell resolution) the walking body can reach
 * from the spawn point. The body is a disc, so a point is standable when
 * the disc fits there; half-cell resolution is what lets the fill walk
 * the middle of a two-cell aisle, which is exactly the width the shop
 * calls walkable.
 */
function reachablePoints(store: StoreId, gameState: GameState) {
  const layout = storeLayout(store, gameState);
  const world = storeCollisionWorld(layout);
  const key = ([x, y]: Vector) => `${x},${y}`;
  const standable = ([x, y]: Vector) =>
    x >= PLAYER_RADIUS &&
    y >= PLAYER_RADIUS &&
    x <= world.size[0] - PLAYER_RADIUS &&
    y <= world.size[1] - PLAYER_RADIUS &&
    world.solids.every(
      (solid) => distanceToSolid([x, y], solid) >= PLAYER_RADIUS,
    );

  const start: Vector = [
    layout.spawn.cell[0] + 0.5,
    layout.spawn.cell[1] + 0.5,
  ];
  assert.ok(standable(start), "the spawn point itself must be standable");

  const seen = new Set<string>([key(start)]);
  const queue: Vector[] = [start];
  while (queue.length > 0) {
    const [x, y] = queue.pop()!;
    for (const next of [
      [x + 0.5, y],
      [x - 0.5, y],
      [x, y + 0.5],
      [x, y - 0.5],
    ] as Vector[]) {
      if (seen.has(key(next)) || !standable(next)) continue;
      seen.add(key(next));
      queue.push(next);
    }
  }
  return { layout, seen, key };
}

/** Whether any reachable point is within arm's reach of the rectangle. */
function rectReachable(
  seen: Set<string>,
  rect: { min: Vector; max: Vector },
): boolean {
  for (const point of seen) {
    const [x, y] = point.split(",").map(Number);
    // withinStoreReach takes a cell; feed it the point as a pseudo-cell
    // by backing off the +0.5 center it adds.
    if (withinStoreReach([x - 0.5, y - 0.5], rect)) {
      return true;
    }
  }
  return false;
}

describe("storeLayout", () => {
  for (const store of ["orangeBox", "lumberyard"] as const) {
    it(`${store}: fixtures stay inside the walls and off each other`, () => {
      const layout = storeLayout(store, stateWith({ reputation: 100 }));
      const rects = [
        ...layout.fixtures.map((fixture) => fixture.rect),
        ...layout.spines,
        layout.register,
      ];
      for (const rect of rects) {
        assert.ok(rect.min[0] >= 0 && rect.min[1] >= 0, "inside the walls");
        assert.ok(
          rect.max[0] <= layout.interior[0] &&
            rect.max[1] <= layout.interior[1],
          "inside the walls",
        );
      }
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i];
          const b = rects[j];
          const apart =
            a.max[0] <= b.min[0] ||
            b.max[0] <= a.min[0] ||
            a.max[1] <= b.min[1] ||
            b.max[1] <= a.min[1];
          assert.ok(apart, `fixtures ${i} and ${j} overlap`);
        }
      }
    });

    it(`${store}: every shelf, the register, and the cab can be walked to`, () => {
      const { layout, seen } = reachablePoints(
        store,
        stateWith({ reputation: 100 }),
      );
      for (const fixture of layout.fixtures) {
        assert.ok(
          rectReachable(seen, fixture.rect),
          `${fixture.id} is walled off`,
        );
      }
      assert.ok(rectReachable(seen, layout.register), "register walled off");
      assert.ok(rectReachable(seen, layout.truckCab), "cab walled off");
      // The door really is the way in: some indoor point is reachable
      // from the spawn outside.
      assert.ok(
        [...seen].some((point) => {
          const [, y] = point.split(",").map(Number);
          return y < layout.interior[1] - 1;
        }),
        "no reachable point inside the store",
      );
    });
  }

  it("puts every priced machine, tool, lumber sku, and sheet sku on the floor", () => {
    const layout = storeLayout("orangeBox", stateWith());
    const bayIds = layout.fixtures.map((fixture) => fixture.id);
    for (const machine of machinesForSale()) {
      assert.ok(
        bayIds.includes(`machine:${machine.id}`),
        `${machine.id} missing from the machine aisle`,
      );
    }
    for (const tool of toolsForSale()) {
      assert.ok(
        bayIds.includes(`wall:tool:${tool.id}`),
        `${tool.id} missing from the tool wall`,
      );
    }
    assert.ok(bayIds.some((id) => id.startsWith("supplies:")));
    // One pile per channel × species × dimension...
    for (const channel of unlockedLumberChannels(0, "orangeBox")) {
      for (const species of channel.species) {
        for (const sku of channel.skus) {
          assert.ok(
            bayIds.includes(
              `lumber:${channel.id}:${species}:${sku.thickness}x${sku.width}x${sku.length}`,
            ),
            `${channel.id} ${species} ${sku.length}" pile missing`,
          );
        }
      }
    }
    // ...and one per sheet kind × size.
    for (const sku of unlockedSheetSkus(0)) {
      for (const size of SHEET_SIZES) {
        assert.ok(
          bayIds.includes(`sheet:${sku.kind}:${size.id}`),
          `${sku.kind} ${size.id} pile missing`,
        );
      }
    }
  });

  it("sorts the lumber aisle construction-first and the sheets size-first", () => {
    const layout = storeLayout("orangeBox", stateWith());
    const lumber = layout.fixtures.filter((fixture) =>
      fixture.id.startsWith("lumber:"),
    );
    // Runs hang from the front cross-aisle: walking in from the doors
    // (larger y first), construction comes before the hardwood rack.
    const firstHardwood = lumber.findIndex(
      (fixture) => !fixture.id.startsWith("lumber:constructionLumber:"),
    );
    assert.ok(firstHardwood > 0, "construction piles come first");
    assert.ok(
      lumber
        .slice(firstHardwood)
        .every((fixture) => !fixture.id.startsWith("lumber:constructionLumber:")),
      "hardwood piles all follow the construction group",
    );
    const frontOf = (id: string) =>
      layout.fixtures.find((fixture) => fixture.id === id)!.rect.max[1];
    assert.ok(
      frontOf("lumber:constructionLumber:pine:8x4x96") >
        frontOf(lumber[firstHardwood].id),
      "construction stands nearer the doors than the hardwoods",
    );
    // Sheets: every full-sheet pile stands nearer the doors than every
    // project-panel pile.
    const fulls = layout.fixtures.filter((fixture) =>
      fixture.id.endsWith(":full"),
    );
    const projects = layout.fixtures.filter((fixture) =>
      fixture.id.endsWith(":project"),
    );
    assert.ok(fulls.length > 0 && projects.length > 0);
    for (const full of fulls) {
      for (const project of projects) {
        assert.ok(full.rect.min[1] > project.rect.max[1] - 0.01);
      }
    }
  });

  it("materializes lumber piles with reputation and hides them without", () => {
    const fresh = storeLayout("lumberyard", stateWith({ reputation: 0 }));
    assert.strictEqual(
      fresh.fixtures.filter((fixture) => fixture.id.startsWith("lumber:"))
        .length,
      0,
    );
    const seasoned = storeLayout("lumberyard", stateWith({ reputation: 100 }));
    // Two channels' worth of piles: one per species × dimension.
    assert.strictEqual(
      seasoned.fixtures.filter((fixture) => fixture.id.startsWith("lumber:"))
        .length,
      24,
    );
    // The sheet piles grow with reputation too.
    const starterSheets = storeLayout("orangeBox", stateWith({ reputation: 0 }));
    const seasonedSheets = storeLayout(
      "orangeBox",
      stateWith({ reputation: 100 }),
    );
    assert.ok(
      seasonedSheets.fixtures.filter((fixture) =>
        fixture.id.startsWith("sheet:"),
      ).length >
        starterSheets.fixtures.filter((fixture) =>
          fixture.id.startsWith("sheet:"),
        ).length,
    );
  });

  it("takes the broom bay off the wall once the shop owns one", () => {
    const layout = storeLayout("orangeBox", stateWith({ broomOwned: true }));
    assert.ok(!layout.fixtures.some((fixture) => fixture.id === "wall:broom"));
  });
});

describe("resolveStoreInteract", () => {
  function shoppingAt(position: Vector, money = 500): GameState {
    const base = stateWith({ money });
    return {
      ...base,
      player: {
        ...base.player,
        away: {
          kind: "shopping",
          store: "orangeBox",
          cart: [],
          position,
          direction: 1,
        },
      },
    };
  }

  const layout = storeLayout("orangeBox", stateWith());
  const sawBay = layout.fixtures.find(
    (fixture) => fixture.id === "wall:tool:handSaw",
  );
  assert.ok(sawBay && sawBay.kind === "bay");

  it("finds the bay the shopper stands at", () => {
    const state = shoppingAt(fixtureStandCell(sawBay));
    const interact = resolveStoreInteract(state, layout);
    assert.strictEqual(interact?.fixture?.id, "wall:tool:handSaw");
    assert.strictEqual(interact.inCart, 0);
  });

  it("resolves a back-row pile by standing on it", () => {
    // The paired panel piles sit one behind the other; the far pile is
    // walkable, and standing on it beats the pile in front.
    const farPile = layout.fixtures.find(
      (fixture, index, all) =>
        fixture.id.startsWith("sheet:") &&
        fixture.id.endsWith(":handy") &&
        index > all.findIndex((f) => f.id.endsWith(":handy")),
    );
    assert.ok(farPile);
    const state = shoppingAt(fixtureStandCell(farPile));
    assert.strictEqual(
      resolveStoreInteract(state, layout)?.fixture?.id,
      farPile.id,
    );
  });

  it("counts the bay's product in the cart and finds the line to return", () => {
    let state = shoppingAt(fixtureStandCell(sawBay));
    state = addToCartAction(sawBay.product.line)(state);
    const interact = resolveStoreInteract(state, layout);
    assert.strictEqual(interact?.inCart, 1);
    assert.strictEqual(cartIndexToReturn(state, sawBay), 0);
  });

  it("offers the register only a funded, non-empty cart", () => {
    const atRegister = shoppingAt(registerStandCell(layout));
    assert.strictEqual(
      resolveStoreInteract(atRegister, layout)?.atRegister,
      true,
    );
    assert.strictEqual(
      resolveStoreInteract(atRegister, layout)?.canCheckOut,
      false,
    );

    let carted = addToCartAction(sawBay.product.line)(atRegister);
    assert.strictEqual(resolveStoreInteract(carted, layout)?.canCheckOut, true);
    carted = { ...carted, money: 1 };
    assert.strictEqual(
      resolveStoreInteract(carted, layout)?.canCheckOut,
      false,
    );
  });

  it("finds the cab from the spawn cell", () => {
    const state = shoppingAt(cabStandCell(layout));
    assert.strictEqual(resolveStoreInteract(state, layout)?.atCab, true);
  });

  it("resolves nothing off a walkable trip", () => {
    assert.strictEqual(resolveStoreInteract(stateWith(), layout), null);
  });
});
