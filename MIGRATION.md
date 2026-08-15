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

- [x] `ShortcutDispatcher` entity over `shortcuts.ts` registry (scopes
      global/home; modal arrives with the phase-5 overlays), commands only —
      the old handler bodies became composite commands
      (`src/sim/commands/interact-commands.ts`), targeting is a shell entity
      (`src/shell/dispatch/TargetingState.ts`, the old
      TargetedMachineContext), and the boundary test holds
      `src/shell/dispatch` to the command surface
- [x] Held operate/wait keys (dispatcher keyDown/keyUp → held flags); held
      movement via `io.getMovementVector()` (MovementInput, phase 3);
      Game.loop now accrues actual frame time so a slow renderer can't
      starve the pace model
- [x] Mouse picking: `camera.toWorld(io.mousePosition)` + footprint hit-test
      (replaces invisible Pixi hit shapes); right-click routing
      (`src/views/MousePicking.ts` — hover targets among what the body
      reaches, right-click opens the sheet/floor-card state)
- [x] Targeting highlight (shared resolvers; `TargetHighlightView` applies
      the old outline filters to the targeted machine and the pile E would
      take). **Hint chips deferred to phase 5's ReactEntity roots** — they
      are DOM, and the DOM layer is phase 5's first item; the resolvers
      they share are already live under the dispatcher (recorded deviation)
- [x] **Gate:** floor interaction verified E2E on the engine shell
      (tests/engine-shell.spec.ts: E picks up / F puts down through the
      dispatcher, B hoists and sets down, staged via the save hooks). The
      old floor.spec.ts rehosts at cutover with the rest of the seven
      (decision 9)

## Phase 5 — HUD & overlays [size M]

