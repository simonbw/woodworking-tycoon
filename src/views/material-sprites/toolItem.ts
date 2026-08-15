import { Container, Graphics, Sprite, Texture } from "pixi.js";
import { PIXELS_PER_CELL } from "../../components/shop-view/shop-scale";
import { ToolItem } from "../../game/Materials";
import { IDS_WITHOUT_ICON_ART, toolIconSrc } from "../../utils/uiImages";

/** A hand tool lying on the floor — well inside its cell, like a pile. */
const TOOL_SPRITE_SIZE = PIXELS_PER_CELL * 0.55;

/** The stand-in square for anything without its own drawing. */
export function drawDefaultPile(g: Graphics): void {
  g.clear();
  g.rect(-10, -10, 20, 20);
  g.fill(0);
}

/**
 * A tool as a physical object in the world: the same pixel-art icon the
 * tool wall and racks use, so the thing in the bed is the thing on the
 * shelf. Tools whose icon hasn't been drawn yet fall back to the default
 * pile square (see docs/asset-backlog.md). The old ToolItemSprite as an
 * imperative builder; the icon textures are preloaded by loadAssets.
 */
export function createToolItemSprite(
  tool: ToolItem,
  options: { alpha?: number; tint?: number } = {},
): Container {
  const { alpha, tint } = options;
  if (IDS_WITHOUT_ICON_ART.tools.includes(tool.toolId)) {
    const g = new Graphics();
    drawDefaultPile(g);
    if (alpha !== undefined) g.alpha = alpha;
    if (tint !== undefined) g.tint = tint;
    return g;
  }
  const sprite = new Sprite(Texture.from(toolIconSrc(tool.toolId)));
  sprite.anchor.set(0.5);
  sprite.width = TOOL_SPRITE_SIZE;
  sprite.height = TOOL_SPRITE_SIZE;
  if (alpha !== undefined) sprite.alpha = alpha;
  if (tint !== undefined) sprite.tint = tint;
  return sprite;
}
