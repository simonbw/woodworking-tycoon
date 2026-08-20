import assert from "node:assert";
import { describe, it } from "node:test";
import { BaseEntity } from "./entity/BaseEntity";
import { Entity } from "./entity/Entity";
import { on } from "./entity/handler";
import { Game } from "./Game";
import { mulberry32 } from "./util/SeededRandom";

/**
 * The phase-0 gate for the vendored engine: a headless game advances
 * synchronously, exercises entity lifecycle and randomness, and two runs
 * with the same seed are identical down to the last float.
 */

class Wanderer extends BaseEntity implements Entity {
  x = 0;
  y = 0;
  trace: number[] = [];

  @on("tick")
  onTick(dt: number) {
    this.x += (this.game.random() - 0.5) * dt;
    this.y += (this.game.random() - 0.5) * dt;

    // Exercise mid-tick entity lifecycle: hatch short-lived children that
    // draw from the shared random stream while they live.
    if (this.game.ticknumber % 97 === 0) {
      this.addChild(new Mayfly());
    }

    if (this.game.ticknumber % 1000 === 0) {
      this.trace.push(this.x, this.y);
    }
  }
}

class Mayfly extends BaseEntity implements Entity {
  ticksLeft = 30;

  @on("tick")
  onTick() {
    const parent = this.parent as Wanderer;
    parent.x += (this.game.random() - 0.5) * 0.001;
    if (--this.ticksLeft <= 0) {
      this.destroy();
    }
  }
}

function runSimulation(seed: number): string {
  const game = new Game({ headless: true, random: mulberry32(seed) });
  const wanderer = game.addEntity(new Wanderer());
  game.step(10_000);
  return JSON.stringify({
    x: wanderer.x,
    y: wanderer.y,
    trace: wanderer.trace,
    ticks: game.ticknumber,
    elapsed: game.elapsedTime,
    entityCount: game.entities.all.size,
  });
}

describe("headless Game", () => {
  it("builds no renderer, io, or audio", () => {
    const game = new Game({ headless: true });
    assert.strictEqual(game.renderer, undefined);
    assert.strictEqual(game.audio, undefined);
    assert.throws(() => game.io);
    assert.throws(() => game.camera);
  });

  it("advances synchronously with step()", () => {
    const game = new Game({ headless: true });
    game.step(60);
    assert.strictEqual(game.ticknumber, 60);
    assert.ok(Math.abs(game.elapsedTime - 1.0) < 1e-9);
  });

  it("runs 10,000 ticks identically for the same seed", () => {
    assert.strictEqual(runSimulation(42), runSimulation(42));
  });

  it("runs differently for a different seed", () => {
    assert.notStrictEqual(runSimulation(42), runSimulation(43));
  });
});

class PauseWatcher extends BaseEntity implements Entity {
  ticks = 0;
  pauseCalls = 0;
  unpauseCalls = 0;

  constructor(pausable: boolean) {
    super();
    this.pausable = pausable;
  }

  @on("tick")
  onTick() {
    this.ticks += 1;
  }

  @on("pause")
  onPause() {
    this.pauseCalls += 1;
  }

  @on("unpause")
  onUnpause() {
    this.unpauseCalls += 1;
  }
}

describe("Game pause/unpause", () => {
  it("calls onPause/onUnpause on pausable entities too, and stops only their ticking", () => {
    const game = new Game({ headless: true });
    const pausable = game.addEntity(new PauseWatcher(true));
    const unpausable = game.addEntity(new PauseWatcher(false));

    game.pause();
    assert.strictEqual(game.paused, true);
    assert.strictEqual(pausable.pauseCalls, 1);
    assert.strictEqual(unpausable.pauseCalls, 1);

    game.step(5);
    assert.strictEqual(pausable.ticks, 0, "pausable entity stops ticking");
    assert.strictEqual(unpausable.ticks, 5, "unpausable entity keeps ticking");

    game.unpause();
    assert.strictEqual(game.paused, false);
    assert.strictEqual(pausable.unpauseCalls, 1);
    assert.strictEqual(unpausable.unpauseCalls, 1);

    game.step(5);
    assert.strictEqual(pausable.ticks, 5);
    assert.strictEqual(unpausable.ticks, 10);
  });
});
