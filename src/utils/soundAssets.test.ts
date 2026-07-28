import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  SOUND_ASSET_FILES,
  SOUND_CLIPS,
  SOUND_FILES_NOT_PRELOADED,
} from "./soundAssets";

/**
 * The sibling of `uiImages.test.ts`, for the ears. The manifest is only
 * worth anything while it matches what ships: these checks walk the ways
 * it can drift — a clip whose file is gone, a shipped file registered
 * nowhere, an "unused" entry that some code has started playing, and a
 * manifest entry no code plays anymore.
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

describe("sound preloading", () => {
  it("preloads only files that exist", () => {
    const missing = SOUND_ASSET_FILES.filter((file) => !exists(file));
    assert.deepEqual(missing, []);
  });

  it("accounts for every file that ships in static/sounds", () => {
    const registered = new Set([
      ...SOUND_ASSET_FILES,
      ...SOUND_FILES_NOT_PRELOADED,
    ]);
    const shipped = fs
      .readdirSync(path.join(STATIC_DIR, "sounds"))
      .filter((name) => !name.startsWith("."))
      .map((name) => `/sounds/${name}`);
    const unaccounted = shipped.filter((file) => !registered.has(file));
    assert.deepEqual(unaccounted, []);
  });

  it("keeps the not-preloaded list pointing at real, unregistered files", () => {
    // An entry whose file was deleted is stale; one that also appears in
    // the manifest is contradicting it.
    const gone = SOUND_FILES_NOT_PRELOADED.filter((file) => !exists(file));
    assert.deepEqual(gone, []);
    const preloaded = new Set(SOUND_ASSET_FILES);
    const contradicted = SOUND_FILES_NOT_PRELOADED.filter((file) =>
      preloaded.has(file),
    );
    assert.deepEqual(contradicted, []);
  });

  it("only preloads clips some source file still names", () => {
    // A clip name nobody mentions anymore is a new orphan: move its file
    // to SOUND_FILES_NOT_PRELOADED (or delete it) rather than keep warming
    // it. Names are matched as whole quoted strings so "ui-click" doesn't
    // satisfy "ui-click-end".
    const sources = sourceFiles(SRC_DIR)
      .filter((file) => !file.endsWith(`utils${path.sep}soundAssets.ts`))
      .map((file) => fs.readFileSync(file, "utf8"));
    const unplayed = SOUND_CLIPS.filter(
      (name) => !sources.some((code) => code.includes(`"${name}"`)),
    );
    assert.deepEqual(unplayed, []);
  });
});
