# The engine

`src/core` is the game engine: entities and their lifecycle, the
tick/render split, the PIXI renderer and camera, input, and sound. It
knows nothing about woodworking.

## The socket

The engine asks questions the game answers — what render layers exist
and in what order, what tick layers, what custom events, what asset
names. Those answers live in exactly two places:

- `src/config/` — the layer tables, the tick-layer order, the custom
  event map, the persistence levels
- `src/resources/` — the generated image/sound/font name unions

These two socket modules are the **only** things outside `src/core`
that engine code may import, and they hold types and tables only: they
may import core (their tables are built from core's types) and may
reach game code with `import type`, never at runtime. Everything else
in the repo imports core freely; nothing else is ever imported by core.

Both directions are enforced by `src/import-boundaries.test.ts`.

Starting a new game on this engine means copying `src/core` and writing
a fresh `src/config` and `src/resources` — the socket is the whole
interface.
