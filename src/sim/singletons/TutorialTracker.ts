import { z } from "zod";
import { Persistence } from "../../config/constants";
import { BaseEntity } from "../../core/entity/BaseEntity";
import { Entity } from "../../core/entity/Entity";
import {
  TUTORIAL_TRACK_IDS,
  TutorialTrackId,
  TutorialTrackProgress,
} from "../../game/GameState";
import {
  registerSerializable,
  SerializableEntity,
} from "../save/serialization";

/**
 * The tutorial tracks' ratchets: each track's walk index (moved forward
 * by the milestone pass, never backward) and its skip flag. The track
 * ids and progress shape are shared with the old world.
 */

const trackProgressSchema = z.object({
  step: z.number().int(),
  dismissed: z.boolean(),
});

const schema = z.object({
  tutorials: z.object({
    opening: trackProgressSchema,
    dust: trackProgressSchema,
  }),
});

type TutorialData = z.infer<typeof schema>;

const FRESH_TRACK: TutorialTrackProgress = { step: 0, dismissed: false };

export class TutorialTracker
  extends BaseEntity
  implements Entity, SerializableEntity
{
  readonly saveType = "tutorialTracker";
  id = "tutorialTracker";
  persistenceLevel: number = Persistence.Game;

  tutorials: Record<TutorialTrackId, TutorialTrackProgress>;

  constructor(data: Partial<TutorialData> = {}) {
    super();
    this.tutorials = Object.fromEntries(
      TUTORIAL_TRACK_IDS.map((trackId) => [
        trackId,
        { ...(data.tutorials?.[trackId] ?? FRESH_TRACK) },
      ]),
    ) as Record<TutorialTrackId, TutorialTrackProgress>;
  }

  toJSON(): TutorialData {
    return {
      tutorials: {
        opening: { ...this.tutorials.opening },
        dust: { ...this.tutorials.dust },
      },
    };
  }
}

registerSerializable({
  type: "tutorialTracker",
  singleton: true,
  schema,
  fromJSON: (data) => new TutorialTracker(data),
});
