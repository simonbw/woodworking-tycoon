# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Woodworking Tycoon is an idle/simulation game built with React and TypeScript. The game simulates running a woodworking shop where players manage materials, machines, and commissions to make money and build reputation.

## Development Commands

- **Build production**: `npm run build`
- **Development server**: `npm run dev` (serves on port 3001 by default, configurable via ES_BUILD_DEV_PORT)
- **Type checking**: `npm run tsc`
- **Regenerate machine collision boxes**: `npm run generate:collision-boxes` (run after changing machine sprite art; trims the exports first, then measures — see `docs/continuous-movement.md`)
- **Trim machine sprite exports**: `npm run trim:images` (crops each machine PNG's transparent margin symmetrically about the canvas center, so exports can use any canvas size; runs automatically as part of `generate:collision-boxes`)
- **Code formatting**: `npm run format`
- **All tests**: `npm run test` (runs unit then E2E)
- **Unit tests only**: `npm run test:unit` (`tsx --test` against `src/**/*.test.ts`)
- **E2E tests only**: `npm run test:e2e` (starts its own dev server on a free port picked per run, so two runs never collide; set `E2E_PORT` to pin one)
- **E2E headed**: `npm run test:headed`

### Testing Guidelines for Claude

**IMPORTANT**: Claude should NEVER run `npm run dev` directly. The user manages the dev server.

For testing changes:

- Use `npm run test` for full validation, or `test:unit` / `test:e2e` to target one tier
- Ask the user to test manually if more complex validation is needed

### Testing Style

Three tiers, in order of what you should reach for first:

- **Unit tests** (`src/**/*.test.ts`, `node:test` via `tsx`) should be small and focused — one behavior per `it()`. One recipe, one action, one helper.
- **Sequence tests** (`src/game/sequences/*.test.ts`, same runner) drive a whole run of work: many actions over many ticks against one `GameState`, through `ShopDriver` (`src/game/sequences/shop-driver.ts`). This is where a material chain belongs — build the jig, mount it, cut, glue, sand, finish, check the price and the XP. A chain costs milliseconds here against seconds in a browser, and the assertions are sharper (the actual panel, not the text of a list row). `ShopDriver` only ever goes through the real actions in `game-actions/`; for the bench view's interactive hand work (see `docs/bench-minigames.md`) it commits through the same actions the mini-game commits through (`performWork`, and `run` routes there itself), with no mini-game in between. If it can't reach something, grow the actions rather than working around them.
- **The progression ledger** (`src/game/sequences/playthrough.ts` + `progression.test.ts`) plays the game from a new save to the last commission — all 6 rungs, every purchase and skill point earned rather than granted, including the job-board and listing grinding that fills the reputation gaps between commissions (fair-priced listings are deterministic via the pity timer; the seeded job board's pallet-boards offer is the deterministic reputation source). `checkpointAfter(n)` is the shop after commission _n_, memoised, so the whole playthrough runs once (~1s). Add a rung whenever you add a commission; `progression.test.ts` fails if the ledger falls behind `COMMISSION_SEQUENCE`. Keep its assertions to _reachability_ — can you afford the next machine, is the recipe unlocked, does the grind clear the next reputation gate — and leave exact numbers to the unit tests.
- **E2E tests** (`tests/*.spec.ts`, Playwright) should be **fat** — one `test()` walks through many related assertions to amortize browser startup. Use `test.step('label', async () => {...})` inside the test so failure reports identify which step broke. Do not split fat E2E tests just to get better failure attribution; `test.step` solves that.
  Their job is that **the UI exposes and wires up** a mechanic — the aisle it's bought from, the row that unlocks it, one pass through each shape of station — not what the mechanic produces. Don't re-derive in a browser what a sequence test already proves.
  There are deliberately only **seven spec files**, one per kind of interface, each swapping fixtures between halves rather than paying for a fresh page:
  - `keyboard.spec.ts` — key routing, focus, modal scope, and hold-to-work
  - `screens.spec.ts` — every overlay: manual, journal, tooltip, pause menu
  - `stations.spec.ts` — station sheets, plans, tool racks, and the store and lumberyard aisles they're bought from
  - `milling.spec.ts` — direct-feed machines: power switches, settings scales, and the stock deciding the cut
  - `floor.spec.ts` — boot smoke, carrying machines, delivering work with the truck
  - `market.spec.ts` — phone listings and jobs, the supply cabinet, sound cues
  - `bench.spec.ts` — the bench view's pointer work surface: exactly one real canvas drag per gesture type (one stroke, one pry); everything else stages through fixtures and asserts wiring, with completion through the dev-build commit hooks (`__START_OPERATION__`/`__FINISH_ATTENDED_WORK__`)

  Put a new assertion in whichever of the seven it belongs to. Add an eighth file only when a genuinely new kind of interface appears — not per feature. Note that splitting for speed no longer pays: the browser tier is CPU-saturated, so another file adds a browser boot without shortening the wall.

- **Test fixtures** (`tests/fixtures/`) provide preset `GameState` objects. E2E specs load them into the running app via `FixtureLoader`; sequence tests import them directly. Use these to set up complex initial states (e.g. `layout-with-placed-machines`) instead of clicking through the UI to build them.

There is deliberately **no jsdom/React-component tier**. What the browser specs still check — focus routing, real key dispatch, portals, canvas — is exactly what jsdom fakes badly.

## Architecture Overview

### Core Game Architecture

The game follows a state-driven architecture with clear separation between game logic and UI:

- **GameState** (`src/game/GameState.ts`): Core game state interface containing all simulation data (money, materials, machines, commissions, etc.). Includes a `ProgressionState` slice for the persistent unlock state.
- **Game Actions** (`src/game/game-actions/`): Pure functions that transform game state
- **Save/Load** (`src/game/saveLoad.ts`): Serializes the persistent slice of `GameState` to/from JSON for browser storage
- **Autosave** (`src/game/autosave.ts`, `src/components/useAutosave.ts`): The shop saves itself as it runs, so a refresh costs nothing. Writes are coalesced through `requestIdleCallback` (one write per idle moment, newest state wins) and flushed synchronously on `pagehide` — a closing tab has no async turn left. Because a save is always waiting, "New Game" confirms with a card on the workbench rather than a browser `confirm()`; E2E specs start games through `startNewGame` in `tests/navigation.ts`, which clicks through it
- **Components** (`src/components/`): React components for UI, organized by feature areas

### Key Systems

1. **State Management**: Uses React Context via `GameStateProvider` (`src/components/useGameState.tsx`)
2. **Game Loop**: Managed by `Ticker` component for regular game updates; the player's body moves continuously between ticks with WASD (see `docs/continuous-movement.md`) while `GameState` tracks only the cell underfoot. The clock is spend-to-advance (see `docs/time-and-days.md`): full pace while the player is working, a ramping fast-forward under the held wait key, a slow creep while idle (~5× real time), stopped at night — and the day only turns over by driving home to sleep. The player has no speed controls; the pause menu stops everything, and the other overlays don't stop the world.
3. **Diegetic UI**: The shop floor (`HomePage`) is the game's only screen — there are no tabs. The canvas runs full-bleed with the garage drawn as a building on its lot (grass, driveway, walls, and the garage-door opening: `EnvironmentLayer`), and the remaining chrome floats over it as a HUD. Everything else is an object reached from it:
   - **Shop manual** (`ManualProvider`): the `?` reference binder, an overlay
   - **The guided opening** (`src/components/tutorial/`, steps in `src/game/tutorial.ts`): a coach card in the HUD's left column showing one instruction at a time, with the thing it names outlined in the world or ringed in the chrome. Steps are predicates over `GameState`, not a script (see `docs/tutorial.md`)
   - **Phone** (`PhoneModal`): SawdustList — sell listings & the job board — opened from the top bar
   - **Journal** (`JournalModal`): the skill tree, opened from the top bar
   - **Clipboard** (`ClipboardModal`): the active commission's full work order, held up with C or by clicking the top-left tracker chip (`CommissionTracker`); it holds itself up when a new commission arrives after a payout
   - **The truck** (`TruckPrompt`, geometry in `src/game/lot.ts`): the pickup backed up to the garage door, on the walkable lot outside (the camera follows the player out — `CameraLayer`). Its bed carries all physical cargo (`GameState.truck`): purchases and scavenged pallets ride home in it, and finished work is loaded into it (F at the tailgate) before delivery. Standing at the cab lists numbered rows — _places to go_ (shopping trips (`AwayTrip`s of kind `shopping`) to Orange Box (`StoreTripOverlay`) or the Sawyer & Sons lumberyard (`LumberyardTripOverlay`, reputation-gated), and pallet scavenging (`ScavengeTripOverlay`: a route-map travel log that plays out while the timed trip runs)) and _work to deliver_ out of the bed. Finished work — commissions and job-board jobs alike — only leaves the shop this way; there is no "mark complete" button (see `docs/handing-work-over.md`). Trips open and close with a pure-presentation departure/arrival performance (`truckStageStore` + `TripTransitionLayer`, scored by the `truck-start`/`truck-arrive` clips)
   - **In-world interaction UI** (`src/components/shop-overlay/`, `src/components/station/`): the machine the player stands at is highlighted in the shop view (an amber outline shader, `shop-view/targetHighlight.ts`) and wears hint chips naming its live keys (E interacts, F sets stock down, hold Space to run a power machine, Z/X and R for its settings); the pile E would pick up wears the same outline with its own `[E] pick up` chip; benches and containers open a centered station sheet (Tab) holding plans, racks, and contents, while direct-feed machines have no sheet beyond a tool rack; a hint cluster follows the player for the remaining floor verbs. What's carried rides a HUD strip at bottom-center (`HandsStrip`, click a slot to set one down); the supply tally floats bottom-right (`SuppliesSection`)
   - **The bench view** (`src/components/bench-view/`, engine in `src/game/bench-work/`): Tab at a bench fills the window with the same scene the shop draws — the concrete floor and the bench's own sprite art at high zoom (`BenchSceneBackdrop`), the camera diving in from the bench's spot on the shop floor — the whole world swells around the bench while the scene crossfades over it, pixel-locked — and pulling back out on close (`benchZoom.tsx` + `shop-view/BenchZoomCameraLayer.tsx`; pure presentation, honors `prefers-reduced-motion`, the E2E suite runs with it reduced) — with the bench's contents lying exactly where `MachineState.benchLayout` says (persistent state, rendered identically on the shop floor). Mounted tools hang on a floating rail and are taken in hand by clicking (the hammer pries a staged pallet's nails one press at a time — nails are pallet state, one per deck-board × stringer crossing, drawn in both views by `PalletSprite`; each face only offers its own side's nails, so the pallet is flipped (F) to reach the bottom boards', and a board drops free only when its last nail is out; the pallet and freed boards alike drag around, R turns, F flips — the pallet turns over, a board tips up onto its long edge (`BenchPlacement.onEdge` — its footprint narrows to its thickness, drawn by `BoardOnEdgeSprite` in both views), E takes the hovered piece, all committed via `arrangeBenchMaterialAction`), while single-piece tool work is tool-first and in place (the held tool over a piece it can work IS the operation — `src/game/bench-work/tool-work.ts`: the sanding block strokes a coverage mask on the piece where it lies, the plane works the face flat or the edge stood on edge, the hand saw ghosts its line along the half-foot detents and the press marks the cut, and the finishing kit — the cheap rag-and-pads tool from the store — rubs a sanded blank into the finished board the wood qualifies for and wipes the oil on; outputs inherit the workpiece's spot, a sawn board parting into two pieces end to end at the mark) and glue-ups are clamps-first on the scene with no plan ever selected (`src/game/bench-work/glue-up.ts`: bar clamps set out on the bench top — one per foot of stock length, min two, borrowed from the shop's `GameState.clamps` pool — glue-ready stock laid across them edge to edge, the contiguous run deciding the credited recipe the way direct-feed stock decides the cut, a bead stroked down each seam, and the last clamp wound tight committing `startGlueUpAction` straight into the cure, drawn in place by `GlueUpLayer`/`GlueCuringLayer`; arbitrary strip counts are legal — the five glue recipes survive as credited shapes, not plans) — every assembly is a blueprint build (all products — including the shelf, serving tray with its glued panel bottom, the side table whose legs stand on end (F cycles flat → edge → end), the hex frame on rotated slots, and the seven-part jewelry box — plus the shop equipment: worktables, storage rack, bench upgrades, and saw jigs, whose commit grants the machine/upgrade/jig instead of leaving a product, assembled upside down with the top face-down; a fastener-less blueprint like the material shelf commits when the last part is laid on) assembling on the scene itself: ghost slots from a `ProductBlueprint` (`src/game/bench-work/blueprint.ts`), parts laid on by hand in the orientation the slot demands (`BlueprintSlot.onEdge` — the shelf's rails stand on edge like joists; hovering an empty outline bare-handed tags its required stock), one fastener driven per crossing with the tool the blueprint's consumable names (nails take the hammer, screws the drill — `fastenerToolId`), the finished product carrying its bill of materials and drawn from its own parts at every zoom (`AssembledProductSprite`) — see `docs/assembly.md`). A bench has no paperwork card and no input/output diagram: the plan picker is a diegetic pile of blueprint sheets in the view's bottom-right corner (`BlueprintCorner` — the pulled drawing is the selected plan, its title block reads supplies against shop stock), tools mount and unmount on the top rail itself (`BenchToolRail` — empty hooks take a carried compatible tool), and a worktable's shelf/upgrades fold into a small "Under the bench" drawer (`UnderBenchPanel`). There is no held-Space path for these; the view decides _when_ and the commit actions in `game-actions/operation-actions.ts` decide _what_. The world keeps ticking while the view is open, but the body stays put — movement keys are pinned until Tab steps back (see `docs/bench-minigames.md`)
   - Shop layout management happens on the floor itself: machines are physically picked up, carried, and set down by the player (see `docs/carrying-machines.md`)

### Material and Machine System

- **Materials** (`src/game/Materials.ts`): Wood types and their properties; boards and panels carry a surface condition (rough → smooth → sanded)
- **Machines** (`src/game/Machine.ts`): Woodworking equipment with input/output specifications
- **Tools** (`src/game/Tool.ts`, `src/game/tools/`): Handheld tools that mount into a workstation's tool slots and add operations there (see `docs/tools-and-surfaces.md`)
- **Operations**: Each machine can perform specific operations transforming materials; a station's operation list combines its own operations with its mounted tools'
- **Direct-feed machines** (`MachineType.directFeed`: planer, jointer, table saw, miter saw): No mode picker and no control panel — persistent machine settings plus one piece of stock set down on the machine (F), run by holding Space; which operation runs is inferred from what's on the machine. Benches keep explicit recipe selection only for assembly _builds_, labeled "Plan"; tool work and glue-ups are offered by the bench top itself — a staged pallet's nails, a butted run in the clamps, no plan involved (see `docs/direct-feed-machines.md` and `docs/bench-minigames.md`). Feed-through machines (`feedsThrough`) additionally need clear lane past both ends scaled to the stock's length (`src/game/feed-clearance.ts`)
- **Consumables** (`src/game/Consumable.ts`): Shop-wide supplies (nails, finishes) that operations consume and salvage can return (see `docs/consumables.md`)
- **Material Piles**: Physical placement of materials in the shop space
- **Machine Carrying** (`src/game/game-actions/machine-actions.ts`): Bought machines ride home crated in the truck's bed and are lifted out at the tailgate; shop-built ones land crated beside the bench. Either way the player carries them into place — there is no separate layout editor (see `docs/carrying-machines.md`)

### Rendering Architecture

The game uses PIXI.js via `@pixi/react` for performant 2D rendering of the shop view, combined with traditional React/Tailwind for UI overlays. This hybrid approach allows smooth interaction with many game objects while maintaining rich UI components.

In-world things are drawn either from a PNG texture (registered in `src/utils/loadAssets.ts`) or procedurally with PIXI `Graphics`. Which objects still want real art, which are procedural on purpose, and how to swap one for the other is tracked in `docs/asset-backlog.md` — read it before drawing a new `Graphics` sprite or replacing an existing one.

## File Organization

```
src/
├── components/            # React components
│   ├── shop-view/         # Main game area rendering (PIXI)
│   ├── store-page/        # The Orange Box store trip overlay
│   ├── lumberyard-page/   # The Sawyer & Sons lumberyard trip overlay
│   ├── phone/             # Phone overlay (SawdustList: listings + job board)
│   ├── journal/           # Journal overlay (skill tree)
│   ├── clipboard/         # Clipboard overlay (the full work order)
│   ├── payout/            # Handoff celebration (client card + reward flight)
│   ├── current-cell-info/ # Shared cell/material widgets (scales, icons, lists)
│   ├── machine-sprites/   # PIXI machine renderers
│   ├── material-sprites/  # PIXI material renderers
│   ├── shop-overlay/      # DOM layer pinned over the canvas (hint chips, prompts)
│   ├── station/           # Machine hint chips + station sheet + racks
│   └── *.tsx              # Top-level UI (NavBar, HomePage, Ticker, …)
├── game/                  # Core game logic
│   ├── game-actions/      # State transformation functions
│   ├── machines/          # Machine type definitions
│   └── *.ts               # Game entities, helpers, saveLoad
├── utils/                 # Shared utilities
└── styles/                # CSS and styling
tests/
├── fixtures/              # Preset GameState fixtures for E2E tests
└── *.spec.ts              # Playwright specs
```

## Key Technical Details

- **Build System**: esbuild with custom configuration (`esbuild-client.config.mjs`)
- **Styling**: Tailwind CSS with a "paperwork" design system (paper/manila surfaces, ink text colors, typewriter/stencil/condensed fonts) defined in `tailwind.config.ts`. Font and surface roles are documented in `docs/design-system.md` — read it before styling new UI. The legacy brown palette is retained only for sprites/older components.
- **Asset Pipeline**: Static assets in `static/` are copied to `dist/` during build — everything in there ships, so an unreferenced file is dead weight in the bundle
- **Fonts**: All self-hosted from `static/fonts/`; **never link a font CDN**. Web families are vendored by `npm run fetch:fonts` (`scripts/fetch-fonts.ts`) into `src/styles/fonts.generated.css`, and both the `.woff2` files and that CSS are committed. Adding a family or weight means updating the script, `tailwind.config.ts`, and `src/utils/loadFonts.ts` together — see the font section of `docs/design-system.md`
- **Development**: Live reload enabled via esbuild's serve mode
- **Type Safety**: Strict TypeScript with comprehensive type definitions

## Development Guidelines

- All game state mutations should go through the action system in `src/game/game-actions/`
- New machines should be added to `src/game/machines/` with corresponding sprites in `src/components/machine-sprites/`; if the sprite ships as procedural `Graphics` rather than art, add a row to `docs/asset-backlog.md`
- UI components should use the existing "paperwork" design system (paper/manila/ink tokens and workshop chrome from `tailwind.config.ts`), following the font/surface roles in `docs/design-system.md` — not the legacy brown palette, which is kept only for sprites
- Player-facing numbers go through `src/utils/formatNumber.ts` (`formatMoney` / `formatCount` / `formatDecimal`), not `toFixed`, and carry `tabular-nums` unless they sit in prose or in the handwriting face — see the numbers section of `docs/design-system.md`
- Performance considerations: The game renders many objects, so prefer PIXI components for game entities and React for UI overlays

## Game Design Notes

The game implements a time-based simulation where players queue actions and the game processes them over time. Key gameplay elements include:

- **Commission System**: Players fulfill orders for money and reputation, handing each one over at the garage door for a client card and a reward flight (see `docs/handing-work-over.md`)
- **Machine Operations**: Transform raw materials into finished products
- **Shop Layout**: Physical space management affects workflow efficiency
- **Economic Progression**: Purchase better machines and expand workshop space

See `GAMEPLAY_ROADMAP.md` for the full design vision (commission progression, tutorial sequence, late-game goals) and `docs/woodworking-features-brainstorm.md` for the broader feature pool.
