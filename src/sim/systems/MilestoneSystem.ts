import { Persistence } from "../../config/constants";
import { TickLayerName } from "../../config/tickLayers";
import { BaseEntity } from "../../core/entity/BaseEntity";
import { Entity } from "../../core/entity/Entity";
import { on } from "../../core/entity/handler";
import { MANUAL_ARTICLES } from "../../game/manual";
import { UNLOCK_CONDITIONS } from "../../game/progression-helpers";
import { advanceTutorials } from "../../game/tutorial";
import { projectGameState } from "../projection";
import { Progression } from "../singletons/Progression";
import { TutorialTracker } from "../singletons/TutorialTracker";
import { TimeFlow } from "../TimeFlow";

/**
 * The milestone pass — the old `checkProgressionMilestonesAction`,
 * rehosted on the "milestones" layer so it sees the finished tick.
 * Applies any unlock whose condition is now met (UNLOCK_CONDITIONS:
 * store on the first sale, lumberyard on reputation, sweeping on a dusty
 * floor), records newly met manual articles, and walks the tutorial
 * tracks' ratchets forward over everything the shop already satisfies.
 * All the conditions stay in the shared registries; this system only
 * evaluates them against the projection and writes the results onto the
 * singletons.
 *
 * Cadence: the old world ran the action twice — as the last pass of
 * every tickAction (per sim minute) and on a real-time interval from the
 * Ticker, so unlocks answered player actions even while the clock crept.
 * Here the minute loop keeps tick parity, and the unconditional pass at
 * 60 engine ticks a second is the real-time cadence. The pass writes
 * nothing when nothing is newly met — the old action's short-circuit.
 *
 * Transient — never serialized; added per session by the bootstrap.
 */
export class MilestoneSystem extends BaseEntity implements Entity {
  id = "milestoneSystem";
  tickLayer: TickLayerName = "milestones";
  persistenceLevel: number = Persistence.Permanent;

  @on("tick")
  onTick() {
    const timeFlow = this.game.entities.tryGetSingleton(TimeFlow);
    const minutes = timeFlow?.wholeTicks ?? 0;
    for (let i = 0; i < minutes; i++) {
      this.pass();
    }
    this.pass();
  }

  /** One milestone pass over the world as it stands right now. */
  pass(): void {
    const progression = this.game.entities.tryGetSingleton(Progression);
    const tracker = this.game.entities.tryGetSingleton(TutorialTracker);
    if (!progression || !tracker) {
      return;
    }

    let gameState = projectGameState(this.game);

    let flagsChanged = false;
    for (const [flag, conditionMet] of Object.entries(UNLOCK_CONDITIONS)) {
      const key = flag as keyof typeof UNLOCK_CONDITIONS;
      if (!progression[key] && conditionMet(gameState)) {
        progression[key] = true;
        flagsChanged = true;
      }
    }

    // Manual articles unlock off the post-flag state, so an article gated
    // on a flag that flipped this very pass (e.g. sweeping) appears
    // immediately.
    if (flagsChanged) {
      gameState = projectGameState(this.game);
    }
    const newArticles = MANUAL_ARTICLES.filter(
      (article) =>
        !progression.unlockedArticles.includes(article.id) &&
        article.unlocked(gameState),
    ).map((article) => article.id);
    if (newArticles.length > 0) {
      progression.unlockedArticles = [
        ...progression.unlockedArticles,
        ...newArticles,
      ];
      gameState = projectGameState(this.game);
    }

    // The coach walks forward over everything the shop already satisfies.
    // This pass runs every tick, so no command has to know it exists.
    const tutorials = advanceTutorials(gameState);
    if (tutorials !== gameState.progression.tutorials) {
      tracker.tutorials = { ...tutorials };
    }
  }
}