- [x] ReactEntity roots (HUD + modal layer) mounted into the canvas stacking
      context; state-change-driven renders; `useSyncExternalStore` hooks over
      singletons/entities (successor of `useGameState`): `ShellStore` folds
      the HUD-visible surface into a per-tick signature and bumps a version;
      `useShell.tsx` exposes `useShopState()` (projected `GameState`, memoized
      per version) as the `useGameState()` drop-in; `HudRoot` is one
      ReactEntity (autoRender=false, renders once — updates flow through the
      components' own subscriptions) hosting HUD and modals alike. Exemplar:
      the top bar's clock + balance segments (`src/shell/hud/TopBar.tsx`),
      reusing DayDial/StarIcon/Tooltip verbatim
- [x] Tutorial predicates become queries over the entity world (same
      declarative shape per `tutorial.ts`'s header philosophy) — satisfied by
      the projection: MilestoneSystem already walks `advanceTutorials` over
      `projectGameState` (phase 2), and the DOM cards read the same
      projection through `useShopState()`; the predicates themselves stay
      untouched
- [x] **[fan-out]** Port the DOM tree: NavBar, day clock, hands strip,
      supplies, station sheets, prompts, manual, journal, tutorial cards,
      pause/start menus, nightfall card — six worktree slices, all merged
      (see the Log entries below); the phase-4 hint-chip deferral is
      closed by the overlay slice, and the world-pinned DOM rides a
      per-frame OverlayRoot beside the signal-driven HudRoot
- [x] **Gate:** HUD/tutorial/selling specs pass; first sale + reward flight —
      transitional home: the engine-shell journey spec carries the
      HUD/tutorial/selling coverage until the seven canonical specs rehost
      at cutover (decision 9). The reward flight ported early (phase 8
      lists it, but this gate demands it): the StreetSystem's "payout"
      event lands in a shell `PayoutBuffer` entity, and
      `src/shell/hud/payout/RewardFlightLayer.tsx` drains it when the
      player is home — the truck-roll wait rejoins in phase 6. The spec's
      selling step stages the guaranteed first sale (stocked stand +
      deciding customer + held wait key) and asserts settle + flight +
      store unlock

## Phase 6 — Trips & the store venue [size M]

- [x] Scene-swap plumbing (persistence levels guard sim/HUD/camera across
      `clearScene`): the SceneDirector rebuilds the view side whenever the
      venue changes or a save load strips it — shop scenery demoted to
      Level persistence and spawned by the director, registry views tagged
      (`isRegistryView`) so teardown/respawn can find them on surviving
      sim entities (`Game.spawnRegisteredView` is the shared pairing), and
      the StoreSceneRoot owns the store floor's walk (shared
      `stepPlayerMotion` over `storeCollisionWorld`, cell reported onto
      `away.position`) plus a both-axes camera at the rig's zoom. Drive
      legs charge through `TimeFlow.forceMinutes` — out immediately after
      `goToStore`, home *before* `returnFromStore` via the director's
      deferred completion — preserving the old actions' ordering
- [x] `StoreScene`: walkable aisles, shelf/corral/register interactions,
      checkout, departure — StoreSceneRoot + store-views/ (environment,
      fixtures, merchandise bake + highlight, actors with the pushed
      flatbed and ambient shoppers, the stalled truck, daylight), keys in
      a ShortcutDispatcher store branch over the shared
      resolveStoreInteract, the old StoreOverlayLayer/StoreCheckoutModal
      imported verbatim through the OverlayRoot bridge, cart readout as a
      shell copy over the cart commands. Departure is instant until the
      trip theater lands (the next item) — the old E2E build's behavior
- [x] Lumberyard + shopping overlays; scavenging trip UI — shell copies in
      `src/shell/hud/trips/` over the command surface (useStoreTrip's till
      via checkout + the director's drive home; scavenge decisions via
      continueScavenging/headHomeFromScavenging; the night card via
      beginWakeUp), TripOverlay/logo/checkout-button imported verbatim,
      TripHeader/BoardSelector copied with hooks swapped, DayClock
      exported from the NavBar port for the trip pages. Deviations: the
      departure/arrival theater (truck rolls, fades, truckStage) is
      deferred to phase 8's polish alongside the sound layers — every
      overlay swaps instantly, the old E2E build's behavior — and the
      overnight now passes at one sim minute per engine tick (~14s of
      night card vs the old instant batch; the SleepSystem's interleaving
      parity is the constraint, revisit at polish if it reads slow)
- [x] **Gate:** shopping-trip spec passes end to end — transitional home:
      the engine-shell journey grew the whole trip through the real seams
      (the cab's trip card, the 15-minute drive charge, the scene swap,
      corral/shelf/register keys, the receipt's Buy, the deferred drive
      home landing the purchase in the bed); the canonical trips spec
      rehosts at cutover (decision 9)

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
- 2026-08-15 — Phase 4 spine: ShortcutDispatcher + TargetingState +
  composite interact commands live on the shell; browser-verified (carry
  toggle, held wait). Loop time accrual fixed to actual frame delta
  (headless/throttled renderers ran sim time slow). Remaining: mouse
  picking, highlight + hint chips, floor-interaction gate.
- 2026-08-15 — Phase 4 complete (chips deferred to the phase-5 DOM port,
  recorded above): mouse picking + highlight live, dispatcher-driven
  floor interaction covered in the engine-shell spec. Next: phase 5
  (ReactEntity HUD roots, tutorial queries, DOM tree fan-out).
- 2026-08-15 — Phase 5 spine: ShellStore version signal + useShell hooks +
  HudRoot ReactEntity + top-bar exemplar; engine.html now links the real
  stylesheet and loadFonts() replaces the interim sign-font loader.
  Browser-verified (chip renders in paperwork chrome, wallet mutation
  propagates, clicks pass through to the canvas); HUD assertion step added
  to the engine-shell spec. Dispatching the DOM-tree fan-out.
- 2026-08-15 — [fan-out] NavBar + journal + pause menu ported: the full
  NavBar (absorbing the TopBar exemplar's clock/balance segments) with
  Skills button, XP meter, and skill-point badge; JournalModal at
  `src/shell/hud/journal/` spending points through the existing
  `spendSkillPoint` command; PauseMenu over `game.pause()`/`unpause()`
  (unmount resumes) with Save & Quit forcing a SaveManager write then
  reloading. Deviations: the manual `?` button is omitted (the manual is
  its own fan-out slice — the button returns with it); quit-via-reload is
  transitional until boot lands on a start menu; and pause-menu's Escape
  binding disables itself while the engine dispatcher's close-sheet
  answers, since two providers now share the key that one registry order
  used to arbitrate. Journal + pause steps added to the engine-shell spec
  (marked `test.slow()` — the journey test outgrew the default budget).
  Browser-verified: modal quiets floor keys, pause stops the clock, a
  learned skill survives Save & Quit's reload. tsc + unit green.
- 2026-08-15 — [fan-out] Shop manual ported: ManualProvider (same
  `useManual` surface, binds `toggle-help` itself; the NavBar `?` button
  returns with the NavBar port at merge), ShopManualModal + ManualLink in
  `src/shell/hud/manual/` over `useShopState`, mark-read through the
  existing `markArticlesRead` command; the article bodies are pure and
  import straight from the old `articles/`. ShellStore's signature grows
  `readArticles.length` so opening a page clears its New flag, and the
  provider's modal mount re-enables pointer events under HudRoot's inert
  sheet (`contents` wrapper). Manual open/close step added to the
  engine-shell spec, whose one long test now carries an explicit 60s
  budget (the default 30s was nearly spent before phase 5's steps).
  Browser-verified: `?` opens the binder, articles and tabs render, floor
  keys go quiet under the modal scope and return on close. tsc + unit
  green. (Merge note: the NavBar `?` button was re-added at merge, wired
  to this provider's `useManual`/`hasUnreadArticles` as in the old
  NavBar.)
- 2026-08-15 — [fan-out] Start menu + boot flow ported: StartMenu lands in
  `src/shell/hud/` verbatim (painted sign, Continue with the incompatible
  note, the clear-the-shop confirm card) over the new `shell/saveSlot.ts`
  (engine-slot getSaveStatus/read/write/delete; "incompatible" = a dry run
  of loadSaveFile's migration + schema validation), and engine-main no
  longer boots unconditionally — the empty world shows the menu through
  EngineHud's !shopOpen branch, and the menu's buttons run bootShop
  (fresh, or from the slot), so a quit-to-menu reload offers Continue for
  free. engine.html gains index.html's boot placeholder + logo preload.
  Deviations: one markup addition (`pointer-events-auto` on the menu's
  `<main>`, required under the HUD root's pointer-transparent sheet), no
  UiSoundLayer on the menu (sounds are phase 8), and the engine-shell
  spec's timeout raised to 60s for its two boots + reload. Spec grew the
  menu-first opening and a reload→Continue byte-identical restore step;
  tsc + unit green, spec green, menus screenshot-identical to the old
  shell's.
- 2026-08-15 — [fan-out] Hands strip, supplies panel, and nightfall card
  ported into `src/shell/hud/` on the shell hooks, mounted in EngineHud
  with HomePage's exact wrappers (bench-dive fade stays phase 7; the
  coach's column wrapper is structured for the tutorial cards to land
  above the nightfall note). Mutations ride the existing dropMaterial /
  putDownBroom / toggleCarryShopVac commands — none added;
  dustpanFillFraction is re-exported off cleaning-commands so the shell
  stays off the old actions. The old `playerMotionStore` read became a
  click-time read of the Player entity (the drop's orientation now
  quantizes to the facing via headingForDirection, exactly the shell F
  key's spelling). ShellStore's signature grows broom, vac, and
  clamps-in-use coverage. Engine-shell spec grows a HUD step and is
  green; staged-HUD screenshot checked against the old shell's layout.
  tsc + unit green.
- 2026-08-15 — [fan-out] In-world interaction DOM ported (the phase-4
  hint-chip deferral closed): OverlayRoot (autoRender ReactEntity, z 5,
  camera transform folded into an OverlayFrame context) carries the old
  ShopOverlayLayer tree — MachineChips/OutfeedChips, PlayerPrompt,
  StandPrompt, TruckBedPrompt, the cab's trip card — pinned via
  camera.toScreen each frame; StationSheet (Contents/Accessory + racks)
  and FloorSheet render screen-anchored in the HUD root (portal dropped:
  the root is already a fixed whole-window layer, z-35 under the top
  bar's 40 as before). Sheets/racks mutate through machine/tool/upgrade/
  pile commands; the trip card fires goToStore/startScavenging/goHome;
  pure read helpers (canPickUpMachine, canSweepAt, canLeaveShop, …)
  re-exported through the command modules. ShellStore signature grew the
  overlay's inputs (player cell/facing/held keys, broom, vac, stand, bed,
  piles); dispatcher takes the floor sheet into close-sheet and stands E
  down for the open card's panel-accept (old registry order); MovementInput
  captures W/S while the card is open. Chips + Tab steps added to the
  engine-shell spec; browser-verified side-by-side with the old shell at
  parity. Gaps, recorded: Tab at a bench opens no surface (bench view is
  phase 7); trip rows launch the sim commands but drive minutes/venues/
  away-side UI are phase 6, as is the truck's roll-in theater (prompts
  key off `player.away` alone); ManualLink renders only once the manual
  port supplies an opener (manualOpenContext); BlueprintStack ported
  dormant for phase 7's plan browser.
- 2026-08-15 — [fan-out] Tutorial cards + spotlight ported: TutorialCards/
  TutorialSpotlightLayer/tutorialTargets land in `src/shell/hud/tutorial/`
  over the shell hooks (skip → the existing dismissTutorial command; copy,
  markup, and testids verbatim), and the world half is a new
  `TutorialHighlightView` — the old coach outlines (machines by type,
  truck, stand, broom, matching piles, the nightfall homeward nudge) as
  the same orange OutlineFilters on the view roots (MachineView/TruckView
  grew a `highlightRoot`), rendering after TargetHighlightView so the
  white rim wins. Deviations: ManualLink is copied with a `useManualMaybe`
  seam that renders plain text until the manual port's provider is wired
  in at merge; the tutorial's truck target only ever names the cab, so
  the bed crop stays unported; the fat engine-shell spec got
  `test.setTimeout(90s)` — the phase-4/5 steps outgrew the 30s default.
  Browser-verified against the old shell (card up on a fresh shop, truck
  rimmed, box ticks + strike on staging a pallet, skip retires the card,
  white-beats-orange on the reachable pile). This commit also carries the
  hands-strip/supplies/nightfall slice that arrived uncommitted in this
  worktree mid-task (kept so the commit builds; attribution with the
  orchestrator). tsc + unit (1350) + engine-shell E2E green.
- 2026-08-15 — Phase-5 fan-out fully merged (six slices: NavBar/journal/
  pause, manual, start menu/boot, hands/supplies/nightfall, overlay/
  station, tutorial). Merge reconciliations: the NavBar `?` button rewired
  to the ported ManualProvider; three ManualLink variants consolidated
  onto `src/shell/hud/manual/ManualLink.tsx` (the tutorial stub and the
  overlay's context shim deleted — every consumer renders under the
  provider); duplicate `dustpanFillFraction` re-exports deduped in
  cleaning-commands; ShellStore signature and EngineHud unioned across
  slices; the journal spec's modalOpen assertions poll now (the flag
  crosses two React effect passes and OverlayRoot's per-frame renders
  exposed the race). tsc + unit (1350) + the full engine-shell journey
  green after each merge.
- 2026-08-15 — Phase 5 gate green: the reward flight ported onto the shell
  (PayoutBuffer entity over the "payout" event + the old RewardFlightLayer
  markup verbatim, gated on being home; truck-stage wait rejoins in phase
  6), mounted above everything in EngineHud. The engine-shell journey
  grew the first-sale step: stand stocked and a deciding customer staged
  via the hooks, the wait key held until the sale settles, then stand
  empty / money+reputation up / salesCompleted=1 / store unlocked / coins
  airborne toward the readouts all asserted. Screenshots: fresh shop with
  the coach's card and full NavBar; post-sale with $12.00, ★ 1.7, the
  next goal card, and the Skills ring. tsc + 1350 unit + the journey spec
  green. Phase 5 complete; next is phase 6 (trips & the store venue).
- 2026-08-15 — Phase 6 scene-swap spine landed: SceneDirector venue
  machinery (teardown/respawn over tagged registry views + Level-scoped
  scenery), StoreSceneRoot with the store's placeholder bones (slab,
  walls with door gaps, spines/fixtures/register/corral blocks), the
  store floor's continuous walk writing `away.position` through the
  setShoppingPosition command, drive legs charged through
  TimeFlow.forceMinutes with the director completing the return after
  its minutes serve, and CameraRig standing down for the store's
  both-axes pan. Browser-verified end to end: swap to the store empties
  the registry views, walking updates the trip's cell, requestDriveHome
  charges 15 minutes and lands the player at the cab with all views
  respawned. tsc + 1350 unit + engine-shell journey green. Next: the
  StoreScene proper (fixtures, merchandise, store keys, checkout).
- 2026-08-15 — Phase 6 store interactions landed: the StoreSceneRoot owns
  the old StoreView's transient state (checkout card, armed leave-confirm
  with its timeout/step-away/empty disarms) and the store floor's keys
  (E/F/Escape branch in ShortcutDispatcher, reading the shared
  resolveStoreInteract exactly like the old StoreKeyboardShortcuts); the
  DOM rides the spine roots — the old StoreOverlayLayer and
  StoreCheckoutModal import verbatim (props-driven) via a world-origin
  bridge in OverlayRoot, and the cart readout is a shell copy over the
  cart commands. The SceneDirector's missing-scene probe now covers both
  venues (a save load's clearScene strips either). Browser-verified full
  loop: corral E takes a cart, bay E/F loads and returns a Hammer with
  tag/chips/cart-corner live, register E opens the receipt, Buy pays and
  the drive home lands the purchase in the bed. tsc + 1350 unit green.
  Remaining in this item: the venue dress (environment/fixtures/
  merchandise/daylight/shoppers/truck/cart sprites + decals).
- 2026-08-15 — Phase 6 StoreScene complete: the daylight mask (sky
  ambient, swept building shadow, sales floor lit from inside) and the
  full dress verified in the browser — the stocked aisles, the shopper's
  person sprite pushing a loaded flatbed that trails and swings, three
  ambient shoppers solid to the walk, the truck in its painted stall
  with bed cargo, the storefront sign and stencils. tsc + 1350 unit +
  engine-shell journey green. Next: the trip theater, lumberyard and
  scavenging overlays, then the shopping-trip gate.
- 2026-08-15 — Phase 6 trip overlays landed and browser-verified: the
  scavenging circuit at parity (flatbed drawing, handwritten stop report,
  keep-searching/good-enough decisions, loot landing in the bed), the
  lumberyard storefront with its reputation-gated racks (S2S rack renders
  with earned rep; empty below threshold, as designed), and the night
  card waking through the SleepSystem's 840-minute overnight. Trip
  overlays needed a pointer-events-auto wrapper under HudRoot's inert
  sheet (the manual's seam). tsc + 1350 unit + engine-shell journey
  green. Next: the phase-6 gate's shopping-trip E2E coverage.
- 2026-08-15 — Phase 6 gate green: the shopping-trip step runs the full
  loop end to end in the engine-shell journey. Phase 6 complete; phase 7
  (the bench view — the riskiest item) is next.
- 2026-08-15 — Phase 7 opened with the study pass. The port's shape: the
  pure engine (`src/game/bench-work/`) and the bench commands (phase 2's
  `bench-commands.ts`) stay as-is; what rebuilds is the view half — the
  old `BenchWorkSurface` (state + pointer handling, publishing a React
  subtree into `benchSceneSlot` for the canvas's dive layer) and its pure
  renderers (BenchScene/StrokeSurface/SawSurface/GlueUpLayer/…, all
  @pixi/react). Engine design: a shell-side dive state (which bench is
  open, Tab at a worktable opens it — the phase-4 note's deferral), a
  BenchDiveRoot entity drawing the zoomed work surface in screen space
  above the still-ticking world with the old dive transform, pointer
  gestures over `game.io` in bench-top inches (stageMath), and the four
  modes landing in the plan's order: pry, tool-first, glue-ups,
  blueprint assembly.
