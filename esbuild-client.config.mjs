import dotenv from "dotenv";
dotenv.config();

import autoprefixer from "autoprefixer";
import esbuild from "esbuild";
import postcssPlugin from "esbuild-style-plugin";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import postcssImport from "postcss-import";
import tailwind from "tailwindcss";

const isDev = process.argv.some((arg) => arg == "--dev");

// Other argv is ignored on purpose. An agent's throwaway verify server passes
// `--verify-server` (see .claude/skills/verify) purely so its command line
// differs from yours: `pkill -f "esbuild-client.config.mjs --dev"` matches
// every dev server on the machine, and the one it kills is usually the one
// you've had open all day. Don't "clean up" the unrecognized flag.

// Where the bundle lands and what the dev server serves. The E2E server
// overrides this so a test run and a `npm run dev` you have open can't
// overwrite each other's output — they build the same sources with
// different flags (see E2E_RENDER_FPS below).
const outdir = process.env.ES_BUILD_OUTDIR || "dist";

// A dev build is unminified with a full source map, which is what you want
// when you're the one reading the stack trace. The E2E server isn't: nobody
// steps through that bundle, and every spec pays for it, because each test
// opens a fresh page that fetches and compiles the whole thing. Turning
// both off there trades debuggability nobody uses for a much smaller
// download on every page load.
const minify = process.env.ES_BUILD_MINIFY
  ? process.env.ES_BUILD_MINIFY != "false"
  : !isDev;
const sourcemap = process.env.ES_BUILD_SOURCEMAP
  ? process.env.ES_BUILD_SOURCEMAP != "false"
  : true;

// The dev server has no keepalive of its own -- the only things holding the
// event loop open are the pipes to esbuild's service process. If that child
// dies, the loop empties and this process exits 0 with nothing printed, which
// looks exactly like "the dev server randomly stopped". These handlers make
// every way out of here announce itself on the way down.
let intentionalShutdown = false;
let serving = false;
/** Set once the build context exists; see shutdown(). */
let devContext = null;

/**
 * Leave, taking esbuild's service process with us. That child owns the HTTP
 * listener, so a parent that exits without disposing can leave an orphan
 * still holding the port and serving a stale bundle — which reads as a
 * dev server that half-works, and fails an entire Playwright run with
 * ERR_CONNECTION_RESET when the orphan is finally reaped.
 */
function shutdown(code) {
  // Don't wait forever on a dispose that can't complete.
  setTimeout(() => process.exit(code), 2000).unref();
  Promise.resolve(devContext?.dispose())
    .catch(() => {})
    .finally(() => process.exit(code));
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    intentionalShutdown = true;
    console.log(`\n[dev] ${signal} received, shutting down.`);
    shutdown(0);
  });
}

process.on("uncaughtException", (error) => {
  console.error(`\n[dev] uncaught exception -- the dev server is going down:`);
  console.error(error);
  shutdown(1);
});

process.on("unhandledRejection", (reason) => {
  console.error(`\n[dev] unhandled rejection -- the dev server is going down:`);
  console.error(reason);
  shutdown(1);
});

process.on("exit", (code) => {
  if (!isDev || !serving || intentionalShutdown) {
    return;
  }
  if (code == 0) {
    console.error(
      `\n[dev] the dev server exited on its own (code 0) without being asked to.` +
        `\n[dev] Nothing logged above this line means esbuild's service process` +
        `\n[dev] died and took the file watcher and the HTTP server with it.` +
        `\n[dev] Run 'npm run dev' again.`,
    );
  } else {
    console.error(`\n[dev] the dev server exited with code ${code}.`);
  }
});

const context = await esbuild
  .context({
    entryPoints: ["src/index.tsx", "src/styles/index.css"],
    bundle: true,
    minify,
    sourcemap,
    outdir,
    external: ["/fonts/*", "/images/*"],
    define: {
      // esbuild substitutes NODE_ENV on its own, but naming it here keeps
      // that from being an implicit dependency of the two flags below it.
      "process.env.NODE_ENV": JSON.stringify(
        isDev ? "development" : "production",
      ),
      // Caps the shop's render loop, in frames per second. Only the E2E
      // server sets it (see playwright.config.ts); every other build gets
      // "" and leaves the ticker alone. See ShopView for why.
      "process.env.E2E_RENDER_FPS": JSON.stringify(
        process.env.E2E_RENDER_FPS ?? "",
      ),
    },
    plugins: [
      postcssPlugin({
        extract: true,
        postcss: {
          plugins: [postcssImport, tailwind, autoprefixer],
        },
      }),
    ],
  })
  .catch((error) => {
    console.error(`Build error: ${error}`);
    process.exit(1);
  });

devContext = context;

await copyStatics();

if (isDev) {
  fs.watch("static/", { recursive: true }, async (eventType, filename) => {
    if (eventType == "change") {
      const from = path.join("static", filename);
      const to = path.join(outdir, filename);
      console.log(`copying ${from} to ${to}`);

      try {
        await fsp.cp(from, to, {
          recursive: true,
        });
      } catch (error) {
        console.error(error);
      }
    } else {
      // just a rename
    }
  });

  await context.watch();
  const { host, port } = await context
    .serve({
      servedir: outdir,
      port: Number(process.env.ES_BUILD_DEV_PORT || 3001),
    })
    .catch((error) => {
      console.error(`Build error: ${error}`);
      process.exit(1);
    });
  serving = true;
  console.log(`esbuild serving on ${host}:${port}`);
} else {
  await context.rebuild();
  await context.dispose();
}

async function copyStatics() {
  const startTime = performance.now();
  await fsp.mkdir(outdir, { recursive: true });
  console.log(`copying statics to ${outdir}`);
  await fsp.cp("static", outdir, { recursive: true });
  console.log(`done [${Math.round(performance.now() - startTime)}ms]`);
}
