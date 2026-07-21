import { hasCompletedCommission } from "./commissionSequence";
import { GameState, ProgressionState } from "./GameState";
import { unlockedLumberChannels } from "./lumberStock";
import { ownsMachine, ownsTool } from "./progression-helpers";
import { levelForXp } from "./skill-helpers";
import { ToolId } from "./Tool";

/**
 * The shop manual: the reference binder behind the `?` button. Each article
 * declares the condition that reveals it, mirroring UNLOCK_CONDITIONS —
 * checkProgressionMilestonesAction records newly met ones in
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
  readonly category: ManualCategory;
  /** When the article reveals itself. Checked after every milestone-worthy action. */
  readonly unlocked: (gameState: GameState) => boolean;
}

/** The starter hammer is mounted from minute one; it teaches nothing. */
function ownsBoughtTool(gameState: GameState): boolean {
  const counts = (toolId: ToolId) => toolId !== "hammer";
  return (
    gameState.storage.tools.some(counts) ||
    gameState.machines.some((machine) => machine.tools.some(counts)) ||
    gameState.machineCrates.some((crate) => crate.machine.tools.some(counts)) ||
    (gameState.player.carriedMachine?.tools.some(counts) ?? false)
  );
}

const defs = [
  {
    id: "welcome",
    title: "Welcome to the Shop",
    category: "Basics",
    unlocked: () => true,
  },
  {
    id: "controls",
    title: "Controls",
    category: "Basics",
    unlocked: () => true,
  },
  {
    id: "milling",
    title: "Milling & Surfaces",
    category: "The Craft",
    // The concept arrives with the first stock that needs truing up — a
    // non-S4S lumber channel — or the first machine/tool that does the truing.
    unlocked: (gameState: GameState) =>
      unlockedLumberChannels(gameState.reputation).some(
        (channel) => channel.jointedFaces < 2 || channel.jointedEdges < 2,
      ) ||
      ownsMachine(gameState, "jointer") ||
      ownsMachine(gameState, "lunchboxPlaner") ||
      ownsTool(gameState, "handPlane"),
  },
  {
    id: "finishing",
    title: "Finishing",
    category: "The Craft",
    // First bottle of finish, or the commission that first demands a
    // finished piece (the cutting boards, right after Double Shelf Order).
    unlocked: (gameState: GameState) =>
      gameState.consumables.mineralOil > 0 ||
      hasCompletedCommission(gameState.progression, "double-shelf-order"),
  },
  {
    id: "tools",
    title: "Tools & Tool Slots",
    category: "The Craft",
    unlocked: ownsBoughtTool,
  },
  {
    id: "shop-layout",
    title: "Moving Machines",
    category: "The Shop",
    unlocked: (gameState: GameState) =>
      gameState.progression.shopLayoutUnlocked,
  },
  {
    id: "dust",
    title: "Sawdust & Cleaning",
    category: "The Shop",
    unlocked: (gameState: GameState) => gameState.progression.sweepingUnlocked,
  },
  {
    id: "marketplace",
    title: "Marketplace & Jobs",
    category: "Business",
    unlocked: (gameState: GameState) =>
      gameState.progression.marketplaceUnlocked,
  },
  {
    id: "skills",
    title: "Skills & XP",
    category: "Business",
    // The first skill point lands at level 2.
    unlocked: (gameState: GameState) =>
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
];

export function getArticle(id: ManualArticleId): ManualArticleDef {
  const def = MANUAL_ARTICLES.find((article) => article.id === id);
  if (!def) throw new Error(`Unknown manual article: ${id}`);
  return def;
}

/** Articles whose condition is met right now — the migration seed, and the
 * milestone check's candidate list. */
export function articlesUnlockedFor(
  gameState: GameState,
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
