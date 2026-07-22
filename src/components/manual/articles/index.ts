import React from "react";
import { ManualArticleId } from "../../../game/manual";
import { ControlsArticle } from "./ControlsArticle";
import { DustArticle } from "./DustArticle";
import { FinishingArticle } from "./FinishingArticle";
import { MarketplaceArticle } from "./MarketplaceArticle";
import { MillingArticle } from "./MillingArticle";
import { ShopLayoutArticle } from "./ShopLayoutArticle";
import { SkillsArticle } from "./SkillsArticle";
import { ToolsArticle } from "./ToolsArticle";
import { WelcomeArticle } from "./WelcomeArticle";

/**
 * Article metadata lives in src/game/manual.ts; the bodies live here.
 * Before writing or editing article prose, read the "Voice & copy
 * rules" section of docs/shop-manual.md.
 */
export const ARTICLE_BODIES: Record<ManualArticleId, React.ComponentType> = {
  welcome: WelcomeArticle,
  controls: ControlsArticle,
  milling: MillingArticle,
  finishing: FinishingArticle,
  tools: ToolsArticle,
  "shop-layout": ShopLayoutArticle,
  dust: DustArticle,
  marketplace: MarketplaceArticle,
  skills: SkillsArticle,
};
