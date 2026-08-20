import { defineConfig, devices } from "@playwright/test";
import { execFileSync } from "node:child_process";

// Every run gets its own port, so two `npm run test`s in two terminals don't
// fight over one. Node has no synchronous way to ask for a free port, and this
// file is loaded as CJS (no "type": "module" in package.json), so there is no
// top-level await to reach for either — hence a child process that binds port
// 0, prints what the OS handed it, and lets go. It binds the wildcard address
// because that is what esbuild's serve defaults to; probing 127.0.0.1 would
// miss a conflicting wildcard bind on another interface. There is a window
// between the child letting go and esbuild binding, but nothing else on the
// machine is handing out ephemeral ports in that millisecond.
function allocateFreePort(): string {
  return execFileSync(
    process.execPath,
    [
      "-e",
      // String(), not the number: under FORCE_COLOR (set in some shells)
      // console.log colorizes numbers even into a pipe, and the ANSI codes
      // would ride along into Number() below and come out NaN.
      "const s = require('net').createServer();" +
        "s.listen(0, () => { console.log(String(s.address().port)); s.close() })",
    ],
    { encoding: "utf8" },
  ).trim();
}

// Assigned back into the environment rather than kept in a module local,
// because Playwright re-imports this config in every worker process. Workers
// are forked after the runner has read the config, so they inherit the port
// the runner picked; without this each worker would allocate its own and hold
// a different baseURL than the server that is actually running.
//
// Setting it by hand (`E2E_PORT=3002 npm run test:e2e`) pins the port, which
// is what you want when you need to open the suite's build in your own
// browser — a random port is not something you can type ahead of time.
if (!process.env.E2E_PORT) {
  process.env.E2E_PORT = allocateFreePort();
}
const port = Number(process.env.E2E_PORT);
const baseURL = `http://localhost:${port}`;

// The bundle and the traces are per-run too. Two runs sharing dist-e2e/ meant
// one server serving a file the other was halfway through overwriting, and
// two runs sharing test-results/ meant the second one wiping the first one's
// traces on startup — Playwright clears outputDir before the first test.
export const outputDir = `test-results/${port}`;
export const e2eBuildDir = `dist-e2e/${port}`;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Parallel since the render fix (see E2E_RENDER_FPS below): with the
  // canvas rasterizing at 0.25 resolution, headless browsers no longer
  // saturate a core each, and specs running together cost each other
  // ~1.5-2x instead of stalling — a wall-clock win worth the contention.
  // The count is capped rather than unbounded so the slowest spec isn't
  // running against six neighbors at once.
  workers: 4,
  reporter: "list",
  outputDir,
  globalTeardown: "./tests/global-teardown.ts",

  use: {
    baseURL,
    trace: "on-first-retry",
    // The specs drive surfaces, not choreography: with reduced motion
    // emulated, presentation-only transitions (the bench view's camera
    // lean-in honors it) resolve instantly instead of making every spec
    // wait out — or worse, race — an animation.
    contextOptions: { reducedMotion: "reduce" },
    // Escape hatch for environments with a preinstalled browser instead of
    // the exact build this Playwright version would download.
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? {
          launchOptions: {
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
          },
        }
      : {}),
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    // Four deliberate differences from a plain `npm run dev`:
    //
    // E2E_RENDER_FPS marks the build as a test build and caps the raster
    // rate. Headless Chromium draws in software (no GPU), so a full-res
    // frame costs ~250ms and every Playwright round-trip queues behind
    // it; the test build instead rasterizes at 0.25 resolution (see
    // engine-main.ts — nothing in the specs reads pixels) and dispatches
    // the render events every frame so views and the DOM overlays stay
    // fresh (see Game.loop). At low resolution drawing is cheap, and
    // *some* drawing is required: a page that never commits a frame gets
    // its rAF throttled by Chromium and the whole game loop crawls.
    // Measured on bench.spec: 60fps/0.25res 35s, vs 231s for the old
    // full-res 10fps cap, vs 4.3m rastering never. Thirty is the default
    // because under parallel workers the halved draw load shortens the
    // whole suite's wall (59s vs 72s at sixty, measured).
    //
    // ES_BUILD_MINIFY/ES_BUILD_SOURCEMAP: every spec opens a fresh page, so
    // the suite fetches and compiles the whole bundle 19 times over. Nobody
    // reads a stack trace out of it, so it ships minified and mapless here —
    // 5.0 MB down to 1.8 MB.
    //
    // ES_BUILD_OUTDIR keeps that capped bundle out of dist/, so a test run
    // can't leave a dev server you have open serving a throttled build, and
    // out of every other run's way. Nothing is cached between runs, so a
    // fresh directory each time costs nothing; global teardown removes it.
    //
    // And it runs node directly rather than through npm, because npm does
    // not forward Playwright's SIGTERM: the build script never got to
    // dispose esbuild's service child, which outlived it still holding this
    // port and serving a stale bundle.
    command: `E2E_RENDER_FPS=${process.env.E2E_RENDER_FPS ?? 30} ES_BUILD_MINIFY=true ES_BUILD_SOURCEMAP=false ES_BUILD_OUTDIR=${e2eBuildDir} ES_BUILD_DEV_PORT=${port} node esbuild-client.config.mjs --dev`,
    url: baseURL,
    // Always start our own. A freshly allocated port has nothing to reuse,
    // but E2E_PORT can pin one — and reuse would then attach to whatever
    // happens to hold it, including the previous run's server on its way
    // down (which fails the whole suite with ERR_CONNECTION_RESET) and a
    // hand-started server built without the flags above.
    reuseExistingServer: false,
    timeout: 120 * 1000,
  },
});
