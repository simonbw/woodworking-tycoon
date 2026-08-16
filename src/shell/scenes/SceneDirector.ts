import { Persistence } from "../../config/constants";
import { BaseEntity } from "../../core/entity/BaseEntity";
import { Entity } from "../../core/entity/Entity";
import { on } from "../../core/entity/handler";
import { EnvironmentView } from "../../views/EnvironmentView";
import { ShellStore } from "../ShellStore";
import { StoreSceneRoot } from "./StoreSceneRoot";
import { TripTheater } from "./TripTheater";
import {
  chargeDriveHome,
  completeDriveHome,
  currentVenue,
  driveMinutesPending,
  respawnSimViews,
  spawnShopScenery,
  teardownWorldViews,
  Venue,
} from "./venue";

/**
 * One scene at a time (migration phase 6): the sim world never swaps,
 * but what the canvas draws does — the shop's scenery plus the sim
 * entities' registry views at home, the StoreSceneRoot's own tree at
 * the walkable Orange Box. This entity watches the venue each frame
 * and rebuilds the view side when it changes, and also after anything
 * else strips the views (a save load's `clearScene`, which takes the
 * Level-persistence scenery with it) — "does the world need drawing"
 * is one cheap probe, not a web of callbacks.
 *
 * It also owns the deferred half of the drive home: the store's cab
 * charges the drive's minutes, and the trip completes only after
 * they've been served (the old returnFromStoreAction ran its ticks
 * before clearing `away`; commands never advance the sim, so the
 * ordering is preserved by waiting).
 *
 * The departure holds the swap: while the truck is still rolling down
 * the driveway the shop stays on screen (TripTheater), and the
 * destination arrives with the black. Coming home the screen is already
 * black, so the swap happens the moment `away` clears.
 */
export class SceneDirector extends BaseEntity implements Entity {
  id = "sceneDirector";
  persistenceLevel: number = Persistence.Permanent;
  pausable = false;

  private drawnVenue: Venue | null = null;
  private returnPending = false;

  /** The store cab's way home: charge the drive, finish when served. */
  requestDriveHome(): void {
    if (this.returnPending) return;
    if (chargeDriveHome(this.game)) {
      this.returnPending = true;
    }
  }

  @on("afterTick")
  onAfterTick() {
    const game = this.game;

    if (this.returnPending && !driveMinutesPending(game)) {
      this.returnPending = false;
      completeDriveHome(game);
      // The venue check below sees the shop and rebuilds this frame.
    }

    if (!game.renderer) return;
    // The truck is still on the lot until the theater says it's gone.
    if (game.entities.tryGetSingleton(TripTheater)?.stage() === "departing") {
      return;
    }
    const venue = currentVenue(game);
    // "Does the world need drawing" is one probe per venue: a save
    // load's clearScene strips the Level-persistence scenery either way.
    const sceneMissing =
      venue === "shop"
        ? game.entities.byConstructor(EnvironmentView).size === 0
        : game.entities.byConstructor(StoreSceneRoot).size === 0;
    if (venue === this.drawnVenue && !sceneMissing) return;

    teardownWorldViews(game);
    if (venue === "shop") {
      spawnShopScenery(game);
      respawnSimViews(game);
    } else {
      game.addEntity(new StoreSceneRoot());
    }
    this.drawnVenue = venue;
    // The DOM layer re-reads reach/targeting against the new venue.
    game.entities.tryGetSingleton(ShellStore)?.bump();
  }
}
