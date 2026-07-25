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

// The dev server has no keepalive of its own -- the only things holding the
// event loop open are the pipes to esbuild's service process. If that child
// dies, the loop empties and this process exits 0 with nothing printed, which
// looks exactly like "the dev server randomly stopped". These handlers make
// every way out of here announce itself on the way down.
let intentionalShutdown = false;
let serving = false;

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    intentionalShutdown = true;
    console.log(`\n[dev] ${signal} received, shutting down.`);
    process.exit(0);
  });
}

process.on("uncaughtException", (error) => {
  console.error(`\n[dev] uncaught exception -- the dev server is going down:`);
  console.error(error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error(`\n[dev] unhandled rejection -- the dev server is going down:`);
  console.error(reason);
  process.exit(1);
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
    minify: !isDev,
    sourcemap: true,
    outdir: "dist",
    external: ["/fonts/*", "/images/*"],
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

await copyStatics();

if (isDev) {
  fs.watch("static/", { recursive: true }, async (eventType, filename) => {
    if (eventType == "change") {
      const from = path.join("static", filename);
      const to = path.join("dist", filename);
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
      servedir: "dist",
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
  await fsp.mkdir("dist", { recursive: true });
  console.log(`copying statics to dist`);
  fsp.cp("static", "dist", { recursive: true });
  console.log(`done [${Math.round(performance.now() - startTime)}ms]`);
}
