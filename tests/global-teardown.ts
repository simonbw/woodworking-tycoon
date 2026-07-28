import fs from 'node:fs';
import path from 'node:path';
import { e2eBuildDir, outputDir } from '../playwright.config';

/** The one file Playwright leaves in an output directory when nothing failed. */
const RUN_MARKER = '.last-run.json';

/**
 * Take this run's scratch directories with us.
 *
 * Each run builds into its own `dist-e2e/<port>` and traces into its own
 * `test-results/<port>`, because Playwright empties the whole output
 * directory before the first test — two runs sharing one would mean the
 * second wiping the first's traces mid-flight. Per-run directories are the
 * price of running two suites at once, and clearing them up is this file.
 *
 * The bundle is garbage the moment the suite finishes. An output directory
 * is only garbage if nothing failed: a failed test leaves a directory of
 * artifacts next to the marker, and those are worth keeping until someone
 * has read them.
 *
 * The sweep covers *every* finished run's directory, not just ours, because
 * Playwright writes its marker after global teardown has already run — our
 * own directory reappears the moment we delete it, and can only be collected
 * by whoever runs next. A run still in flight has either no marker yet or
 * artifacts beside it, so neither shape is ours to touch.
 *
 * A run killed with Ctrl-C leaves its bundle behind; the next run's sweep
 * won't take it, since a directory with no marker is one we can't tell from
 * a live one. `rm -rf dist-e2e test-results` is always safe between runs.
 */
export default function globalTeardown() {
  fs.rmSync(e2eBuildDir, { recursive: true, force: true });

  const runsDir = path.dirname(outputDir);
  for (const entry of readDir(runsDir)) {
    const dir = path.join(runsDir, entry);
    const contents = readDir(dir);
    if (contents.length == 1 && contents[0] == RUN_MARKER) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  for (const parent of [path.dirname(e2eBuildDir), runsDir]) {
    try {
      fs.rmdirSync(parent);
    } catch {
      // Not empty (another run is going, or there are failures to read) or
      // already gone. Every one of those is fine.
    }
  }
}

function readDir(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}
