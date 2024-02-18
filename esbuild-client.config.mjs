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

const context = await esbuild
  .context({
    entryPoints: ["src/index.tsx", "src/styles/index.css"],
    bundle: true,
    minify: !isDev,
    sourcemap: true,
    outdir: "dist/client",
    external: ["/static/*"],
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
      const to = path.join("dist/client", filename);
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
      servedir: "dist/client",
      port: Number(process.env.ES_BUILD_DEV_PORT || 3001),
    })
    .catch((error) => {
      console.error(`Build error: ${error}`);
      process.exit(1);
    });
  console.log(`esbuild serving on ${host}:${port}`);
} else {
  await context.rebuild();
  await context.dispose();
}

async function copyStatics() {
  const startTime = performance.now();
  await fsp.mkdir("dist/client", { recursive: true });
  console.log(`copying statics to dist/client`);
  fsp.cp("static", "dist/client", { recursive: true });
  console.log(`done [${Math.round(performance.now() - startTime)}ms]`);
}
