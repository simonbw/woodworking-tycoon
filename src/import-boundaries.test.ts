import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

/**
 * The sim/view boundary, enforced.
 *
 * Simulation code must run headless (Node tests, the new ShopDriver), so
 * the directories that hold it may not import rendering or UI modules.
 * The new world's sim directories additionally must be deterministic: all
 * randomness flows through `game.random` and all time through the tick,
 * so the ambient nondeterminism globals are banned there.
 *
 * `src/game` (the old world) predates the determinism rule and is being
 * retired system by system, so only the import rule applies to it.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, "..");

/** Directories holding simulation code: no pixi, no react, no DOM libs. */
const SIM_DIRS = ["src/game", "src/sim"];

/** New-world sim directories: additionally no ambient nondeterminism. */
const DETERMINISTIC_DIRS = ["src/sim"];

const BANNED_IMPORT_PATTERN =
  /^\s*import\s[^;]*?from\s+["'](pixi\.js|@pixi\/[^"']*|react|react-dom(\/[^"']*)?)["']/m;

const BANNED_GLOBAL_PATTERN = /\b(Math\.random|Date\.now|performance\.now)\b/;

function sourceFiles(dir: string): string[] {
  const full = path.join(REPO_ROOT, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(child);
    return /\.tsx?$/.test(entry.name) ? [child] : [];
  });
}

const isTestFile = (file: string) => /\.test\.tsx?$/.test(file);

const read = (file: string) =>
  fs.readFileSync(path.join(REPO_ROOT, file), "utf8");

describe("sim/view import boundaries", () => {
  it("keeps rendering and UI imports out of sim directories", () => {
    const offenders = SIM_DIRS.flatMap(sourceFiles).filter((file) =>
      BANNED_IMPORT_PATTERN.test(read(file)),
    );
    assert.deepEqual(offenders, []);
  });

  it("keeps ambient nondeterminism out of new-world sim directories", () => {
    const offenders = DETERMINISTIC_DIRS.flatMap(sourceFiles)
      .filter((file) => !isTestFile(file))
      .filter((file) => BANNED_GLOBAL_PATTERN.test(read(file)));
    assert.deepEqual(offenders, []);
  });

  it("holds the dispatcher and driver to the command surface", () => {
    // The input dispatcher contains no logic — only command calls — and
    // the new ShopDriver mutates the world through the same commands the
    // dispatcher uses. Their imports into src/sim must resolve into the
    // command layer; the driver may additionally read the save plumbing,
    // the bootstrap, and singleton classes for its assertion surface.
    // Neither may lean on the old world's transform layer.
    const RULES: Array<{ dirs: string[]; allowed: RegExp[] }> = [
      {
        dirs: ["src/sim/dispatch"],
        allowed: [/^src\/sim\/commands\//],
      },
      {
        dirs: ["src/sim/driver"],
        allowed: [
          /^src\/sim\/commands\//,
          /^src\/sim\/save\//,
          /^src\/sim\/bootstrap(\.ts)?$/,
          /^src\/sim\/singletons\//,
          /^src\/sim\/entities\//,
          /^src\/sim\/TimeFlow(\.ts)?$/,
        ],
      },
    ];

    const offenders: string[] = [];
    for (const { dirs, allowed } of RULES) {
      for (const file of dirs.flatMap(sourceFiles)) {
        for (const target of importTargets(file)) {
          const inSim = target.startsWith("src/sim/");
          const inOldActions = target.startsWith("src/game/game-actions");
          if (inSim && !allowed.some((pattern) => pattern.test(target))) {
            offenders.push(`${file} → ${target}`);
          }
          if (inOldActions) {
            offenders.push(`${file} → ${target}`);
          }
        }
      }
    }
    assert.deepEqual(offenders, []);
  });
});

/** Repo-relative resolutions of a file's relative imports. */
function importTargets(file: string): string[] {
  const dir = path.dirname(file);
  const targets: string[] = [];
  for (const match of read(file).matchAll(
    /^\s*import\s[^;]*?from\s+["'](\.[^"']*)["']/gm,
  )) {
    const resolved = path
      .normalize(path.join(dir, match[1]))
      .split(path.sep)
      .join("/");
    targets.push(resolved.endsWith(".ts") ? resolved : `${resolved}.ts`);
  }
  return targets;
}
