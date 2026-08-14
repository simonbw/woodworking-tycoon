// PostToolUse hook: format just the file Claude edited, with the repo's own
// pinned prettier. Formatting the single file (instead of the whole tree, as
// `npm run format` does) keeps a session's diff limited to files it actually
// touched, and resolving prettier from node_modules by absolute path means a
// checkout without installed dependencies formats nothing rather than falling
// back to whatever global prettier the machine happens to have — the two
// failure modes that let web sessions reformat unrelated code.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

let input = "";
for await (const chunk of process.stdin) {
  input += chunk;
}

let filePath;
try {
  filePath = JSON.parse(input).tool_input?.file_path;
} catch {
  process.exit(0);
}
if (typeof filePath !== "string" || filePath.length === 0) {
  process.exit(0);
}

const resolved = path.resolve(root, filePath);
const inRepo = resolved === root || resolved.startsWith(root + path.sep);
if (!inRepo || !/\.(ts|tsx|mjs|css|json|md)$/.test(resolved)) {
  process.exit(0);
}

const prettierBin = path.join(
  root,
  "node_modules",
  "prettier",
  "bin",
  "prettier.cjs",
);
if (!existsSync(prettierBin) || !existsSync(resolved)) {
  process.exit(0);
}

const result = spawnSync(
  process.execPath,
  [prettierBin, "--write", "--ignore-unknown", resolved],
  { stdio: "inherit" },
);
process.exit(result.status ?? 0);
