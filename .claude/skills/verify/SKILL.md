---
name: verify
description: How to launch and drive this app to verify changes at the browser surface.
---

# Verifying changes in Woodworking Tycoon

The surface is a browser GUI (React + PIXI). Do NOT use the user's dev
server (port 3001). Start a throwaway one:

```sh
ES_BUILD_DEV_PORT=3003 node esbuild-client.config.mjs --dev &   # kill when done
```

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
