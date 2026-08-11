import React from "react";
import { ManualArticleId } from "../../../game/manual";
import { ControlsArticle } from "./ControlsArticle";
import { DustArticle } from "./DustArticle";
import { LumberArticle } from "./LumberArticle";
import { MillingArticle } from "./MillingArticle";
import { SellingArticle } from "./SellingArticle";
import { SheetGoodsArticle } from "./SheetGoodsArticle";
import { ShopLayoutArticle } from "./ShopLayoutArticle";
import { SkillsArticle } from "./SkillsArticle";
import { WelcomeArticle } from "./WelcomeArticle";
import { WorkbenchesArticle } from "./WorkbenchesArticle";

/**
 * Article metadata lives in src/game/manual.ts; the bodies live here.
 * Before writing or editing article prose, read the "Voice & copy
 * rules" section of docs/shop-manual.md.
 */
export const ARTICLE_BODIES: Record<ManualArticleId, React.ComponentType> = {
  welcome: WelcomeArticle,
  controls: ControlsArticle,
  lumber: LumberArticle,
  milling: MillingArticle,
  "sheet-goods": SheetGoodsArticle,
  workbenches: WorkbenchesArticle,
  "shop-layout": ShopLayoutArticle,
  dust: DustArticle,
  selling: SellingArticle,
  skills: SkillsArticle,
};
