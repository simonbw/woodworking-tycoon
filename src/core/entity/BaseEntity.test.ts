import assert from "node:assert";
import { describe, it } from "node:test";
import { Game } from "../Game";
import { BaseEntity } from "./BaseEntity";
import { Entity } from "./Entity";

class Probe extends BaseEntity implements Entity {}

describe("BaseEntity.waitUntil", () => {
  it("reports t as 0, not NaN, while the infinite-delay timer is pending", () => {
    const game = new Game({ headless: true });
    const entity = game.addEntity(new Probe());
    const seenT: number[] = [];

    void entity.waitUntil(
      () => false,
      (_dt, t) => {
        seenT.push(t);
      },
    );

    game.step(5);

    assert.strictEqual(seenT.length, 5);
    assert.ok(
      seenT.every((t) => t === 0),
      `expected every t to be 0, got ${JSON.stringify(seenT)}`,
    );
  });

  it("still resolves once the predicate is satisfied", async () => {
    const game = new Game({ headless: true });
    const entity = game.addEntity(new Probe());
    let ticks = 0;

    const promise = entity.waitUntil(() => ticks >= 3);

    game.step(2);
    ticks = 3;
    game.step(1);

    // resolve() fulfills synchronously inside the tick, but the promise
    // callback itself only runs once the microtask queue drains.
    await promise;
  });
});
