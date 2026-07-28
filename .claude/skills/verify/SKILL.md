---
name: verify
description: How to launch and drive this app to verify changes at the browser surface.
---

# Verifying changes in Woodworking Tycoon

The surface is a browser GUI (React + PIXI). Do NOT use the user's dev
server (port 3001). Start a throwaway one, on a free port, with the
`--verify-server` marker:

```sh
PORT=3003   # any free port that isn't 3001
ES_BUILD_DEV_PORT=$PORT node esbuild-client.config.mjs --dev --verify-server &
echo $! > "/tmp/wwt-verify-$PORT.pid"
```

The marker does nothing to the build — the config only looks for `--dev` —
but it puts a word in this process's command line that the user's server
does not have. Stop it by PID when you're done:

```sh
kill "$(cat /tmp/wwt-verify-3003.pid)"
```

**Never `pkill -f esbuild`, `pkill -f "esbuild-client.config.mjs --dev"`, or
anything else matching the bare config name.** The user keeps a dev server
running all day whose command line is exactly `node esbuild-client.config.mjs
--dev`, and those patterns SIGTERM it out from under them. If the pidfile is
gone, `pkill -f -- "--verify-server"` is the widest pattern that is still
safe (it can only hit verify servers, including other agents').

Drive it with Playwright from a Node script (`@playwright/test` is a
dependency; use `createRequire` pointed at this repo's package.json if the
script lives outside the repo).

Useful handles (dev builds only, exposed on `window`):

- `__UPDATE_GAME_STATE__(fn)` — apply a GameAction-style transform to live state
- `__GET_GAME_STATE__()` — read live state for assertions
- `__TEST_FIXTURES__` — preset states from tests/fixtures/, loadable via the
  🧪 Fixtures button (bottom right)

Flow notes:

- Fresh start: `localStorage.clear()` + reload, then click "New Game"
  (a `confirm()` dialog appears if a save exists — auto-accept dialogs).
- Save key is `woodworking-tycoon-save`; versioned, mismatches are discarded.
- Materials for state injection are plain objects with an `id`, e.g.
  `{ id: "x", type: "rusticShelf", species: "pallet" }` or
  `{ id: "y", type: "board", species: "pallet", length: 2, width: 4, thickness: 1 }`.
- After `page.reload()` wait ~500ms before querying — React mounts async.
