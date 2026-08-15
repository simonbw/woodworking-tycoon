import { Game } from "../../core/Game";
import { canLeaveShop } from "../../game/game-actions/door-actions";
import { NIGHT_TICKS } from "../../game/time";
import { Player } from "../entities/Player";
import { projectGameState } from "../projection";
import { Clock } from "../singletons/Clock";
import { SleepSystem } from "../systems/SleepSystem";

/**
 * The day cycle's command surface: driving home for the night and waking
 * up the next morning, ported from the old `door-actions.ts`
 * (`goHomeAction` / `wakeUpAction`). Refusals log and return false,
 * matching the old actions' quiet-refusal contract.
 *
 * Waking is the one command that can't finish inside the call: the old
 * wakeUpAction ran the whole overnight as NIGHT_TICKS sequential
 * tickActions, and in the new world sim minutes only pass through engine
 * ticks — which a command must never drive. So `beginWakeUp` validates
 * and queues the overnight on the SleepSystem, and the caller steps the
 * engine until the player is back beside the cab (see SleepSystem's
 * header for the mechanism, and ShopDriver.sleep for the loop).
 */

/**
 * Call it a day: drive home for the night. The day ends here — the
 * overnight itself runs when the morning comes, via beginWakeUp. Always
 * on offer; sleeping early just leaves the rest of the day unspent.
 * Leaving happens at the truck's cab, and not with a machine over the
 * shoulders (the old canLeaveShop, shared).
 */
export function goHome(game: Game): boolean {
  const gameState = projectGameState(game);
  if (!canLeaveShop(gameState)) {
    console.warn("Can't leave the shop right now");
    return false;
  }
  game.entities.getSingleton(Player).away = { kind: "home" };
  return true;
}

/**
 * Morning: turn the day over and queue the overnight batch. The night's
 * minutes then run through the ordinary tick pipeline — glue cures
 * finish, the street stays empty (nobody shops at night) — as the caller
 * steps the engine; when they're spent the SleepSystem pulls the truck
 * back in (player beside the cab, away cleared, fresh dayStartTick).
 * Attended work holds where it was left, same as stepping away from a
 * cut does — the player is away for every overnight minute.
 */
export function beginWakeUp(game: Game): boolean {
  const player = game.entities.getSingleton(Player);
  if (player.away?.kind !== "home") {
    console.warn("Player is not home in bed");
    return false;
  }
  const sleepSystem = game.entities.getSingleton(SleepSystem);
  if (sleepSystem.overnightPending) {
    console.warn("The overnight is already running");
    return false;
  }
  // The day turns over before the night runs — the old wakeUpAction's
  // order.
  game.entities.getSingleton(Clock).day += 1;
  sleepSystem.begin(NIGHT_TICKS);
  return true;
}
