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
  // One at a time. Every Playwright action against this game waits for a
  // frame, and headless Chromium draws the shop without a GPU: two specs
  // at once halve each other's frame rate, which turns each action's wait
  // into a stall and pushes the fat specs past budgets that are generous
  // when they run alone. Serial is slower on the wall clock and much
  // steadier — and the specs are what a change is judged by.
  workers: 1,
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
    // E2E_RENDER_FPS caps the shop's render loop (and, in ShopView, shrinks
    // what it rasterizes). Headless Chromium runs rAF flat out with no GPU
    // behind it, and a loop that never yields keeps the main thread busy
    // enough that every Playwright round-trip queues behind a frame — 13ms
    // against 0.8ms, paid on every click and assertion. Ten is the floor:
    // below it the motion layer's delta clamp slows walking down. See ShopView.
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
    command: `E2E_RENDER_FPS=10 ES_BUILD_MINIFY=true ES_BUILD_SOURCEMAP=false ES_BUILD_OUTDIR=${e2eBuildDir} ES_BUILD_DEV_PORT=${port} node esbuild-client.config.mjs --dev`,
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
