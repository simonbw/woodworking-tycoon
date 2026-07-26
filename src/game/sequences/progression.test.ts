/**
 * Can you get from a new save to the last commission?
 *
 * One test per rung, each reading the checkpoint the one before it produced
 * (see playthrough.ts). The playthrough itself is the strongest assertion
 * here: every rung is played through the real actions, so a rung that can't
 * be reached — because the machine it needs costs more than the ladder has
 * paid by then, or its recipe is behind a skill there are no points for, or
 * its lumber is behind a reputation gate — throws where it breaks.
 *
 * What the tests add on top is the *slack*. Playing through proves a path
 * exists; these check it isn't a tightrope, and that the shape of the curve
 * is still what the design intends.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { COMMISSION_SEQUENCE } from "../commissionSequence";
import { GameState } from "../GameState";
import { MACHINE_TYPES } from "../Machine";
import { LUMBERYARD_MIN_REPUTATION } from "../lumberStock";
import { SKILL_TYPES, SkillId } from "../Skill";
import { checkpointAfter, LEDGER_DEPTH } from "./playthrough";

/** Every rung the ledger can play, paired with the commission it clears. */
const RUNGS = COMMISSION_SEQUENCE.slice(0, LEDGER_DEPTH).map(
  (commission, index) => ({ number: index + 1, commission }),
);

describe("progression", () => {
  it("the ledger covers every authored commission", () => {
    // If a commission is added without a rung to play it, this is the only
    // thing that notices — the rungs below would just stop early.
    assert.equal(
      LEDGER_DEPTH,
      COMMISSION_SEQUENCE.length,
      `The ledger plays ${LEDGER_DEPTH} of ${COMMISSION_SEQUENCE.length} ` +
        `commissions. Add a rung for ` +
        `"${COMMISSION_SEQUENCE[LEDGER_DEPTH]?.name}" in playthrough.ts.`,
    );
  });

  for (const { number, commission } of RUNGS) {
    describe(`${number}. ${commission.name}`, () => {
      it("hands over, and the ladder advances by one", () => {
        const before = checkpointAfter(number - 1);
        const after = checkpointAfter(number);
        assert.equal(
          before.progression.commissionsCompleted,
          number - 1,
          "the previous checkpoint is one rung back",
        );
        assert.equal(after.progression.commissionsCompleted, number);
        // That the goods actually changed hands is `completeCommissionAction`'s
        // own rule — it refuses to advance without them, so the count above is
        // the assertion. Counting leftovers by type can't tell a delivered
        // slat from the offcut that made it.
      });

      it("pays out, and never runs the shop into the red", () => {
        const before = checkpointAfter(number - 1);
        const after = checkpointAfter(number);
        assert.ok(
          after.money >= 0,
          `the shop went to $${after.money.toFixed(2)} clearing ` +
            `"${commission.name}" — the rung costs more than it pays`,
        );
        // Every rung has to leave the shop better off than it found it, or
        // the ladder stops being a ladder.
        assert.ok(
          after.money > before.money,
          `"${commission.name}" ended with $${after.money.toFixed(2)} ` +
            `against $${before.money.toFixed(2)} going in — this rung loses money`,
        );
        assert.equal(
          after.reputation,
          before.reputation + commission.rewardReputation,
          "reputation went up by exactly the reward",
        );
      });

      it("leaves the till able to buy a machine, not just survive", () => {
        const after = checkpointAfter(number);
        // The ladder is meant to keep the shop shopping. Clearing the cheapest
        // machine on the floor is a low bar deliberately — the point is that a
        // rung never leaves the player unable to buy *anything*, which is what
        // a dead end feels like from the inside. The playthrough itself proves
        // the specific machine each rung needs was affordable.
        const cheapest = Math.min(
          ...Object.values(MACHINE_TYPES)
            .map((type) => type.cost)
            .filter((cost) => cost > 0),
        );
        assert.ok(
          after.money >= cheapest,
          `after "${commission.name}" the shop has $${after.money.toFixed(2)}, ` +
            `less than the $${cheapest} of the cheapest machine sold. This ` +
            `rung has left the player unable to buy their way forward.`,
        );
      });
    });
  }

  it("reputation opens the lumberyard before a rung needs it", () => {
    // The hardwood commissions start at 6, and the yard is where hardwood
    // gets affordable. Whichever rung first buys real wood, the yard should
    // already be open to it.
    const atSix = checkpointAfter(6);
    assert.ok(
      atSix.reputation >= LUMBERYARD_MIN_REPUTATION,
      `by the first hardwood commission the shop has ${atSix.reputation} ` +
        `reputation, and the lumberyard opens at ${LUMBERYARD_MIN_REPUTATION}`,
    );
  });

  it("never spends a skill point it hasn't earned", () => {
    // Points come from XP levels; the ladder is meant to fund the tree it
    // requires. A negative balance anywhere means the design has drifted.
    for (let n = 0; n <= LEDGER_DEPTH; n++) {
      const shop = checkpointAfter(n);
      assert.ok(
        shop.progression.skillPoints >= 0,
        `rung ${n} left ${shop.progression.skillPoints} skill points`,
      );
    }
  });

  it("every skill it learns has its prerequisites met", () => {
    const finished = checkpointAfter(LEDGER_DEPTH);
    for (const skillId of finished.progression.unlockedSkills) {
      const requires = SKILL_TYPES[skillId as SkillId]?.requires ?? [];
      for (const prerequisite of requires) {
        assert.ok(
          finished.progression.unlockedSkills.includes(prerequisite),
          `${skillId} is learned without ${prerequisite}`,
        );
      }
    }
  });

  it("finishes the ladder with the skills the finale needs", () => {
    const finished = checkpointAfter(LEDGER_DEPTH);
    // The Butcher's Block is the sum of the tree: a jig, end grain, and oil.
    for (const skillId of ["jigsAndFixtures", "endGrainBoards"] as const) {
      assert.ok(
        finished.progression.unlockedSkills.includes(skillId),
        `the finale needs ${skillId}`,
      );
    }
  });

  it("the curve keeps climbing — money, reputation, and XP all monotone", () => {
    const readings: Array<Pick<GameState, "money" | "reputation">> = [];
    let xp = -1;
    for (let n = 0; n <= LEDGER_DEPTH; n++) {
      const shop = checkpointAfter(n);
      const previous = readings[readings.length - 1];
      if (previous) {
        assert.ok(shop.money > previous.money, `money dipped at rung ${n}`);
        assert.ok(
          shop.reputation > previous.reputation,
          `reputation dipped at rung ${n}`,
        );
      }
      assert.ok(shop.progression.xp > xp, `XP dipped at rung ${n}`);
      xp = shop.progression.xp;
      readings.push({ money: shop.money, reputation: shop.reputation });
    }
  });
});
