import assert from "node:assert";
import { describe, it } from "node:test";
import { generateScavengeLoot } from "../../game/game-actions/scavenge-actions";
import { ScavengingTrip } from "../../game/Person";
import { seededRandom } from "../../utils/randUtils";
import {
  buildScavengeLog,
  HEADING_HOME_AT,
  pointAtProgress,
  ROUTE_WAYPOINTS,
  SCAVENGE_STOPS,
} from "./scavenge-route";

function tripWithLoot(loot: ScavengingTrip["loot"]): ScavengingTrip {
  return { kind: "scavenging", returnTick: 1234, loot };
}

describe("SCAVENGE_STOPS", () => {
  it("sits at ascending trip fractions strictly inside the trip", () => {
    let previous = 0;
    for (const stop of SCAVENGE_STOPS) {
      assert.ok(stop.at > previous, `${stop.name} at=${stop.at}`);
      previous = stop.at;
    }
    // The E2E spec fast-forwards to 25 ticks before the return tick
    // (trip fraction ~0.83) and expects the whole log written by then.
    assert.ok(HEADING_HOME_AT < 0.82, `home at=${HEADING_HOME_AT}`);
  });
});

describe("pointAtProgress", () => {
  it("starts and ends the loop at the shop", () => {
    assert.deepStrictEqual(pointAtProgress(0), ROUTE_WAYPOINTS[0]);
    assert.deepStrictEqual(pointAtProgress(1), ROUTE_WAYPOINTS[0]);
    assert.deepStrictEqual(pointAtProgress(-0.5), ROUTE_WAYPOINTS[0]);
    assert.deepStrictEqual(pointAtProgress(1.5), ROUTE_WAYPOINTS[0]);
  });

  it("reaches each stop exactly at its trip fraction", () => {
    for (const stop of SCAVENGE_STOPS) {
      const point = pointAtProgress(stop.at);
      assert.ok(
        Math.hypot(point.x - stop.point.x, point.y - stop.point.y) < 1e-6,
      );
    }
  });
});

describe("buildScavengeLog", () => {
  it("writes one find line per pallet, at distinct stops, in trip order", () => {
    const loot = generateScavengeLoot(seededRandom("two-pallets-please"));
    const trip = tripWithLoot(loot);
    const log = buildScavengeLog(trip);

    const finds = log.filter((entry) => entry.kind === "find");
    assert.strictEqual(finds.length, loot.length);
    assert.strictEqual(
      new Set(finds.map((entry) => entry.stopIndex)).size,
      loot.length,
    );

    let previous = -1;
    for (const entry of log) {
      assert.ok(entry.at >= previous);
      previous = entry.at;
    }
    assert.strictEqual(log[0].kind, "depart");
    assert.strictEqual(log[log.length - 1].kind, "home");
    // depart + one line per stop + home
    assert.strictEqual(log.length, SCAVENGE_STOPS.length + 2);
  });

  it("describes each pallet's actual condition", () => {
    const loot = generateScavengeLoot(seededRandom("condition"));
    const log = buildScavengeLog(tripWithLoot(loot));
    const finds = log.filter((entry) => entry.kind === "find");
    const described = finds.map((entry) => entry.text);
    for (const pallet of loot) {
      assert.ok(pallet.type === "pallet");
      const deckCount = pallet.deckBoards.filter(Boolean).length;
      assert.ok(
        described.some((text) =>
          text.includes(`${deckCount} of 11 deck boards`),
        ),
        `no find line for deck=${deckCount}`,
      );
    }
  });

  it("is deterministic for a given trip", () => {
    const trip = tripWithLoot(generateScavengeLoot(seededRandom("stable")));
    assert.deepStrictEqual(buildScavengeLog(trip), buildScavengeLog(trip));
  });

  it("strikes out gracefully on an empty haul", () => {
    const log = buildScavengeLog(tripWithLoot([]));
    assert.strictEqual(log.filter((entry) => entry.kind === "find").length, 0);
    assert.match(log[log.length - 1].text, /empty-handed/);
  });
});
