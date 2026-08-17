# Interacting on the shop floor

How the player targets and acts on things in the shop view — the
highlight, the hint chips, the station sheets, and the mouse's role.
This is the cross-cutting doc for a system that spans the world-pinned
DOM overlay (`src/shell/hud/overlay/`), the station chrome
(`src/shell/hud/station/`), the keys (`src/game/shortcuts.ts` for the
registry, `src/shell/dispatch/` for what answers them), and the
canvas-side hit-testing (`src/views/MousePicking.ts`). The bench
view's pointer-as-hand interaction is its own system — see
`docs/bench-work.md`.

## Standing at things

The machine the player stands at is highlighted in the shop view (an
amber outline shader, `src/views/TargetHighlightView.ts`) and wears hint
chips naming its live keys (E interacts, F sets stock down, hold Space
to run a power machine, Z/X and R for its settings). The pile E would
pick up wears the same outline with its own `[E] pick up` chip. A hint
cluster follows the player for the remaining floor verbs.

Which of those a station actually wears depends on whether it's worked
from the floor at all (`Machine.hasFloorControls`). A direct-feed machine
is — the floor is its entire interface, so it carries its settings, its
refusals, and the Space hold. So does the garbage can: Space empties it
where it stands. A **bench doesn't**: since the bench view took hand work
over (`docs/bench-work.md`), a bench out here is a table. It wears its
name, the verbs that move stock on and off it, `[B] carry`, and
`[Tab] use` — no plan, no scales, no trigger — and the keys behind those
missing chips are unbound rather than silently live.

Benches and containers open a centered station sheet (Tab) holding
plans, racks, and contents; direct-feed machines have no sheet beyond
their accessories rack.

What's carried rides a HUD strip at bottom-center (`HandsStrip`, click
a slot to set one down); the supply tally floats bottom-right
(`SuppliesSection`).

## The mouse is the eye, the keyboard the hands and feet

Standing at a thing is what makes the spatial layer matter, so the
cursor never acts at a distance — it chooses _among_ what the body can
already reach:

- Hovering a reachable machine or a piece of stock in reach makes it
  the target (the pointing version of the G/R cycle keys).
- Right-click opens whatever is under it: a station's sheet, or a card
  listing every piece in reach (`shell/hud/overlay/FloorSheet.tsx`), since a
  stack is otherwise opaque from above.
- In the bench view, where the pointer _is_ the hand, right-click
  instead puts back whatever it's holding.

Machines are hit-tested against their footprints rather than their art
(`src/views/MousePicking.ts`) — texture art has no geometry to test
against, and a board lying across a machine should outrank it.

## Bindings teach themselves

Mouse bindings live in the same registry as the keys (`buttons` on a
`ShortcutDef`) so they appear in the `?` cheat sheet automatically; the
floating hint chips stay keyboard-only. `worldTarget` marks the
bindings the hit sprite dispatches rather than `ShortcutProvider`.
