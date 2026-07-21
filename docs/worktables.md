# Worktables & the Makeshift Workbench — Design

The bench system: what you start with, what you build, and why you'd
bother. The guiding principle from `tools-and-surfaces.md` applies to
benches too — **a better bench buys time, it doesn't gate products**.
Every bench-style station shares one recipe list
(`BENCH_OPERATIONS` in `src/game/machines/benchOperations.ts`).

## The Makeshift Workbench (Now)

The starting station (id `workspace`, kept for save compatibility): a
plywood offcut over a few paint buckets — the real thing most woodworkers
start on, and the sprite shows it. It knows every bench recipe, has 2
tool slots, no shelf, and baseline work speed. It is never sold; it's
simply in the garage when you arrive.

## Worktables (Now)

Shop-built benches in four sizes — 1×1, 1×2, 1×3, and 2×2 — built at any
bench from plywood, stout boards (pallet stringers or 2×4s), and nails.
The build recipes live in the shared bench list with no skill gate:
building a real bench is every woodworker's first project. The output is
equipment, not product (`OperationOutput.machineOutputs`, the machine
sibling of the jigs' `toolOutputs`): the finished table lands in machine
storage and is placed from the layout editor.

A bare worktable improves on the makeshift workbench three ways:

1. **Work speed** (`MachineType.workSpeed`, 1.25): attended hand work —
   glue-and-clamp, assembly, hand planing, sanding — runs a quarter
   faster. Hands-free phases (glue curing) are unaffected; the clamps
   don't care where they sit. Applied in `getOperationPhases`, same
   pipeline as the dust slowdown.
2. **Tool slots**: 3/4/5/6 by size (cells + 2) vs. the workbench's 2.
3. **The shelf** (`MachineType.materialStorage`, 3 per cell): parked
   stock lives on `MachineState.storedMaterials` — out of the input
   bay, off the floor. Stow/take from the station card. Shelf stock
   rides along when a table moves, and dumps to the floor if the table
   is returned to storage.

More benches also parallelize hands-free work (more simultaneous glue
cures) — the "extra benches convert money into throughput" economy from
`tools-and-surfaces.md`.

## Benchtop machines mount on tables (Now)

The jobsite table saw, miter saw, lunchbox planer, and jointer are
benchtop machines (`MachineType.benchtop`) — each occupies one cell and
may be placed on a free worktable cell instead of the floor. Mounting is
per-cell: a planer on one end of a 1×3 leaves two cells of working top,
and the shelf below doubles as the machine's stand storage.

Rules (see `canPlaceMachine` / `CellMap`):

- One benchtop machine per table cell; the machine renders and operates
  on top (`CellInfo.machine`), the table underneath
  (`CellInfo.tableMachine`).
- A machine's required free cells (infeed/outfeed/operator) must be
  genuinely walkable — table top doesn't count.
- A table with machines mounted can't be moved or removed; take the
  machines off first.

## Upgrades (Now)

Worktables carry **upgrade slots** (`MachineType.upgradeSlots`: 1/2/3/3
by size — worktables only, the makeshift workbench stays humble).
Upgrades live in `src/game/Upgrade.ts`, are owned in
`GameState.storage.upgrades`, install/uninstall from the station card
(`MachineState.upgrades`), and their effects fold into the Machine
view's computed stats — anything reading a placed station's capacity or
speed goes through `machine.toolSlots` / `machine.materialStorage` /
`machine.workSpeed`, never the raw type. Duplicates stack (a front vise
and a tail vise is a real bench).

| Upgrade | Effect | Acquired |
|---|---|---|
| Bench Vise | ×1.25 attended work speed (stacks with the table's own ×1.25) | store, $80 — it's cast iron |
| Tool Drawers | +2 tool slots | built at a bench (plywood + thin boards + nails) |
| Material Shelf | +4 shelf spaces | built at a bench (two planks + nails) |

Shop-built upgrades arrive via `OperationOutput.upgradeOutputs` (the
upgrade sibling of `toolOutputs`/`machineOutputs`). Uninstalling is
refused while the station works, or when it would strand more mounted
tools / shelved stock than the remaining capacity holds. Removing a
table to storage returns its upgrades to upgrade storage, like tools.
The sprite shows the vise's jaws and the drawer fronts on the table's
front edge.

## Later

- **More upgrades**: bench dogs (another hand-work speed source),
  downdraft top (less sanding dust), clamp rack (shorter glue-and-clamp
  phases), pegboard backer (+tool slots, wall-adjacent tables only),
  outfeed extension (bonus to an adjacent feed-through machine),
  casters (move a loaded table, machines and all — deferred until the
  layout/moving rework).
- **Floor penalty for benchtop machines**: today a saw on the floor
  works at full speed; the incentive to mount is space-sharing and the
  shelf. If mounting should matter more, add a duration penalty for
  floor-placed benchtop machines.
- **Tool storage furniture** (wall racks, chests) from the
  tools-and-surfaces "Later" list — the shelf's sibling for tools.
