# Interacting on the shop floor

How the player targets and acts on things in the shop view — the
highlight, the hint chips, the station sheets, and the mouse's role.
This is the cross-cutting doc for a system that spans the DOM overlay
(`src/components/shop-overlay/`), the station chrome
(`src/components/station/`), the shortcut registry
(`src/game/shortcuts.ts`), and the shop view's hit-testing. The bench
view's pointer-as-hand interaction is its own system — see
`docs/bench-work.md`.

## Standing at things

The machine the player stands at is highlighted in the shop view (an
amber outline shader, `shop-view/targetHighlight.ts`) and wears hint
chips naming its live keys (E interacts, F sets stock down, hold Space
to run a power machine, Z/X and R for its settings). The pile E would
pick up wears the same outline with its own `[E] pick up` chip. A hint
cluster follows the player for the remaining floor verbs.

"Standing at" is `Machine.operationZone`: the machine's operation cell
plus its neighbors, because a body is wider than a 1-ft cell. That cell
is the near one — it touches the footprint (`MachineType.operationPosition`,
asserted in `machine-collision.test.ts`), so the apron never reaches
past where the work is actually in hand. A machine that wants more room
than that to stand and swing asks for it in `freeCellsNeeded`, which is
a placement rule and not a targeting one.

Settings chips are a direct-feed machine's, since the floor is that
machine's whole interface. A bench wears none: its work is chosen and
dialed inside the bench view, where the mark measures the cut and a
plan's settings ride the pulled drawing (see `docs/bench-work.md`).

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
  listing every piece in reach (`shop-overlay/FloorSheet.tsx`), since a
  stack is otherwise opaque from above.
- In the bench view, where the pointer _is_ the hand, right-click
  instead puts back whatever it's holding.

Machines are hit-tested through invisible footprint shapes drawn under
the loose stock (`shop-view/MachineHitTargets.tsx`) — texture art has
no geometry to test against, and a board lying across a machine should
outrank it.

## Bindings teach themselves

Mouse bindings live in the same registry as the keys (`buttons` on a
`ShortcutDef`) so they appear in the `?` cheat sheet automatically; the
floating hint chips stay keyboard-only. `worldTarget` marks the
bindings the hit sprite dispatches rather than `ShortcutProvider`.
