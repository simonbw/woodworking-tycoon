---
name: testing
description: Testing style for this repo — the test tiers, where a new test belongs, and the E2E spec-file map. Invoke whenever writing or modifying tests, deciding which tier or spec file a test belongs in, or adding a feature that needs test coverage.
---

# Testing style

Three tiers, in order of what you should reach for first:

- **Unit tests** (`src/**/*.test.ts`, `node:test` via `tsx`) should be small and focused — one behavior per `it()`. One recipe, one action, one helper.
- **Sequence tests** (`src/game/sequences/*.test.ts`, same runner) drive a whole run of work: many actions over many ticks against one `GameState`, through `ShopDriver` (`src/game/sequences/shop-driver.ts`). This is where a material chain belongs — build the jig, mount it, cut, glue, sand, finish, check the price and the XP. A chain costs milliseconds here against seconds in a browser, and the assertions are sharper (the actual panel, not the text of a list row). `ShopDriver` only ever goes through the real commands in `src/sim/commands/`; for the bench's interactive hand work (see `docs/bench-work.md`) it commits through the same commands the gestures commit through, with no gesture in between. If it can't reach something, grow the commands rather than working around them.
  Reachability lives here too: `src/game/sequences/tutorial.test.ts` plays a new save through the guided opening — scavenge, dismantle, build, first sale at the stand, the store unlocking — and a scavenge-build-sell loop up to the lumberyard's reputation gate. Keep its assertions to _reachability_ (can you afford the next thing, does selling clear the gate) and leave exact numbers to the unit tests.
- **E2E tests** (`tests/*.spec.ts`, Playwright) should be **fat** — one `test()` walks through many related assertions to amortize browser startup. Use `test.step('label', async () => {...})` inside the test so failure reports identify which step broke. Do not split fat E2E tests just to get better failure attribution; `test.step` solves that.
  Their job is that **the UI exposes and wires up** a mechanic — the aisle it's bought from, the row that unlocks it, one pass through each shape of station — not what the mechanic produces. Don't re-derive in a browser what a sequence test already proves.
  There are deliberately only **seven spec files**, one per kind of interface, each swapping fixtures between halves rather than paying for a fresh page:
  - `keyboard.spec.ts` — key routing, focus, modal scope, and hold-to-work
  - `screens.spec.ts` — every overlay: manual, journal, tooltip, pause menu
  - `stations.spec.ts` — station sheets, plans, accessory racks, and the store and lumberyard aisles they're bought from
  - `milling.spec.ts` — direct-feed machines: power switches, settings scales, and the stock deciding the cut
  - `floor.spec.ts` — boot smoke, carrying machines, the truck's day loop (night, sleeping, autosave reload)
  - `market.spec.ts` — the for-sale stand, the supply cabinet, sound cues
  - `bench.spec.ts` — the bench view's pointer work surface: exactly one real canvas drag per gesture type (one stroke, one pry); everything else stages through fixtures and asserts wiring, with completion through the dev-build commit hooks (`__START_OPERATION__`/`__FINISH_ATTENDED_WORK__`)

  Put a new assertion in whichever of the seven it belongs to. Add an eighth file only when a genuinely new kind of interface appears — not per feature. Note that splitting for speed no longer pays: the browser tier is CPU-saturated, so another file adds a browser boot without shortening the wall.

- **Test fixtures** (`tests/fixtures/`) provide preset `GameState` objects. E2E specs load them into the running app through `__UPDATE_GAME_STATE__` (which builds the world from one, the same path a save takes); sequence tests import them directly. Use these to set up complex initial states (e.g. `layout-with-placed-machines`) instead of clicking through the UI to build them.

There is deliberately **no jsdom/React-component tier**. What the browser specs still check — focus routing, real key dispatch, portals, canvas — is exactly what jsdom fakes badly.

E2E specs start games through `startNewGame` in `tests/navigation.ts` (it clicks through the on-workbench "New Game" confirmation card that exists because an autosave is always waiting).
