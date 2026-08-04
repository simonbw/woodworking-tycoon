# Handing Work Over — Delivery & The Payoff Moment

How finished work leaves the shop, and what the player gets for it.

**Status: implemented.** The matching and gating rules live in
`src/game/delivery.ts`, the trip card in
`src/components/shop-overlay/TruckPrompt.tsx`, the geometry in
`src/game/lot.ts`, and the celebration in `src/components/payout/`.

## Why

Both income tracks used to end in a button. A commission was "Mark
Complete" on the corkboard work order; a job was "Deliver" inside the
phone. Either one checked `player.inventory`, filtered the matching items
out, and added money. The object you had just spent twenty minutes making
vanished out of your hands, two numbers changed in the top bar, and that
was the whole event.

Two things were wrong with that, and they're separable:

- **It had no place.** Every other system in the game had been pulled onto
  the floor — machines lost their control panels, buying became a trip,
  selling became a phone you hold — and commission turn-in was the last
  surviving menu button that converted inventory into money. On the one
  thing `GAMEPLAY_ROADMAP.md` calls a boss.
- **It had no ceremony.** The roadmap's "milestone moment" was a dry
  stinger and two numbers ticking over somewhere the player wasn't looking.

The fix is deliberately *not* more friction. Commissions are the authored,
linear track; all the decision content is upstream in figuring out how to
build the thing. Turn-in should stay fast. What it needed was a **place**
and a **moment**.

## Delivery: the truck

Finished work leaves the way everything arrives: in the pickup backed up
to the garage door. A delivery is two short walks —

1. **Load the bed.** Carry the piece out the door and press <kbd>F</kbd>
   at the tailgate (`loadTruckBedAction`); the cargo visibly rides in the
   bed. `E` lifts it back out if you change your mind.
2. **Drive it off.** Walk down to the cab and press <kbd>E</kbd>. The
   trip card lists two kinds of numbered row:
   - **Places to go** — the shopping trips and scavenging errands. Listed
     first so their numbers never move: Orange Box is always `1`.
   - **Work to deliver** — the active commission and every accepted job
     whose deliverables are loaded in the bed *right now*.

The row number delivers it. There is no completion button anywhere else
in the game.

### The rule

`canHandOff` (`delivery.ts`) is the real body state:

- home (not away on a trip),
- standing at the truck's cab (`atTruckCab`, lot.ts),
- no machine over your shoulders,

and `readyHandoffs` matches against `truck.bed`, not the hands. It's
enforced inside `completeCommissionAction` and `deliverJobAction`, not
just in `TruckPrompt` — *where* a delivery can happen is a game rule, not
a UI detail.

`resolveInteract` consults `readyHandoffs().length` as well as the unlock
flags, because the very first commission is delivered **before any
destination is unlocked**. Without that, the cab would refuse to answer
for the tutorial's first payday.

The clipboard, tracker chip, and job rows pool hands + bed for their
have/need counts (`commissionLineItems`), so loading the piece never
makes an order look short — and their ready lines are staged: "load it
into the truck's bed" once it's built, "deliver from the cab" once it's
loaded.

### One matcher, not two

`completeCommissionAction` and `deliverJobAction` had drifted apart with
~30 duplicated lines of match-and-consume. Both now call
`consumeRequiredMaterials`, which returns the pool minus exactly what
the order asked for, or `null` when it's short. It never counts one item
toward two requirements — two lines each wanting one shelf need two
shelves.

### Commissions vs. jobs

Same verb, same truck. The tier difference lives in the *response*, not
the mechanism: a job is a customer taking a box, a commission gets the
card below. Two different physical rituals would have been more system
than the distinction is worth.

### The performance

`player.away` still flips the instant a row is picked; the departure and
arrival rolls are pure theater layered on top (`truckStageStore` +
`TripTransitionLayer`, scored by the `truck-start`/`truck-arrive` clips
— see `docs/sound-design.md`). Delivery itself is instant: pick the row,
the payout lands, no timed trip. A timed delivery run would change pacing
across the whole progression ledger and stays future work.

## The payoff moment

Pure reducers can't animate, so a completed handoff queues a `PayoutEvent`
onto `gameState.pendingPayouts` — the same bridge shape as `SoundEvent`,
transient and never persisted (a reload must not replay the cha-ching).
`RewardFlightLayer` drains it and stages the celebration:

1. **The client's card** (commissions only). Who took delivery and what
   they said, dealt onto the screen as a signed-off work order, with the
   payout itemized: money, reputation, craft XP. Every entry in
   `COMMISSION_SEQUENCE` authors a `client` and a `thanks` line; Priya and
   Chef Anton recur, so the sequence has a little shape to it. Jobs skip
   this — routine work doesn't get a speech.
2. **The reward flight.** Dismissing the card (or, for a job, the handoff
   itself) bursts coins, a star, and a spark from the middle of the screen
   toward the readouts that track them. Coin count scales with the size of
   the payday. Each lands with a thump on its target, and the first coin
   fires the cha-ching (`cash-register.ogg`).

The numbers themselves changed the instant the action ran — the flight is
decoration over an already-settled state, so nothing in the presentation
layer can desync it.

### Targets

Chips fly to whatever carries `data-reward-target`:

| Target       | Element                      |
| ------------ | ---------------------------- |
| `money`      | the NavBar balance           |
| `reputation` | the NavBar reputation readout |
| `xp`         | the NavBar Skills button     |

Reputation moved out to the NavBar as part of this: it gates lumber
channels, job slots, and pricing power, and it was only ever visible
inside the phone. You should be able to watch the star land.

`RewardFlightLayer` measures each target with `getBoundingClientRect` at
launch time (the top bar reflows, so the vector can't be precomputed) and
silently drops any chip whose target isn't mounted rather than flinging it
at a corner.

## Consequences elsewhere

- The `complete-commission` shortcut (<kbd>C</kbd>) is gone. The cab rows
  answer to <kbd>1</kbd>–<kbd>9</kbd> instead.
- The corkboard work order names the client and points at the truck; the
  phone's accepted-job rows keep **Cancel** but lost **Deliver**.
- Jobs no longer fire the big `commission-complete` stinger — that was
  always wrong for routine work. Their whole audio is the cha-ching.
- The garage door itself is now just the opening you walk through —
  `isAtShopDoor` and the door card are gone, along with the hazard-paint
  landing zone (crates ride in the bed instead of blocking the door).

## Future work

- **A carry cost — landed.** The hands now hold `HAND_CAPACITY` pieces
  (`src/game/Person.ts`), enforced in every pickup action, so a job
  bigger than an armful takes trips to the tailgate and the bed is where
  big hauls ride. The bed itself stays unbounded on purpose: hauling is
  the truck's job, the trips to it are the player's.
  `getMaterialInventorySize` is still called from nowhere — it's the
  finer, footprint-based model (a pallet fills the arms, thin rails
  don't) if a flat count ever needs replacing.
- **A timed delivery run.** The truck could actually drive off with the
  goods and come back — diegetically stronger, but it reshapes pacing and
  every rung of the progression ledger.
- **Listings** still vanish from inventory into an abstraction when listed
  (see `docs/marketplace-and-jobs.md`). The "packed boxes by the door" idea
  now has a truck bed worth stacking them in.
