# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Woodworking Tycoon is an idle/simulation game built with React and TypeScript. The game simulates running a woodworking shop where players manage materials and machines, building pieces to sell off the roadside for-sale stand for money and reputation.

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

There are three test tiers — unit, sequence (`ShopDriver`), and fat Playwright E2E specs (deliberately only seven files, one per kind of interface; deliberately no jsdom tier). The `testing` skill is the single source for the tier philosophy and the spec-file map — invoke it before writing or moving any test.

## Architecture Overview

### Core Game Architecture

The game follows a state-driven architecture with clear separation between game logic and UI:

- **GameState** (`src/game/GameState.ts`): Core game state interface containing all simulation data (money, materials, machines, the stand's stock, etc.). Includes a `ProgressionState` slice for the persistent unlock state.
- **Game Actions** (`src/game/game-actions/`): Pure functions that transform game state
- **Save/Load** (`src/game/saveLoad.ts`): Serializes the persistent slice of `GameState` to/from JSON for browser storage
- **Autosave** (`src/game/autosave.ts`, `src/components/useAutosave.ts`): The shop saves itself as it runs — coalesced idle writes, flushed synchronously on `pagehide`. Because a save is always waiting, "New Game" confirms with a card on the workbench rather than a browser `confirm()`
- **Components** (`src/components/`): React components for UI, organized by feature areas

### Key Systems

1. **State Management**: Uses React Context via `GameStateProvider` (`src/components/useGameState.tsx`)
2. **Game Loop**: Managed by `Ticker` component for regular game updates; the player's body moves continuously between ticks with WASD (see `docs/continuous-movement.md`) while `GameState` tracks only the cell underfoot. The clock is spend-to-advance (see `src/game/time-flow.ts`): full pace while the player is working, a ramping fast-forward under the held wait key, a slow creep while idle (~5× real time), stopped at night — and the day only turns over by driving home to sleep. The player has no speed controls; the pause menu stops everything, and the other overlays don't stop the world.
3. **Diegetic UI**: The shop floor (`HomePage`) is the game's only screen — there are no tabs. The canvas runs full-bleed with the garage drawn as a building on its lot (grass, driveway, walls, and the garage-door opening: `EnvironmentLayer`), and the remaining chrome floats over it as a HUD. Everything else is an object reached from it:
   - **Shop manual** (`ManualProvider`): the `?` reference binder, an overlay
   - **The guided opening** (`src/components/tutorial/`, goals in `src/game/tutorial.ts`): a handwritten to-do card in the HUD's left column — one goal at a time, its steps as checkboxes that tick as the shop's state satisfies them, with the thing the first unchecked box names outlined in the world or ringed in the chrome. Steps are predicates over `GameState`, not a script (see the header of `src/game/tutorial.ts`)
   - **Journal** (`JournalModal`): the skill tree, opened from the top bar
   - **The for-sale stand** (model in `src/game/stand.ts`, tick pass in `src/game/game-actions/stand-actions.ts`): a small table with a hand-written FOR SALE sign in the grass at the end of the driveway — the game's one selling channel. The player carries finished pieces down and sets them out (F) or takes them back (E) (`StandPrompt`); customers stroll the sidewalk line below the lot, stop at a stocked stand, and buy at fair value (`getSellValue`) — there is no pricing step. `GameState.stand` holds what's set out, `GameState.customers` the passersby. Every sale settles instantly and queues a `PayoutEvent`; `RewardFlightLayer` (`src/components/payout/`) flies the coins and star to the HUD readouts. Sales are the game's only money and reputation source: the first sale unlocks the store, and reputation gates the lumberyard's channels
   - **The truck** (`TruckPrompt`): the pickup on the walkable lot outside. Its bed carries all physical cargo (`GameState.truck`), and every trip — shopping or scavenging — starts at the cab. See `docs/trips.md`
   - **The Orange Box store** (`src/components/store-view/`, planogram in `src/game/store-layout.ts`, keys in `src/game/store-interact.ts`): a shopping trip swaps the canvas to the store's own walkable floor — racks generated from the registries, F/E at the shelves, a rack card for sizes, the register, and the truck out front as the way home. The lumberyard is still a menu overlay, and the old store overlay survives behind `?website` as the future website (issue #200)
   - **In-world interaction UI**: the machine the player stands at is highlighted and wears hint chips naming its live keys; the mouse never acts at a distance — it chooses among what the body can already reach, and right-click opens what's under it. Targeting, chips, station sheets, hit-testing, and the mouse rules are in `docs/floor-interaction.md`
   - **The bench view** (`src/components/bench-view/`, engine in `src/game/bench-work/`): Tab at a bench dives into a zoomed work surface where the pointer is the hand — prying pallets apart, tool-first work on the piece where it lies, clamps-first glue-ups, and blueprint assembly, all committing through the actions in `game-actions/operation-actions.ts` (the view decides _when_, the actions decide _what_). The world keeps ticking while the view is open. The system doc is `docs/bench-work.md`; single-module detail lives in the `bench-work/` module headers (blueprints in `blueprint.ts`, bench groups in `bench-group.ts`, glue-ups in `glue-up.ts`, the tool-first offer in `tool-work.ts`)
   - Shop layout management happens on the floor itself: machines are physically picked up, carried, and set down by the player (see `src/game/game-actions/machine-actions.ts`)

### Material and Machine System

- **Materials** (`src/game/Materials.ts`): Wood types and their properties; boards and panels carry a surface condition (rough → smooth → sanded)
- **Machines** (`src/game/Machine.ts`): Woodworking equipment with input/output specifications
- **Tools** (`src/game/Tool.ts`, `src/game/tools/`): Handheld tools that mount into a workstation's tool slots and add operations there (see `docs/tools-and-surfaces.md`)
- **Operations**: Each machine can perform specific operations transforming materials; a station's operation list combines its own operations with its mounted tools'
- **Direct-feed machines** (`MachineType.directFeed`: planer, jointer, table saw, miter saw, band saw): no mode picker — persistent settings plus the stock set down on the machine decide the operation, run by holding Space (see the `directFeed` field docs in `src/game/Machine.ts`). Feed-through machines additionally need clear lane past both ends (`src/game/feed-clearance.ts`)
- **Consumables** (`src/game/Consumable.ts`): Shop-wide supplies (nails, finishes) that operations consume and salvage can return
- **Material Piles**: Physical placement of materials in the shop space
- **Machine Carrying** (`src/game/game-actions/machine-actions.ts`): Bought machines ride home crated in the truck's bed and are lifted out at the tailgate; shop-built ones land crated beside the bench. Either way the player carries them into place — there is no separate layout editor

### Rendering Architecture

The game uses PIXI.js via `@pixi/react` for performant 2D rendering of the shop view, combined with traditional React/Tailwind for UI overlays. This hybrid approach allows smooth interaction with many game objects while maintaining rich UI components.

In-world things are drawn either from a PNG texture (registered in `src/utils/loadAssets.ts`) or procedurally with PIXI `Graphics`. Which objects still want real art, which are procedural on purpose, and how to swap one for the other is tracked in `docs/asset-backlog.md` — read it before drawing a new `Graphics` sprite or replacing an existing one.

## File Organization

```
src/
├── components/            # React components
│   ├── world-view/        # The walkable-place machinery: the canvas, the body, walking
│   ├── shop-view/         # The shop and its lot, drawn on that canvas (PIXI)
│   ├── shopping/          # A trip's till and its drawings, whatever the storefront
│   ├── store-view/        # The walkable Orange Box, drawn on the world canvas
│   ├── store-page/        # The old storefront overlay — the future website, behind ?website
│   ├── lumberyard-page/   # The Sawyer & Sons lumberyard storefront
│   ├── journal/           # Journal overlay (skill tree)
│   ├── payout/            # Sale celebration (the reward flight to the HUD readouts)
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

## Player-facing prose

Everything a player reads — manual articles, tutorial cards, hint chips, tooltips, station sheets, store copy — is written in plain instruction-manual style, for someone seeing the game for the first time. The canonical ruleset is the "Voice & copy rules" section of `docs/shop-manual.md`; it applies to all player-facing text, not just manual articles. The short version:

- Describe what the game **is** — never what it isn't, lacks, or used to be, and never what players would assume anyway
- No internal design vocabulary, invariants, or units ("verbs", "tiles"); teach through concrete actions and fiction-level quantities ("when the dustpan fills up")
- State each fact once, plainly: openers give information rather than metaphors, no pithy-sentence-then-restatement, no negative-then-positive pivots, no trailing mood clauses, em dashes rationed
- Instruct, don't reassure — say what to do and what happens, not how to feel about it
- Personality is confined to the manual's handwritten margin Notes, where it's wanted; body text stays plain

## GitHub Issues and the docs/ boundary

Designs for unbuilt work live in GitHub issues, not in `docs/` — the docs describe systems that exist, or provide guidance for creating more content. Within that: **docs describe systems, never content.** A doc may explain what a tool is, how the milling axes work, and the rules for adding a machine — it must not enumerate the tools, quote prices, or restate quantities the registries declare, because those inventories rot (the code is their single source of truth). A system with one owning module doesn't get a doc at all: its explanation belongs in that module's header comment (see `time-flow.ts`, `blueprint.ts`, `material-helpers.ts`); a doc earns its place only when a system spans many files with no single home. Deliberate design decisions ("stays procedural", "out of scope on purpose") stay in docs/code comments, not issues — they're there to stop relitigation.

Every open issue lives on the **Woodworking Tycoon** project board with a stage (Idea / Needs design / Ready / …) that says what kind of work it needs next. The `issue` skill is the single source for the taxonomy, labels, and board mechanics — invoke it any time you're reading, creating, triaging, or picking up issues.

## Game Design Notes

The game implements a time-based simulation where players queue actions and the game processes them over time. Key gameplay elements include:

- **Selling**: Finished pieces go out on the roadside for-sale stand, where passing customers buy them at fair value for money and reputation, each sale celebrated with a reward flight (see `src/game/stand.ts`)
- **Machine Operations**: Transform raw materials into finished products
- **Shop Layout**: Physical space management affects workflow efficiency
- **Economic Progression**: Purchase better machines and expand workshop space

See the "Design vision" section of `README.md` for the game's guiding principles; designs for unbuilt features live in GitHub issues.
