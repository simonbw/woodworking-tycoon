import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Default is half the cores, which was right when each worker pegged a
  // core rendering. With the render loop capped (see webServer below) a
  // worker is mostly idle, so more of them pack the suite tighter.
  workers: process.env.CI ? 1 : '80%',
  reporter: 'list',
  
  use: {
    baseURL: 'http://localhost:3002',
    trace: 'on-first-retry',
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
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    // Four deliberate differences from a plain `npm run dev`:
    //
    // E2E_RENDER_FPS caps the shop's render loop (and, in ShopView, shrinks
    // what it rasterizes). Headless Chromium runs rAF flat out with no GPU
    // behind it, and a loop that never yields keeps the main thread busy
    // enough that every Playwright round-trip queues behind a frame — 13ms
    // against 0.8ms, paid on every click and assertion. See ShopView.
    //
    // ES_BUILD_MINIFY/ES_BUILD_SOURCEMAP: every spec opens a fresh page, so
    // the suite fetches and compiles the whole bundle 19 times over. Nobody
    // reads a stack trace out of it, so it ships minified and mapless here —
    // 5.0 MB down to 1.8 MB.
    //
    // ES_BUILD_OUTDIR keeps that capped bundle out of dist/, so a test run
    // can't leave a dev server you have open serving a throttled build.
    //
    // And it runs node directly rather than through npm, because npm does
    // not forward Playwright's SIGTERM: the build script never got to
    // dispose esbuild's service child, which outlived it still holding this
    // port and serving a stale bundle.
    command:
      'E2E_RENDER_FPS=5 ES_BUILD_MINIFY=true ES_BUILD_SOURCEMAP=false ES_BUILD_OUTDIR=dist-e2e ES_BUILD_DEV_PORT=3002 node esbuild-client.config.mjs --dev',
    url: 'http://localhost:3002',
    // Always start our own. Reuse would attach to whatever happens to hold
    // 3002 — including the previous run's server on its way down, which
    // fails the whole suite with ERR_CONNECTION_RESET, and including a
    // hand-started server built without the flags above.
    reuseExistingServer: false,
    timeout: 120 * 1000,
  },
});