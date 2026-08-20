import assert from "node:assert";
import { describe, it } from "node:test";
import { Game } from "../core/Game";
import {
  IDLE_PACE,
  MAX_GAME_MINUTES_PER_TICK,
  TimeFlow,
  WAIT_MAX_PACE,
  WAIT_START_PACE,
  WORKING_PACE,
} from "./TimeFlow";

/**
 * The pace rules, carried over from src/game/time-flow.test.ts: the same
 * speeds with the same precedence, resolved from registered providers
 * instead of a GameState.
 */

function makeTimeFlow(): { game: Game; timeFlow: TimeFlow } {
  const game = new Game({ headless: true });
  const timeFlow = game.addEntity(new TimeFlow());
  return { game, timeFlow };
}

describe("TimeFlow speed", () => {
  it("idles a fresh shop — the clock creeps, nothing more", () => {
    const { timeFlow } = makeTimeFlow();
    assert.equal(timeFlow.resolveSpeed(), "idle");
  });

  it("spends time while any spender is active", () => {
    const { timeFlow } = makeTimeFlow();
    let busy = false;
    timeFlow.registerSpender(() => busy);
    assert.equal(timeFlow.resolveSpeed(), "idle");
    busy = true;
    assert.equal(timeFlow.resolveSpeed(), "working");
  });

  it("stops while the player is home in bed", () => {
    const { timeFlow } = makeTimeFlow();
    timeFlow.registerStop(() => true);
    timeFlow.registerSpender(() => true);
    assert.equal(timeFlow.resolveSpeed(), "stopped");
  });

  it("stops for any one of several holds", () => {
    const { timeFlow } = makeTimeFlow();
    let inBed = false;
    let behindTheCurtain = false;
    timeFlow.registerStop(() => inBed);
    timeFlow.registerStop(() => behindTheCurtain);
    timeFlow.registerSpender(() => true);
    assert.equal(timeFlow.resolveSpeed(), "working");
    behindTheCurtain = true;
    assert.equal(timeFlow.resolveSpeed(), "stopped");
    behindTheCurtain = false;
    inBed = true;
    assert.equal(timeFlow.resolveSpeed(), "stopped");
  });

  it("forgets an unregistered stop", () => {
    const { timeFlow } = makeTimeFlow();
    const unregister = timeFlow.registerStop(() => true);
    assert.equal(timeFlow.resolveSpeed(), "stopped");
    unregister();
    assert.equal(timeFlow.resolveSpeed(), "idle");
  });

  it("spins under the held wait key", () => {
    const { timeFlow } = makeTimeFlow();
    timeFlow.setWaitingProvider(() => true);
    assert.equal(timeFlow.resolveSpeed(), "waiting");
  });

  it("stands the wait key down at night", () => {
    const { timeFlow } = makeTimeFlow();
    timeFlow.setWaitingProvider(() => true);
    timeFlow.setNightProvider(() => true);
    assert.equal(timeFlow.resolveSpeed(), "stopped");
  });

  it("stops a closed shop with nobody working", () => {
    const { timeFlow } = makeTimeFlow();
    timeFlow.setNightProvider(() => true);
    assert.equal(timeFlow.resolveSpeed(), "stopped");
  });

  it("lets working outrank the wait key — waiting never speeds up work", () => {
    const { timeFlow } = makeTimeFlow();
    timeFlow.setWaitingProvider(() => true);
    timeFlow.registerSpender(() => true);
    assert.equal(timeFlow.resolveSpeed(), "working");
  });

  it("forgets an unregistered spender", () => {
    const { timeFlow } = makeTimeFlow();
    const unregister = timeFlow.registerSpender(() => true);
    assert.equal(timeFlow.resolveSpeed(), "working");
    unregister();
    assert.equal(timeFlow.resolveSpeed(), "idle");
  });
});

describe("TimeFlow gameDt", () => {
  it("advances game minutes at working pace while spending", () => {
    const { game, timeFlow } = makeTimeFlow();
    timeFlow.registerSpender(() => true);
    game.step(1);
    assert.ok(
      Math.abs(timeFlow.gameDt - WORKING_PACE * game.tickDuration) < 1e-12,
    );
  });

  it("creeps at idle pace", () => {
    const { game, timeFlow } = makeTimeFlow();
    game.step(1);
    assert.ok(
      Math.abs(timeFlow.gameDt - IDLE_PACE * game.tickDuration) < 1e-12,
    );
  });

  it("gives nothing at a stop", () => {
    const { game, timeFlow } = makeTimeFlow();
    timeFlow.registerStop(() => true);
    game.step(1);
    assert.equal(timeFlow.gameDt, 0);
  });

  it("serves forced minutes through a stop", () => {
    // A charged leg — a store drive, the overnight batch — is booked in
    // whole minutes by the command that starts it, and runs whatever
    // the pace model says. That is what lets a trip's curtain hold the
    // clock without swallowing the drive it covers.
    const { game, timeFlow } = makeTimeFlow();
    timeFlow.registerStop(() => true);
    timeFlow.forceMinutes(30);
    game.step(1);
    assert.equal(timeFlow.wholeTicks, 30);
  });

  it("ramps the wait pace from a gentle spin to twice working pace", () => {
    const { game, timeFlow } = makeTimeFlow();
    timeFlow.setWaitingProvider(() => true);
    game.step(1);
    // First tick: barely held, still near the ramp's start.
    assert.ok(timeFlow.gameDt / game.tickDuration < WAIT_START_PACE + 0.5);
    // Hold well past the ramp: top pace.
    game.step(60 * 10);
    assert.ok(
      Math.abs(timeFlow.gameDt - WAIT_MAX_PACE * game.tickDuration) < 1e-12,
    );
    assert.equal(WAIT_MAX_PACE, 2 * WORKING_PACE);
  });

  it("resets the ramp when the hold breaks", () => {
    const { game, timeFlow } = makeTimeFlow();
    let waiting = true;
    timeFlow.setWaitingProvider(() => waiting);
    game.step(60 * 10);
    const topPace = timeFlow.gameDt;
    waiting = false;
    game.step(1);
    waiting = true;
    game.step(1);
    assert.ok(timeFlow.gameDt < topPace / 2);
  });

  it("caps gameDt per engine tick", () => {
    const { game, timeFlow } = makeTimeFlow();
    // A pathological pace can't tunnel the sim: even if a tick wants more
    // than the cap, it gets the cap.
    timeFlow.registerSpender(() => true);
    const slowEngine = new Game({ headless: true, ticksPerSecond: 1 });
    const slowFlow = slowEngine.addEntity(new TimeFlow());
    slowFlow.registerSpender(() => true);
    slowEngine.step(1);
    assert.equal(slowFlow.gameDt, MAX_GAME_MINUTES_PER_TICK);
    // The normal 60 Hz engine stays well under it.
    game.step(1);
    assert.ok(timeFlow.gameDt < MAX_GAME_MINUTES_PER_TICK);
  });
});
