# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Woodworking Tycoon is an idle/simulation game built with React and TypeScript. The game simulates running a woodworking shop where players manage materials, machines, and commissions to make money and build reputation.

## Development Commands

- **Build production**: `npm run build`
- **Development server**: `npm run dev` (serves on port 3001 by default, configurable via ES_BUILD_DEV_PORT)
- **Type checking**: `npm run tsc`
- **Code formatting**: `npm run format`
- **E2E Testing**: `npm run test` (runs Playwright tests on port 3002, starts its own server)

### Testing Guidelines for Claude

**IMPORTANT**: Claude should NEVER run `npm run dev` directly. The user manages the dev server.

For testing changes:

- Use `npm run test` to run automated E2E tests (fast, comprehensive validation)
- Ask the user to test manually if more complex validation is needed
- The test suite validates core functionality including UI rendering, game state, and recent fixes

## Architecture Overview

### Core Game Architecture

The game follows a state-driven architecture with clear separation between game logic and UI:

- **GameState** (`src/game/GameState.ts`): Core game state interface containing all simulation data (money, materials, machines, commissions, etc.)
- **Game Actions** (`src/game/game-actions/`): Pure functions that transform game state
- **Components** (`src/components/`): React components for UI, organized by feature areas

### Key Systems

1. **State Management**: Uses React Context via `GameStateProvider` (`src/components/useGameState.tsx`)
2. **Game Loop**: Managed by `Ticker` component for regular game updates
3. **UI Modes**: Three main screens controlled by `UiModeProvider`:
   - `normal`: Main game view (`HomePage`)
   - `store`: Shopping interface (`StorePage`)
   - `shopLayout`: Machine placement interface (`LayoutPage`)

### Material and Machine System

- **Materials** (`src/game/Materials.ts`): Wood types and their properties
- **Machines** (`src/game/Machine.ts`): Woodworking equipment with input/output specifications
- **Operations**: Each machine can perform specific operations transforming materials
- **Material Piles**: Physical placement of materials in the shop space

### Rendering Architecture

The game uses PIXI.js via `@pixi/react` for performant 2D rendering of the shop view, combined with traditional React/Tailwind for UI overlays. This hybrid approach allows smooth interaction with many game objects while maintaining rich UI components.

## File Organization

```
src/
├── components/          # React components
│   ├── shop-view/      # Main game area rendering
│   ├── store-page/     # Equipment purchasing
│   ├── current-cell-info/ # Inspector panels
│   ├── machine-sprites/ # PIXI machine renderers
│   └── material-sprites/ # PIXI material renderers
├── game/               # Core game logic
│   ├── game-actions/   # State transformation functions
│   ├── machines/       # Machine type definitions
│   └── *.ts           # Game entities and helpers
├── utils/              # Shared utilities
└── styles/            # CSS and styling
```

## Key Technical Details

- **Build System**: esbuild with custom configuration (`esbuild-client.config.mjs`)
- **Styling**: Tailwind CSS with custom brown color palette and lumberjack theming
- **Asset Pipeline**: Static assets in `static/` are copied to `dist/` during build
- **Development**: Live reload enabled via esbuild's serve mode
- **Type Safety**: Strict TypeScript with comprehensive type definitions

## Development Guidelines

- All game state mutations should go through the action system in `src/game/game-actions/`
- New machines should be added to `src/game/machines/` with corresponding sprites in `src/components/machine-sprites/`
- UI components should use the existing design system (Tailwind + custom brown theme)
- Performance considerations: The game renders many objects, so prefer PIXI components for game entities and React for UI overlays

## Game Design Notes

The game implements a time-based simulation where players queue actions and the game processes them over time. Key gameplay elements include:

- **Commission System**: Players fulfill orders for money and reputation
- **Machine Operations**: Transform raw materials into finished products
- **Shop Layout**: Physical space management affects workflow efficiency
- **Economic Progression**: Purchase better machines and expand workshop space
