import { z } from "zod";
import { Persistence } from "../../config/constants";
import { BaseEntity } from "../../core/entity/BaseEntity";
import { Entity } from "../../core/entity/Entity";
import { ManualArticleId, STARTING_ARTICLES } from "../../game/manual";
import { SKILL_IDS, SkillId, STARTER_SKILLS } from "../../game/Skill";
import {
  registerSerializable,
  SerializableEntity,
} from "../save/serialization";

/**
 * The persistent unlock ledger: one-way flags, lifetime counters, and the
 * skill economy. This is the old `ProgressionState` minus the tutorial
 * tracks, which have their own singleton (TutorialTracker) in the new
 * world. Article and skill ids come from the shared registries.
 */

const articleIdSchema = z.string() as z.ZodType<ManualArticleId>;
const skillIdSchema = z.enum(SKILL_IDS as unknown as [SkillId, ...SkillId[]]);

const schema = z.object({
  storeUnlocked: z.boolean(),
  lumberyardUnlocked: z.boolean(),
  salesCompleted: z.number().int(),
  sweepingUnlocked: z.boolean(),
  unlockedArticles: z.array(articleIdSchema),
  readArticles: z.array(articleIdSchema),
  xp: z.number(),
  skillPoints: z.number().int(),
  unlockedSkills: z.array(skillIdSchema),
});

type ProgressionData = z.infer<typeof schema>;

export class Progression
  extends BaseEntity
  implements Entity, SerializableEntity
{
  readonly saveType = "progression";
  id = "progression";
  persistenceLevel: number = Persistence.Game;

  storeUnlocked: boolean;
  lumberyardUnlocked: boolean;
  salesCompleted: number;
  sweepingUnlocked: boolean;
  unlockedArticles: ManualArticleId[];
  readArticles: ManualArticleId[];
  xp: number;
  skillPoints: number;
  unlockedSkills: SkillId[];

  constructor(data: Partial<ProgressionData> = {}) {
    super();
    this.storeUnlocked = data.storeUnlocked ?? false;
    this.lumberyardUnlocked = data.lumberyardUnlocked ?? false;
    this.salesCompleted = data.salesCompleted ?? 0;
    this.sweepingUnlocked = data.sweepingUnlocked ?? false;
    this.unlockedArticles = [...(data.unlockedArticles ?? STARTING_ARTICLES)];
    this.readArticles = [...(data.readArticles ?? [])];
    this.xp = data.xp ?? 0;
    this.skillPoints = data.skillPoints ?? 0;
    this.unlockedSkills = [...(data.unlockedSkills ?? STARTER_SKILLS)];
  }

  toJSON(): ProgressionData {
    return {
      storeUnlocked: this.storeUnlocked,
      lumberyardUnlocked: this.lumberyardUnlocked,
      salesCompleted: this.salesCompleted,
      sweepingUnlocked: this.sweepingUnlocked,
      unlockedArticles: [...this.unlockedArticles],
      readArticles: [...this.readArticles],
      xp: this.xp,
      skillPoints: this.skillPoints,
      unlockedSkills: [...this.unlockedSkills],
    };
  }
}

registerSerializable({
  type: "progression",
  singleton: true,
  schema,
  fromJSON: (data) => new Progression(data),
});
