# Engine migration — working plan

This file is the operational plan for rebuilding Woodworking Tycoon on the
entity-based engine vendored from `simonbw/game-engine`. It lives only on the
migration branch and is **deleted at cutover (phase 8)** — it is a work ledger,
not documentation.

**How to work this file:** work the phases in order. Do the next unchecked
item, check it off, commit, push. Never advance past a red gate. Append one
line to the Log per work session. If reality contradicts this plan, stop,
resolve it (asking the user if it's a real scope/design question), and record
the resolution here — never diverge silently.

**Working agreements**

- Every gate is a command that passes or fails. Run `npm run tsc` and
  `npm run test:unit` before every commit; run the phase's named E2E spec at
  its gate.
- Commit small — per system or sub-phase — so review and rollback stay
  possible. Push after each commit.
- The old shell (current `src/index.tsx` app) stays untouched and runnable
  until phase 8. It is the reference implementation. Registries and pure
  helpers are shared between both worlds, never forked.
- Behavioral parity is the contract. No design changes, no balance changes,
  no "improvements" to game rules mid-migration.
- Stages marked **[fan-out]** parallelize across subagents once the exemplar
  exists: build the first instance in the main loop, then dispatch "port X
  following exemplar Y; done when Z passes" tasks in parallel. Everything not
  marked fan-out is spine work — sequential, one context.
- Two gates need a human playtest and cannot be self-verified: visual parity
  (phase 3) and bench feel (phase 7). Flag the user when you reach them;
  don't block other checklist items while waiting.

## Architecture decisions (settled — do not relitigate)

1. **Entity-owned state.** Machines, benches, the player, piles, crates,
   customers, the truck, the stand, dust, the shop vac, trips, and scene roots
   are sim entities owning their state. Money, reputation, progression,
   tutorial, time, consumables, storage, and shop info are serializable
   singleton entities with fixed ids. There is no central GameState object in
   the new world.
2. **Materials are data, not entities.** `MaterialInstance` records (ids and
   all) stay immutable data passed between owners — machines hold theirs
   inline, hands hold instances, the truck bed holds cargo. This keeps
   serialization containment-shaped; no cross-entity reference fixup.
3. **One 60 Hz clock, two time streams.** Engine fixed timestep at 60 ticks/s.
   A `TimeFlow` singleton ports the pace rules from `src/game/time-flow.ts`
   and exposes `gameDt = dt × pace`; sim entities consume `gameDt`,
   body/camera/UI consume raw `dt`. Cap `gameDt` per tick and substep sim
   layers under deep fast-forward (no customer tunneling). Tick layers encode
   the ordering from `tickAction.ts`'s header: player → cleaning → machines →
   clock → street → milestones.
4. **Sim/view split with a physical boundary.** Sim entities live under the
   same no-PIXI/no-DOM import rule `src/game` has today (lint-enforced). View
   entities own sprites/`onRender`/sounds, are paired via
   `registerView(SimClass, ViewClass)`, spawn only when the game has a
   renderer, and are never serialized.
5. **Serialization:** per-type `toJSON(): Serialized` + `static fromJSON()`
   registered under a string type key, zod schema co-located per type. Save
   file `{ version, singletons, entities: [{type, data}] }`, snapshotted at a
   tick boundary. One top-level SAVE_VERSION + whole-file sequential migration
   chain. Loading and E2E fixtures are the same path: clearScene +
   instantiate. The pure `autosave.ts` coalescer moves into a `SaveManager`
   entity (high persistenceLevel) owning the pagehide flush.
6. **Command layer.** All world mutations that input can trigger are commands
   (sim-entity methods / free functions). `ShortcutDispatcher` contains no
   logic, only command calls; the new ShopDriver calls the same surface.
   The pure resolvers (`interact.ts`, `store-interact.ts`) stay shared between
   dispatcher and hint chips.
7. **Headless + determinism.** `new Game({ headless: true, random: seeded })`
   builds no renderer/IO/audio, touches no DOM, starts no rAF; `step(ticks)`
   advances synchronously. Exact fixed tickDuration; seeded `game.random`;
   lint bans `Math.random`/`Date.now`/`performance.now` in sim directories.
8. **Stack:** keep Pixi 8 (no WebGPU renderer), no physics engine at all
   (strip p2; our `player-motion.ts` math is the collision system), keep
   esbuild (no Parcel; keep `static/` + `loadAssets.ts`), keep React 19 +
   Tailwind via `ReactEntity` with `autoRender=false` (render on state-change
   signals). Cherry-pick from tack-and-trim: `@on` handler decorator +
   non-nullable `entity.game`, IO manager split (no steering wheel),
   `PersistedState`, tick layers, Profiler, Vector improvements, and the
   save-slot/migration patterns.
9. **Test tiers after migration:** unit tests on pure logic unchanged;
   game-action transform tests retired system-by-system as entity tests
   replace them; the sequence tier is rehosted on the headless Game with the
   same job-level verbs and **is the parity spec for the sim**; E2E specs
   unchanged, fixtures become save files, `window.__*` hooks reimplemented.

Reference clones of the two engine repos, if needed again:
`https://github.com/simonbw/game-engine`, `https://github.com/simonbw/tack-and-trim`.
The full research and rationale live in the plan artifact (Rev 2) and the
conversation that produced this file.

## Phase 0 — Vendor & engine surgery [size M]

- [x] Vendor `src/core/` + `src/config/` from simonbw/game-engine
- [x] Strip p2/physics (world, bodies, contacts, ground, EntityDef body path);
      remove the dependency entirely (never added: physics-free files only)
- [x] Apply tack-and-trim lifts: `@on` decorator registration + non-nullable
      `game` getter; Keyboard/Mouse/Gamepad manager split with `destroy()`
      (steering wheel dropped); `PersistedState` (namespace
      `woodworking-tycoon:setting:`); tick layers; Profiler (vendored as a
      util, not yet wired into Game); Vector improvements
- [x] Replace Parcel resource codegen with our pipeline: `static/` +
      `loadAssets.ts`; `npm run generate:resources`
      (`scripts/generate-resources.ts`) emits `src/resources/resources.ts`
      name-literal types from `static/`
- [x] Headless mode: `GameOptions { headless?, random? }`; constructor/init
      skip renderer, IO, audio, DOM, rAF when headless
- [x] Split `loop()` into `advance(seconds)` + `render()`; public
      `step(ticks)`; loop = advance + render
- [x] View registry: `registerView(SimClass, ViewClass)`; addEntity spawns the
      view as a child iff the game has a renderer
- [x] Second esbuild entry (`src/engine-main.ts` + `static/engine.html`,
      served at `/engine.html`) alongside the old app
- [x] Lint boundary (`src/import-boundaries.test.ts`, runs with test:unit):
      sim directories may not import pixi/react/DOM;
      `Math.random`/`Date.now`/`performance.now` banned in new-world sim
      directories (`src/sim`; the retiring `src/game` predates the rule)
- [x] **Gate:** Node test boots headless Game, steps 10,000 ticks, twice with
      the same seed → identical results (`src/core/Game.test.ts`); browser
      entry shows an empty lot with pannable camera (verified via Playwright:
      camera panned, no console errors); `npm run tsc` + `npm run test:unit`
      green

## Phase 1 — Foundations [size S]

- [x] `TimeFlow` singleton (paces: working/idle/waiting-ramp/stopped; ported
      from `time-flow.ts` with its tests' expectations) — `src/sim/TimeFlow.ts`;
      spenders/providers register in, `gameDt` comes out, capped per tick
- [x] Singletons: Wallet, Reputation, Progression, TutorialTracker, Clock,
      Consumables, StorageUpgrades, ShopInfo — each serializable
      (`src/sim/singletons/`; Clock consumes TimeFlow's gameDt on the
      "clock" layer and carries a fractional-minute remainder)
- [x] Serialization registry + SaveFile format + SAVE_VERSION + migration
      chain scaffold + `SaveManager` entity hosting the `autosave.ts`
      coalescer (`src/sim/save/`; storage injected so headless stays
      DOM-free; snapshot serialized at write time, always between ticks)
- [x] Command-layer scaffold (`src/sim/commands/` + import-boundary rule:
      dispatcher imports commands only; driver additionally save/bootstrap/
      singleton reads; neither may touch old `game-actions/`)
- [x] New ShopDriver skeleton (`src/sim/driver/ShopDriver.ts`): boots headless
      Game from a fixture save; `tick(n)` → `game.step(n)`; assertion helpers
      over entities/singletons
- [x] `window.__*` hooks on the new shell: `__GET_GAME_STATE__` (serialize),
      `__UPDATE_GAME_STATE__`/fixture load (deserialize), `__ADVANCE_TICKS__`
      (`step`), `__SET_PAUSED__`, render-throttle equivalent of `capRenderRate`
      (`Game.renderFpsCap`, wired to `E2E_RENDER_FPS`)
- [x] **Gate:** save → load → save round-trips byte-identical on a minimal
      shop, headless; driver boots and ticks deterministically
      (`src/sim/save/SaveFile.test.ts`; hooks additionally verified in-browser
      via Playwright — all 8 singletons round-trip through the shell)

## Phase 2 — The working shop, sim only [size L — the keystone]

Port system by system: sim entities + commands, headless-first, rehosting the
relevant `src/game/sequences/` files with each system. Old `game-actions/` is
the reference implementation; equivalent entity tests replace each system's
transform tests as it lands.

- [x] Player entity: 60 Hz movement (port `player-motion.ts` integration +
      collision), carrying/hands, busyTicks  ← exemplar #1, spine
      (`src/sim/entities/Player.ts`; collision world assembled from
      "solids"-tagged entities, `src/sim/collision.ts`)
- [x] Machines: placement, carrying machines, power, settings, operations
      (phases, attended work, dust emission), feed clearance  ← exemplar #2,
      spine (`MachineEntity` + `MachineSystem` minute pass +
      `machine-commands.ts`; **deviation, recorded**: operations advance as
      the serialized `operationProgress` state machine, not live coroutines —
      a save must land mid-cure and round-trip byte-identically, and the
      resumable state IS the progress record; behavior matches
      `machineTickPass` line for line)
- [x] **[fan-out]** Remaining systems, each with its sequence files: piles &
      material flow; dust/sweeping/vac; stand & customers (seeded rng); day
      cycle & sleep; trips (shopping/scavenging, sim side); consumables &
      tools; bench-work commands (engine is already pure — wire commands);
      milestones/progression (eight subagent ports, merged; details in the
      Log)
- [x] **Gate:** all 14 sequence files green on the new driver
      (`src/sim/sequences/*.test.ts`, same describes/assertions/fixtures as
      the old tier, mutations through commands only; old copies stay until
      phase 8; zero `it.skip`s — two parity bugs found by the rehost were
      fixed in the sim/driver, none papered over)

## Phase 3 — Shop floor views [size L]

- [x] Layer table (`src/config/layers.ts`) matching current draw order
      (world layers in old world-pixel coordinates, 48/cell)
- [x] Environment/lot, camera follow, WorldViewport sizing
      (`src/views/EnvironmentView.ts` ports EnvironmentLayer's lot/walls;
      `src/views/CameraRig.ts` reproduces ShopView's fit + CameraLayer's
      outdoor follow as Camera2d position/zoom; lawn re-follows the
      camera's world viewport each frame)
- [x] Player view  ← exemplar for sprite ports (`src/views/PlayerView.ts`
      via registerView; `MovementInput` feeds held movement so the shell
      walks — the full dispatcher stays phase 4)
- [x] **[fan-out]** ~40 sprites as view entities (Graphics bodies port into
      `onRender`/redraw-on-change), daylight, dust, truck, customers, stand
      (four subagent ports merged: floor/dust/daylight/cords, machines +
      crates + carried, materials/broom/vac/arms, truck/stand/customers)
- [ ] **Gate:** walkable shop at visual parity (side-by-side screenshots vs
      old shell — **human playtest gate**, FLAGGED — screenshots delivered,
      awaiting the playtest); movement E2E spec passes
      (tests/engine-shell.spec.ts, green)

## Phase 4 — Interaction [size M]

- [ ] `ShortcutDispatcher` entity over `shortcuts.ts` registry (scopes
      global/home/modal), commands only
- [ ] Held operate/wait keys; held movement via `io.getMovementVector()`
- [ ] Mouse picking: `camera.toWorld(io.mousePosition)` + footprint hit-test
      (replaces invisible Pixi hit shapes); right-click routing
- [ ] Targeting highlight + hint chips (shared resolvers)
- [ ] **Gate:** floor-interaction E2E spec passes

## Phase 5 — HUD & overlays [size M]

- [ ] ReactEntity roots (HUD + modal layer) mounted into the canvas stacking
      context; state-change-driven renders; `useSyncExternalStore` hooks over
      singletons/entities (successor of `useGameState`)
- [ ] Tutorial predicates become queries over the entity world (same
      declarative shape per `tutorial.ts`'s header philosophy)
- [ ] **[fan-out]** Port the DOM tree: NavBar, day clock, hands strip,
      supplies, station sheets, prompts, manual, journal, tutorial cards,
      pause/start menus, nightfall card
- [ ] **Gate:** HUD/tutorial/selling specs pass; first sale + reward flight

## Phase 6 — Trips & the store venue [size M]

- [ ] Scene-swap plumbing (persistence levels guard sim/HUD/camera across
      `clearScene`)
- [ ] `StoreScene`: walkable aisles, shelf/corral/register interactions,
      checkout, departure
- [ ] Lumberyard + shopping overlays; scavenging trip UI
- [ ] **Gate:** shopping-trip spec passes end to end

## Phase 7 — Bench view [size L — riskiest]

- [ ] `BenchScene` replacing `BenchWorkSurface.tsx`, sub-phased by mode:
  - [ ] pry (pallets)
  - [ ] tool-first work
  - [ ] glue-ups (clamps-first)
  - [ ] blueprint assembly
- [ ] **Gate:** bench spec passes; all modes at parity (**human playtest
      gate** for feel)

## Phase 8 — Cutover [size S]

- [ ] Sound layers + payout flight as view entities
- [ ] Flip default entry to the engine shell
- [ ] Delete old shell, `game-actions/` transform layer, `@pixi/react`,
      retired tests
- [ ] Docs: retire `continuous-movement.md`, update `floor-interaction.md`,
      `bench-work.md`, CLAUDE.md architecture, testing skill map
- [ ] Delete this file
- [ ] **Gate:** one shell, no dead code, `npm run test` fully green

## Log

- 2026-08-15 — Plan committed. No implementation started.
- 2026-08-15 — Phase 0 core landed: vendored physics-free engine core
  (game-engine's Pixi graphics/sound stack + tack-and-trim's entity/IO/util
  layers), new `Game` with headless mode, `advance`/`render` split,
  `step(ticks)`, seeded `game.random`, tick layers, and the view registry.
  Resource name-literal types now generate from `static/`. tsc + unit green.
- 2026-08-15 — Phase 0 complete. Engine shell at `/engine.html` (empty lot,
  WASD/arrow pan, Q/E zoom), boundary rules as a unit test, determinism gate
  test green (10,000 ticks × 2, identical), browser gate verified with
  Playwright screenshots.
- 2026-08-15 — Phase 1 complete. TimeFlow (pace rules as spender/provider
  registrations, gameDt out), eight serializable singletons, serialization
  registry + SaveFile v1 + migration scaffold + SaveManager coalescer,
  command-layer scaffold with boundary rules, new ShopDriver, and the
  engine shell's window.__* hooks. Gate green: byte-identical round-trip,
  deterministic driver, hooks verified in-browser.
- 2026-08-15 — Phase 2 exemplars done. Player (continuous body on raw dt,
  busy burn on sim ticks) and Machines (MachineEntity + MachineSystem +
  commands) live on the new driver; `projection.ts` bridges entity state to
  the shared pure helpers, `save/fixture.ts` loads old GameState fixtures
  into the entity world (unported slices fail loudly), and the resaw
  scenario runs attended with pause/resume, dust, settings lock, and
  mid-operation save round-trip. Sim time quantized via timeFlow.wholeTicks.
  Coroutine note above is the one mechanism deviation, taken for
  serialization; flagging it for review rather than asking up front since
  behavior is line-for-line machineTickPass.
- 2026-08-15 — [fan-out] Stand & customers ported: StandEntity (singleton)
  + one CustomerEntity per passerby, StreetSystem on the "street" layer
  (standTickPass line for line, dice from game.random), stand-commands,
  projection/fixture claim their slices, driver grows standAtStand/
  setOut/awaitSales, "payout" event added to CustomEvents (reward flight
  subscribes in phase 3+). Driver deviations, both waiting on other
  fan-out ports: setOut sweeps only the hands (piles unported) and
  awaitSales can't sleep through nights (day cycle unported). tsc + unit
  green.
- 2026-08-15 — [fan-out] Tools & worktable upgrades ported: tool-commands
  (mountTool/unmountTool over the shared withValidSelectedOperation, now
  exported from the old tool-actions) and upgrade-commands
  (installUpgrade/uninstallUpgrade against the StorageUpgrades singleton),
  machineCanOperateNow query on machine-commands, driver grows
  mount/fetchTool/unmount/fitOut/canOperate with the old verbs' exact
  semantics and messages. Loose tools stay MaterialInstances of kind
  "tool" (hands / MaterialPileEntity / truck bed), as in the old world.
  No sounds — the old actions queued none. gatherBenchToolAction waits
  for the bench-work port. tsc + unit green.
- 2026-08-15 — [fan-out] Bench-work commands ported: the pure engine
  (`src/game/bench-work/`) stays shared, and the operation-actions commits
  land as `bench-commands.ts` — pryPalletNail (nail → Consumables stock,
  freed boards under their pallet-slot ids), startGlueUp (clamps-first
  claim, all guards), arrangeBenchMaterial, gatherBenchPieces (bench-group
  seam), emitBenchDust (writes the DustLayer singleton), benchOffersPry.
  Driver grows run/performWork/takeStock/feed/glueUp/make, and load/collect
  take the old driver's ferrying semantics. Deviations, both waiting on the
  day-cycle port: run() can't sleep off the night first (no ensureDaylight
  yet), and glue cures tick straight through. tsc + unit green.
- 2026-08-15 — [fan-out] Trips ported (sim side): trip-commands
  (scavenging circuit off game.random + the store legs), cart-commands
  (the register folds through the purchase commands), store-commands
  (buys → Wallet + bed/crates/stock, tool wall, upgrades; buyMachine runs
  the milestone pass synchronously like the old action), the scavenge
  reveal + searching TimeFlow spender on the Player, and the driver's
  scavenge/goShopping/takeCart/comeHome/buy\* verbs. Store-leg minutes
  are charged by the caller through TimeFlow (the driver ticks them;
  phase 6's venue will force them) since commands never step the sim —
  ordering matches the old driveTicks exactly. Driver deviation, waiting
  on the day-cycle port: scavenge/goShopping can't sleep off the night
  first (ensureDaylight). tsc + unit green.
- 2026-08-15 — [fan-out] Cleaning system ported: Broom singleton (owned/
  position/dustpan), ShopVacEntity (absent until bought), CleaningSystem on
  the "cleaning" layer running the old sweep → vacuum → shopVac passes per
  sim minute over a projection and writing the slices back (parity by
  construction — the old passes are reused wholesale, not rehosted),
  held-tool TimeFlow spender, walk-speed penalties (dust/vac drag/active
  sweep) re-registered per Player instance from beforeTick, cleaning
  commands + driver verbs, fixture/projection claims for the broom, pan,
  and vac slices. tsc + unit green.
- 2026-08-15 — Wave 1 of the phase-2 fan-out merged (four subagents in
  worktrees): piles & truck, cleaning (dust/broom/vac), stand & customers
  (seeded street), milestones/progression. All fixture slices except
  trips-side state now load; 1235 unit tests green. Wave 2 dispatched:
  trips & store purchases, day cycle & sleep, tools & upgrades, bench-work
  commands.
- 2026-08-15 — [fan-out] Day cycle & sleep ported: day-commands (goHome +
  beginWakeUp, old door-actions' goHome/wakeUp; the store-trip actions
  stay with the trips port) and a transient SleepSystem — the overnight
  batch's ported spelling: beginWakeUp turns the day over and queues
  NIGHT_TICKS on the system, which feeds TimeFlow.forceMinutes(1) per
  engine tick (caller-driven; commands never step the engine) so the
  per-minute layer interleaving matches the old sequential-tickAction
  batch, then lands the morning bookkeeping (fresh dayStartTick, player
  at the cab, away null). Driver grows sleep()/ensureDaylight and
  awaitSales now sleeps through nights like the old driver. tsc + unit
  green.
- 2026-08-15 — [fan-out] Sequence rehost: cleaning-chain, day-loop, and
  tutorial land in `src/sim/sequences/` on the new driver — same
  structure, same assertions, same fixtures, no parity bugs found. Three
  recorded driver deviations resolved now that their blocking ports have
  landed: run/scavenge/goShopping regain the old ensureDaylight guards
  (night refusals no longer strand a long sequence) and setOut ferries
  matching stock off the floor again, an armful at a time. tsc + unit
  green (1303).
- 2026-08-15 — PHASE 2 GATE MET. All 14 sequence files rehosted onto the
  new driver by four gate agents and merged: same structure, assertions,
  and fixtures; parity fixes landed in the sim (skill-gated select(),
  forced-minute isolation in TimeFlow) rather than in tests. 1350 unit
  tests green, tsc clean. The working shop now runs entirely on entities,
  headless.
- 2026-08-15 — Phase 3 spine merged (layer table, EnvironmentView,
  CameraRig, PlayerView exemplar, MovementInput); the movement E2E gate
  lives in a transitional eighth spec file, tests/engine-shell.spec.ts —
  the shell is a genuinely different interface until cutover, when the
  seven canonical specs rehost onto it and this file is absorbed
  (recorded as the testing-skill deviation it is). Sprite fan-out
  dispatched: floor/dust/daylight, machines, materials/broom/vac, street.
- 2026-08-15 — [fan-out] Machine views ported: MachineView/MachineCrateView
  via registerView, per-type arts under `src/views/machine-sprites/`
  (dispatch = old LocalMachineSprite switch; textures, offsets, fence/
  slide/plunge poses, kerf, vibration, cut-particle emitters, dust bag,
  status badge, worktable shadow pass as zIndex bands on the "machines"
  layer), CarriedMachineView (hoisted machine + set-down ghost + feed-run
  rulers) as a PlayerView child on "carried". Static art rebuilds on
  state-object identity change; running visuals re-read per frame
  (react-spring → exponential approach, audible-phase sync waits for the
  phase-8 sound port). Stock ON machines routes through the
  `material-slot.ts` seam — the material-sprite port registers its
  builder there and every placement/animation is already wired. Settling
  chips still publish to the shared dustStampBus (world px) for the dust
  view port. Targeting/tutorial highlights + hit shapes deferred to
  phase 4, leaned-bench suppression to phase 7. Verified side-by-side
  against the old shell (13 machines, mid-rip badge+kerf, carried+ghost+
  rulers+crate). tsc + unit green.
- 2026-08-15 — Phase 3 fan-out fully merged; fresh-shop side-by-side
  screenshots show the world canvas at parity (old shell's extras are the
  phase-4/5 DOM chrome). Movement E2E green. Human playtest gate flagged
  to the user; continuing into phase 4 per the working agreements.
