import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { TEXTURE_ASSETS } from "./loadAssets";
import { IDS_WITHOUT_ICON_ART, UI_IMAGE_ASSETS } from "./uiImages";

/**
 * The preload list is only worth anything while it matches what the game
 * actually draws. These checks walk the two directions it can drift: a
 * path that no longer resolves to a file, and a file the UI asks for that
 * nobody registered.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const STATIC_DIR = path.join(REPO_ROOT, "static");
const SRC_DIR = path.join(REPO_ROOT, "src");

const exists = (assetPath: string) =>
  fs.existsSync(path.join(STATIC_DIR, assetPath));

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
      ? [full]
      : [];
  });
}

describe("UI image preloading", () => {
  it("preloads only images that exist", () => {
    const missing = UI_IMAGE_ASSETS.filter((src) => !exists(src));
    assert.deepEqual(missing, []);
  });

  it("keeps the shop-floor textures pointing at real files too", () => {
    const missing = TEXTURE_ASSETS.filter((src) => !exists(src));
    assert.deepEqual(missing, []);
  });

  it("lists every icon id that still has no art", () => {
    // The moment one of these gets drawn, delete its entry so it starts
    // being preloaded with the rest.
    const drawn = [
      ...IDS_WITHOUT_ICON_ART.tools.map((id) => `tool-${id}`),
      ...IDS_WITHOUT_ICON_ART.consumables.map((id) => `consumable-${id}`),
      ...IDS_WITHOUT_ICON_ART.upgrades.map((id) => `upgrade-${id}`),
    ].filter((name) => exists(`/images/icons/${name}.png`));
    assert.deepEqual(drawn, []);
  });

  it("registers every image path the source asks for by name", () => {
    const registered = new Set([...UI_IMAGE_ASSETS, ...TEXTURE_ASSETS]);
    const unregistered = new Set<string>();

    for (const file of sourceFiles(SRC_DIR)) {
      const contents = fs.readFileSync(file, "utf8");
      for (const [match] of contents.matchAll(/\/images\/[\w./-]+\.\w+/g)) {
        if (!registered.has(match)) unregistered.add(`${match} (${file})`);
      }
    }

    assert.deepEqual([...unregistered], []);
  });
});
