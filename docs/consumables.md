# Consumables

Shop supplies — nails, finishes, and eventually glue, screws, and sandpaper —
are **consumables**: quantities in a single shop-wide stock
(`GameState.consumables`), not physical items carried around the shop. The
system lives in `src/game/Consumable.ts`.

## How they flow

- **Buying**: the store's supplies aisle sells packs
  (`ConsumableType.packName/packSize/packPrice`,
  `buyConsumablePackAction`). Stock lands directly in the shop-wide pool.
- **Spending**: operations declare `requiredConsumables` (amount per
  recipe). The amounts are checked before an operation can start and
  deducted the moment it does — no refunds; the glue is out of the bottle.
  `machineCanOperate` takes the stock so the Operate button and the spec
  sheet's red supplies line stay honest.
- **Salvage**: operation outputs can declare `consumableOutputs`, which are
  added to the stock on completion. Dismantling a pallet returns one nail
  per board freed, so the rustic pallet shelf (8 nails) stays buildable for
  free off a single pallet (14 boards → 14 nails).

## Current consumables

| id           | unit   | consumers                     | sources                      |
| ------------ | ------ | ----------------------------- | ---------------------------- |
| `nails`      | nails  | Build Rustic Pallet Shelf (8) | store pack (50), salvage     |
| `screws`     | screws | Build Rustic Planter Box (8)  | store pack (50) — no salvage |
| `mineralOil` | oz     | Oil Cutting Board (4)         | store bottle (16 oz)         |

Screwed assembly is the drill's trade the way nailed joinery is the
hammer's (`src/game/tools/drill.ts`); unlike nails, screws never come back
as pallet salvage, so they're a true money sink.

Planned next: glue (all glue-ups), sandpaper (sanding passes), and the
film finishes (hard wax oil, lacquer, poly).

## Clamps: the returnable pool

Clamps (`src/game/Clamp.ts`) are the counterpart to consumables: **borrowed,
not spent**. `GameState.clamps` is how many the shop owns, bought one bar at
a time from the supplies aisle (`CLAMP_COST`, `buyClampAction`) — no pack
size, because you buy each clamp once.

An operation declares `Operation.requiredClamps`; every glue-up does
(2 for a pair, 3 to add a strip, 4 for a panel or an end-grain blank, 6 to
join two panels). The count is checked against the **free** clamps before
the operation can start, and released when it finishes.

Nothing is deducted at checkout. The number in use is **derived** from the
machines currently mid-operation (`clampsInUse`), so:

- it can't drift out of sync with the machines that hold them,
- it survives save/load with no extra persisted field, and
- the clamps come back on their own when the cure ends, even if the player
  was away when it happened.

`clampsFree(owned, machines)` is what the Operate button, the bench sheet's
clamp line, and the manifest's supply sheet all read.

The economy: a glue-up holds its clamps through the whole run — the short
attended Glue & Clamp _and_ the long hands-free cure — so the rack is what
decides how many glue-ups can be curing at once. Owning more clamps is a
money→throughput dial alongside owning more benches (see
docs/tools-and-surfaces.md).

## The hammer

Nailed joinery is gated by the **hammer**, the starter tool — every new
game begins with one mounted on the workspace (which has 2 tool slots so a
sander can join it). Recipes that need a hammer _are_ hammer operations
(`src/game/tools/hammer.ts`), the same pattern as the sanders and the
crosscut sled: no hammer at the station, no nailed recipes in its Mode
list.

## Finishes

`FinishedProduct.finish` (optional `Finish`, `src/game/Materials.ts`)
records an applied finish; absent means raw wood. Oiling is a workspace
operation with an attended wipe-down and a hands-free soak (the second
consumer of operation phases after glue curing). Finished pieces sell for
`FINISH_VALUE_MULTIPLIER` (mineral oil: ×1.25) and read as "Oiled …" in
material names. Cutting boards only take mineral oil — food safety is the
rule that keeps fancier film finishes (coming later) off them.
