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
trips (`AwayTrip`s of kind `shopping`) to the Orange Box store or the
Sawyer & Sons lumberyard (`LumberyardTripOverlay`, reputation-gated),
and pallet scavenging (`ScavengeTripOverlay`): a stop-by-stop circuit
steered from the cab — each search costs game time and reveals a
stop's result, then the player keeps searching or heads home, daylight
permitting.

## The Orange Box is a place you walk

A trip to the store swaps the canvas from the shop to the store
(`HomePage` → `components/store-view/StoreView`): the same walking
body, camera, and canvas machinery drawing a different venue. The
floor plan is a planogram generated from the registries
(`src/game/store-layout.ts`), laid out in aisles: lumber and sheet
goods down aisle 1 as per-SKU floor piles (solid — merchandise is
walked to, not through; the cut panels pack three deep along
mini-aisles off aisle 1), full-size machine displays flanking aisle
2, supplies down aisle 3, hand tools on the back wall. The view runs
at the garage's own zoom (the camera pans both axes), and the front
wall has separate entrance and exit openings with the wayfinding
stenciled on the slab. The merchandise draws with the shop's own
sprites (`StoreMerchandiseLayer`, cached as one texture because a
floor of procedural grain is heavy). The trip itself carries the
shopper's cell (`ShoppingTrip.position` — `player.position` keeps
meaning the cell underfoot back home), and the keys mirror the shop
floor's (`src/game/store-interact.ts`): every product is its own bay
— E puts one in the cart, F puts one back, E at the register opens
the receipt card, and E at the cab is the way home. How long a trip
takes is how long you browse — the clock idles along under it
(`time-flow.ts`).

The lumberyard is still a menu overlay; it becomes the second walkable
venue by running the same planogram generator with its own channels.
The store's old menu overlay survives behind the `?website` URL flag
as the future Orange Box website (issue #200) and is otherwise
unreachable.

## A shopping trip ends at a register

Shelves fill a cart rather than transacting a tile at a time: the cart
hangs off the `shopping` trip itself (`ShoppingTrip.cart`), so driving
away is what empties it. The line shapes are in `src/game/cart.ts` and
the fold through the ordinary buy actions is in
`src/game/game-actions/cart-actions.ts` — those buy actions still own
where a purchase lands, and the cart only decides when. At the
walkable store the register opens a receipt card
(`StoreCheckoutModal`): Buy pays, the goods land in the bed, and the
truck pulls out of its stall while the screen heads home — there is
no paying and carrying on shopping. Walking out on a full cart is
still the cab's E, which asks first. The lumberyard's overlay still
pays and drives home in one press.

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
