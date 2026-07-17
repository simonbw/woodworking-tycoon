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

| id           | unit  | consumers                       | sources                   |
| ------------ | ----- | ------------------------------- | ------------------------- |
| `nails`      | nails | Build Rustic Pallet Shelf (8)   | store pack (50), salvage  |
| `mineralOil` | oz    | Oil Cutting Board (4)           | store bottle (16 oz)      |

Planned next: glue (all glue-ups), screws (furniture arc), sandpaper
(sanding passes), and the film finishes (hard wax oil, lacquer, poly).

## The hammer

Nailed joinery is gated by the **hammer**, the starter tool — every new
game begins with one mounted on the workspace (which has 2 tool slots so a
sander can join it). Recipes that need a hammer *are* hammer operations
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
