# The truck and trips

Everything the shop brings home rides in the truck — the
pickup backed up to the garage door on the walkable lot outside
(`TruckPrompt`; lot geometry in `src/game/lot.ts`, and the camera
follows the player out — `shop-view/CameraLayer`). This is the
cross-cutting doc for the trip system, which spans the cab menu, the
per-destination overlays, and the departure staging. Trips go out for
shopping and scavenging; finished work never rides along — it sells
off the for-sale stand (`src/game/stand.ts`).

## The bed carries all physical cargo

`GameState.truck` is the bed's contents. Purchases and scavenged
pallets ride home in it and are lifted out at the tailgate. Bought
machines arrive crated in the bed the same way (see
`src/game/game-actions/machine-actions.ts`) — the player carries them
into place; there is no separate layout editor.

## The cab menu

Standing at the cab lists numbered rows of places to go: shopping
trips (`AwayTrip`s of kind `shopping`) to the Orange Box store
(`StoreTripOverlay`) or the Sawyer & Sons lumberyard
(`LumberyardTripOverlay`, reputation-gated), and pallet scavenging
(`ScavengeTripOverlay`): a stop-by-stop circuit steered from the cab —
each search costs game time and reveals a stop's result, then the
player keeps searching or heads home, daylight permitting.

## A shopping trip ends at a register

Shelves fill a cart rather than transacting a tile at a time: the cart
hangs off the `shopping` trip itself (`ShoppingTrip.cart`), so driving
away is what empties it, and the one press that pays for it also drives
home. The line shapes are in `src/game/cart.ts` and the fold through
the ordinary buy actions is in
`src/game/game-actions/cart-actions.ts` — those buy actions still own
where a purchase lands, and the cart only decides when.

## Departure and arrival staging

Trips open and close with a pure-presentation departure/arrival
performance: `truckStageStore` + `shop-view/TripTransitionLayer`, scored
by the `truck-start`/`truck-arrive` clips. Nothing about the trip's
state lives in the staging — it is a curtain, not a phase.

Because it is a curtain, no game time passes behind it: the `Ticker`
holds the clock while one is playing. What a trip costs is booked
explicitly by its actions, so a curtain that also spent minutes would
charge the drive twice — and a leg timed from the moment `away` flips
would be half over before its overlay reached the screen.
