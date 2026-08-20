import { ProgressionState, TutorialFacts } from "./GameState";
import { LUMBERYARD_MIN_REPUTATION } from "./lumberStock";
import type { MachineId } from "./Machine";
import { ownedToolIds, ownsMachine, ownsTool } from "./progression-helpers";
import { levelForXp } from "./skill-helpers";

/**
 * The shop manual: the reference binder behind the `?` button. Each article
 * declares the condition that reveals it, mirroring UNLOCK_CONDITIONS —
 * the MilestoneSystem records newly met ones in
 * `ProgressionState.unlockedArticles`, so unlocks are one-way even if the
 * condition later becomes false (e.g. a sold machine). Locked articles are
 * hidden entirely, per the progressive-disclosure rule.
 *
 * Article bodies are React components, registered separately in
 * `src/components/manual/articles/`.
 */

/** Sidebar sections, in render order. */
export type ManualCategory = "Basics" | "The Craft" | "The Shop" | "Business";

export const MANUAL_CATEGORIES: readonly ManualCategory[] = [
  "Basics",
  "The Craft",
  "The Shop",
  "Business",
];

export interface ManualArticleDef {
  readonly id: ManualArticleId;
  readonly title: string;
  /** Short label for the notebook's index tab; the title is the fallback. */
  readonly tab?: string;
  readonly category: ManualCategory;
  /** When the article reveals itself. Checked after every milestone-worthy action. */
  readonly unlocked: (gameState: TutorialFacts) => boolean;
}

/** The starter hammer is mounted from minute one; it teaches nothing. */
function ownsBoughtTool(gameState: TutorialFacts): boolean {
  return ownedToolIds(gameState).some((toolId) => toolId !== "hammer");
}

const defs = [
  {
    id: "welcome",
    tab: "Welcome",
    title: "Welcome to the Shop",
    category: "Basics",
    unlocked: () => true,
  },
  {
    id: "controls",
    tab: "Controls",
    title: "Controls",
    category: "Basics",
    unlocked: () => true,
  },
  {
    id: "lumber",
    tab: "Lumber",
    title: "Reading Lumber Sizes",
    category: "The Craft",
    // The store speaks both notations from minute one.
    unlocked: () => true,
  },
  {
    id: "milling",
    tab: "Milling",
    title: "Milling & Surfaces",
    category: "The Craft",
    // The concept arrives with the first stock that needs truing up — the
    // lumberyard opening its gate — or the first machine/tool that does the
    // truing. Same reputation the yard flag keys off, so they land together;
    // checked directly so pre-flag saves migrate with the article earned.
    unlocked: (gameState: TutorialFacts) =>
      gameState.reputation >= LUMBERYARD_MIN_REPUTATION ||
      ownsMachine(gameState, "jointer") ||
      ownsMachine(gameState, "lunchboxPlaner") ||
      ownsTool(gameState, "handPlane"),
  },
  {
    id: "sheet-goods",
    tab: "Sheets",
    title: "Sheet Goods",
    category: "The Craft",
    // Arrives with the first sheet in the shop, or with the horses that
    // break one down — either way, when there's something to cut.
    unlocked: (gameState: TutorialFacts) =>
      ownsMachine(gameState, "sawhorses") ||
      gameState.player.inventory.some((m) => m.type === "plywood") ||
      gameState.materialPiles.some((pile) => pile.material.type === "plywood"),
  },
  {
    id: "workbenches",
    tab: "Benches",
    title: "Workbenches",
    category: "The Craft",
    // The bench starts teaching when its first extra gear arrives: a bought
    // tool, a clamp, or a bottle of finish.
    unlocked: (gameState: TutorialFacts) =>
      ownsBoughtTool(gameState) ||
      gameState.clamps > 0 ||
      gameState.consumables.mineralOil > 0,
  },
  {
    id: "shop-layout",
    tab: "Layout",
    title: "Moving Machines",
    category: "The Shop",
    // Carrying is never locked; the article arrives with the first machine
    // worth arranging — a crate in the bed or on the floor, or anything
    // bought beyond the starting loadout (bench, garbage can, lumber shelf).
    unlocked: (gameState: TutorialFacts) =>
      gameState.machineCrates.length > 0 ||
      gameState.truck.crates.length > 0 ||
      gameState.player.carriedMachine != null ||
      gameState.machines.some(
        (machine) =>
          machine.machineTypeId !== "workspace" &&
          machine.machineTypeId !== "garbageCan" &&
          machine.machineTypeId !== "lumberShelf",
      ),
  },
  {
    id: "dust",
    tab: "Dust",
    title: "Sawdust & Cleaning",
    category: "The Shop",
    // The first cleaning tool bought, or the floor getting dusty enough
    // that the one-time sweeping note goes up — whichever comes first.
    unlocked: (gameState: TutorialFacts) =>
      gameState.broomOwned ||
      gameState.shopVac !== null ||
      gameState.progression.sweepingUnlocked,
  },
  {
    id: "selling",
    tab: "Selling",
    title: "The For-Sale Stand",
    category: "Business",
    unlocked: () => true,
  },
  {
    id: "skills",
    tab: "Skills",
    title: "Skills & XP",
    category: "Business",
    // The first skill point lands at level 2.
    unlocked: (gameState: TutorialFacts) =>
      levelForXp(gameState.progression.xp) >= 2,
  },
] as const;

export type ManualArticleId = (typeof defs)[number]["id"];

export const MANUAL_ARTICLES: ReadonlyArray<ManualArticleDef> = defs;

export const ALL_ARTICLE_IDS: ReadonlyArray<ManualArticleId> = defs.map(
  (def) => def.id,
);

/** What a brand-new game starts with unlocked (and unread). */
export const STARTING_ARTICLES: ReadonlyArray<ManualArticleId> = [
  "welcome",
  "controls",
  "lumber",
  "selling",
];

/**
 * Inspector deep links: which article explains a machine. Machines not
 * listed here are self-explanatory (benches teach through their recipes).
 */
export const MACHINE_ARTICLES: Partial<Record<MachineId, ManualArticleId>> = {
  jointer: "milling",
  lunchboxPlaner: "milling",
  jobsiteTableSaw: "milling",
  miterSaw: "milling",
  bandSaw: "milling",
};

export function getArticle(id: ManualArticleId): ManualArticleDef {
  const def = MANUAL_ARTICLES.find((article) => article.id === id);
  if (!def) throw new Error(`Unknown manual article: ${id}`);
  return def;
}

/** Articles whose condition is met right now — the migration seed, and the
 * milestone check's candidate list. */
export function articlesUnlockedFor(
  gameState: TutorialFacts,
): ReadonlyArray<ManualArticleId> {
  return MANUAL_ARTICLES.filter((article) => article.unlocked(gameState)).map(
    (article) => article.id,
  );
}

/** Drives the NEW markers and the badge on the `?` button. */
export function hasUnreadArticles(progression: ProgressionState): boolean {
  return progression.unlockedArticles.some(
    (id) => !progression.readArticles.includes(id),
  );
}

export function isArticleRead(
  progression: ProgressionState,
  id: ManualArticleId,
): boolean {
  return progression.readArticles.includes(id);
}
