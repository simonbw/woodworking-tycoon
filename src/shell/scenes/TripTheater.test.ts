import assert from "node:assert";
import { describe, it } from "node:test";
import { Game } from "../../core/Game";
import { truckCabSideCell } from "../../game/lot";
import { cellCenter } from "../../game/player-motion";
import { bootShop } from "../../sim/bootstrap";
import {
  headHomeFromScavenging,
  startScavenging,
} from "../../sim/commands/trip-commands";
import { Player } from "../../sim/entities/Player";
import { Clock } from "../../sim/singletons/Clock";
import { ShopInfo } from "../../sim/singletons/ShopInfo";
import { TimeFlow } from "../../sim/TimeFlow";
import {
  TripTheater,
  TRUCK_ARRIVE_SECONDS,
  TRUCK_DEPART_SECONDS,
} from "./TripTheater";

/**
 * The clock behind the trip's curtain. The truck's roll out of the
 * driveway and back into it are theater over one instant of
 * `player.away`, and no game time may pass while they play: a
 * scavenging run's first half-hour belongs to the trip's own screen,
 * and a drive is charged in whole minutes by the command that starts
 * it, so a live clock under the roll would charge it twice.
 */

function bootedShop(): { game: Game; theater: TripTheater; clock: Clock } {
  const game = new Game({ headless: true });
  bootShop(game);
  // Every trip starts at the truck's cab, so that's where the body has
  // to be standing for one to be offered at all.
  const shopInfo = game.entities.getSingleton(ShopInfo);
  game.entities.getSingleton(Player).position = cellCenter(
    truckCabSideCell(shopInfo.info),
  );
  const theater = game.addEntity(new TripTheater());
  // One tick to let the theater take the parked shop as it found it.
  game.step(1);
  return { game, theater, clock: game.entities.getSingleton(Clock) };
}

/** Step the world for this many real seconds. */
function stepSeconds(game: Game, seconds: number): void {
  game.step(Math.round(seconds / game.tickDuration));
}

describe("the trip curtain and the clock", () => {
  it("holds the clock while the truck rolls out of the driveway", () => {
    const { game, theater, clock } = bootedShop();
    const before = clock.tick;

    startScavenging(game);
    // The search is a registered spender, so an unheld clock would run
    // at working pace — five shop minutes a second — right through the
    // roll, before the trip's screen is even up.
    stepSeconds(game, TRUCK_DEPART_SECONDS - 0.5);
    assert.equal(theater.stage(), "departing");
    assert.equal(clock.tick, before);

    // Once the truck is gone the half-hour starts being spent.
    stepSeconds(game, 1);
    assert.equal(theater.stage(), "away");
    stepSeconds(game, 1);
    assert.ok(clock.tick > before);
  });

  it("holds the clock while the truck rolls back in", () => {
    const { game, theater, clock } = bootedShop();
    startScavenging(game);
    stepSeconds(game, TRUCK_DEPART_SECONDS + 0.5);

    // Park the trip at its decision, which is what offers the way home.
    const player = game.entities.getSingleton(Player);
    const away = player.away;
    assert.equal(away?.kind, "scavenging");
    if (away?.kind !== "scavenging") return;
    player.away = { ...away, phase: { kind: "deciding" } };

    headHomeFromScavenging(game);
    game.step(1);
    assert.equal(theater.stage(), "arriving");
    const home = clock.tick;
    stepSeconds(game, TRUCK_ARRIVE_SECONDS - 0.5);
    assert.equal(theater.stage(), "arriving");
    assert.equal(clock.tick, home);
    // The shop is back on screen behind the roll, and a machine left
    // cutting would spend the player's time through it — the hold is
    // what keeps the whole roll free.
    assert.equal(game.entities.getSingleton(TimeFlow).speed, "stopped");

    // Parked: the day runs again.
    stepSeconds(game, 1);
    assert.equal(theater.stage(), "parked");
    assert.notEqual(game.entities.getSingleton(TimeFlow).speed, "stopped");
  });
});
