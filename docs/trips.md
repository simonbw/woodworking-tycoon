# The truck and trips

Everything that enters or leaves the shop rides in the truck — the
pickup backed up to the garage door on the walkable lot outside
(`TruckPrompt`; lot geometry in `src/game/lot.ts`, and the camera
follows the player out — `shop-view/CameraLayer`). This is the
cross-cutting doc for the trip system, which spans the cab menu, the
per-destination overlays, the delivery actions, and the departure
staging. Single-module details live at their modules: what satisfies an
order in `src/game/delivery.ts`, the drive cost and payout flow in
`src/game/game-actions/delivery-actions.ts`.

## The bed carries all physical cargo

`GameState.truck` is the bed's contents. Purchases and scavenged
pallets ride home in it and are lifted out at the tailgate; finished
work is loaded into it (F at the tailgate) before delivery. Bought
machines arrive crated in the bed the same way (see
`src/game/game-actions/machine-actions.ts`) — the player carries them
into place; there is no separate layout editor.

## The cab menu

Standing at the cab lists numbered rows in two groups:

- **Places to go** — shopping trips (`AwayTrip`s of kind `shopping`) to
  the Orange Box store (`StoreTripOverlay`) or the Sawyer & Sons
  lumberyard (`LumberyardTripOverlay`, reputation-gated), and pallet
  scavenging (`ScavengeTripOverlay`): a stop-by-stop circuit steered
  from the cab — each search costs game time and reveals a stop's
  result, then the player keeps searching or heads home, daylight
  permitting.
- **Work to deliver** — out of the bed.

## Delivery is a trip like any other

Finished work — commissions and job-board jobs alike — only leaves the
shop through the truck; there is no "mark complete" button. What
satisfies an order is `src/game/delivery.ts`. The truck drives out with
the bed loaded, the slip shows at the customer's
(`DeliveryTripOverlay`), and the payout lands when it pulls back in.
Both legs are charged at the same `DRIVE_TICKS_ONE_WAY` a store run
costs (`src/game/game-actions/delivery-actions.ts`).

## Departure and arrival staging

Trips open and close with a pure-presentation departure/arrival
performance: `truckStageStore` + `shop-view/TripTransitionLayer`, scored
by the `truck-start`/`truck-arrive` clips. Nothing about the trip's
state lives in the staging — it is a curtain, not a phase.
