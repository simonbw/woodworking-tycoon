# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Woodworking Tycoon is an idle/simulation game built with React and TypeScript. The game simulates running a woodworking shop where players manage materials, machines, and commissions to make money and build reputation.

## Development Commands

- **Build production**: `npm run build`
- **Development server**: `npm run dev` (serves on port 3001 by default, configurable via ES_BUILD_DEV_PORT)
- **Type checking**: `npm run tsc`
- **Code formatting**: `npm run format`
- **All tests**: `npm run test` (runs unit then E2E)
- **Unit tests only**: `npm run test:unit` (`tsx --test` against `src/**/*.test.ts`)
- **E2E tests only**: `npm run test:e2e` (Playwright on port 3002 — starts its own dev server)
- **E2E headed**: `npm run test:headed`

### Testing Guidelines for Claude

**IMPORTANT**: Claude should NEVER run `npm run dev` directly. The user manages the dev server.

For testing changes:

- Use `npm run test` for full validation, or `test:unit` / `test:e2e` to target one tier
- Ask the user to test manually if more complex validation is needed

### Testing Style

- **Unit tests** (`src/**/*.test.ts`, `node:test` via `tsx`) should be small and focused — one behavior per `it()`.
- **E2E tests** (`tests/*.spec.ts`, Playwright) should be **fat** — one `test()` walks through many related assertions to amortize browser startup. Use `test.step('label', async () => {...})` inside the test so failure reports identify which step broke. Do not split fat E2E tests just to get better failure attribution; `test.step` solves that.
- **Test fixtures** (`tests/fixtures/`) provide preset `GameState` objects loaded into the running app via `FixtureLoader` — use these to set up complex initial states (e.g. `layout-with-placed-machines`) instead of clicking through the UI to build them.

## Architecture Overview

### Core Game Architecture

The game follows a state-driven architecture with clear separation between game logic and UI:

- **GameState** (`src/game/GameState.ts`): Core game state interface containing all simulation data (money, materials, machines, commissions, etc.). Includes a `ProgressionState` slice for the persistent unlock state.
- **Game Actions** (`src/game/game-actions/`): Pure functions that transform game state
- **Save/Load** (`src/game/saveLoad.ts`): Serializes the persistent slice of `GameState` to/from JSON for browser storage
- **Components** (`src/components/`): React components for UI, organized by feature areas

### Key Systems

1. **State Management**: Uses React Context via `GameStateProvider` (`src/components/useGameState.tsx`)
2. **Game Loop**: Managed by `Ticker` component for regular game updates
3. **UI Modes**: Main screens controlled by `UiModeProvider`:
   - `normal`: Main game view (`HomePage`)
   - `store`: Shopping interface (`StorePage`)
   - `shopLayout`: Machine placement interface (`LayoutPage`)
   - `marketplace`: Sell listings & job board (`MarketplacePage`)
   - `skills`: Skill tree (`SkillsPage`)

### Material and Machine System

- **Materials** (`src/game/Materials.ts`): Wood types and their properties; boards and panels carry a surface condition (rough → smooth → sanded)
- **Machines** (`src/game/Machine.ts`): Woodworking equipment with input/output specifications
- **Tools** (`src/game/Tool.ts`, `src/game/tools/`): Handheld tools that mount into a workstation's tool slots and add operations there (see `docs/tools-and-surfaces.md`)
- **Operations**: Each machine can perform specific operations transforming materials; a station's operation list combines its own operations with its mounted tools'
- **Consumables** (`src/game/Consumable.ts`): Shop-wide supplies (nails, finishes) that operations consume and salvage can return (see `docs/consumables.md`)
- **Material Piles**: Physical placement of materials in the shop space

### Rendering Architecture

The game uses PIXI.js via `@pixi/react` for performant 2D rendering of the shop view, combined with traditional React/Tailwind for UI overlays. This hybrid approach allows smooth interaction with many game objects while maintaining rich UI components.

## File Organization

```
src/
├── components/            # React components
│   ├── shop-view/         # Main game area rendering (PIXI)
│   ├── store-page/        # Equipment purchasing UI
│   ├── layout-page/       # Machine placement / layout editor UI
│   ├── current-cell-info/ # Inspector panels
│   ├── machine-sprites/   # PIXI machine renderers
│   ├── material-sprites/  # PIXI material renderers
│   └── *.tsx              # Top-level UI (ActionBar, NavBar, HomePage, Ticker, …)
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
- **Styling**: Tailwind CSS with a "paperwork" design system (paper/manila surfaces, ink text colors, typewriter/stencil/condensed fonts) defined in `tailwind.config.ts`. The legacy brown palette is retained only for sprites/older components.
- **Asset Pipeline**: Static assets in `static/` are copied to `dist/` during build
- **Development**: Live reload enabled via esbuild's serve mode
- **Type Safety**: Strict TypeScript with comprehensive type definitions

## Development Guidelines

- All game state mutations should go through the action system in `src/game/game-actions/`
- New machines should be added to `src/game/machines/` with corresponding sprites in `src/components/machine-sprites/`
- UI components should use the existing "paperwork" design system (paper/manila/ink tokens and workshop chrome from `tailwind.config.ts`) — not the legacy brown palette, which is kept only for sprites
- Performance considerations: The game renders many objects, so prefer PIXI components for game entities and React for UI overlays

## Game Design Notes

The game implements a time-based simulation where players queue actions and the game processes them over time. Key gameplay elements include:

- **Commission System**: Players fulfill orders for money and reputation
- **Machine Operations**: Transform raw materials into finished products
- **Shop Layout**: Physical space management affects workflow efficiency
- **Economic Progression**: Purchase better machines and expand workshop space

See `GAMEPLAY_ROADMAP.md` for the full design vision (commission progression, tutorial sequence, late-game goals) and `docs/woodworking-features-brainstorm.md` for the broader feature pool.
