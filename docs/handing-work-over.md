# Handing Work Over — Delivery & The Payoff Moment

How finished work leaves the shop, and what the player gets for it.

**Status: implemented.** The matching and gating rules live in
`src/game/delivery.ts`, the door card in
`src/components/shop-overlay/DoorPrompt.tsx`, and the celebration in
`src/components/payout/`.

## Why

Both income tracks used to end in a button. A commission was "Mark
Complete" on the corkboard work order; a job was "Deliver" inside the
phone. Either one checked `player.inventory`, filtered the matching items
out, and added money. The object you had just spent twenty minutes making
vanished out of your hands, two numbers changed in the top bar, and that
was the whole event.

Two things were wrong with that, and they're separable:

- **It had no place.** Every other system in the game had been pulled onto
  the floor — machines lost their control panels, buying became a trip out
  the garage door, selling became a phone you hold — and commission turn-in
  was the last surviving menu button that converted inventory into money.
  On the one thing `GAMEPLAY_ROADMAP.md` calls a boss.
- **It had no ceremony.** The roadmap's "milestone moment" was a dry
  stinger and two numbers ticking over somewhere the player wasn't looking.

The fix is deliberately *not* more friction. Commissions are the authored,
linear track; all the decision content is upstream in figuring out how to
build the thing. Turn-in should stay fast. What it needed was a **place**
and a **moment**.

## Delivery: the garage door

Finished work leaves through the door it came in by. Machines already
arrive there as delivery crates (`deliverMachineCrate`); now work goes out
the same way.

Standing at the entrance and pressing <kbd>E</kbd> spreads open the door
card, which carries two kinds of numbered row:

1. **Places to go** — the shopping trips and scavenging errands. Listed
   first so their numbers never move: Orange Box is always `1`, whatever
   you happen to be carrying.
2. **Work to hand over** — the active commission and every accepted job
   whose deliverables are in the player's hands *right now*.

The row number hands it over. There is no completion button anywhere else
in the game.

### The rule

`canHandOff` (`delivery.ts`) is the same body state as walking out:

- home (not away on a trip),
- standing at the garage door (`isAtShopDoor`),
- no machine over your shoulders.

It's enforced inside `completeCommissionAction` and `deliverJobAction`,
not just in `DoorPrompt` — *where* a delivery can happen is a game rule,
not a UI detail.

`resolveInteract` consults `readyHandoffs().length` as well as the unlock
flags, because the very first commission is handed over **before any
destination is unlocked**. Without that, the door would refuse to open for
the tutorial's first payday.

### One matcher, not two

`completeCommissionAction` and `deliverJobAction` had drifted apart with
~30 duplicated lines of match-and-consume. Both now call
`consumeRequiredMaterials`, which returns the inventory minus exactly what
the order asked for, or `null` when the player is short. It never counts
one item toward two requirements — two lines each wanting one shelf need
two shelves.

### Commissions vs. jobs

Same verb, same door. The tier difference lives in the *response*, not the
mechanism: a job is a customer taking a box, a commission gets the card
below. Two different physical rituals would have been more system than the
distinction is worth.

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
| `xp`         | the NavBar Journal button    |

Reputation moved out to the NavBar as part of this: it gates lumber
channels, job slots, and pricing power, and it was only ever visible
inside the phone. You should be able to watch the star land.

`RewardFlightLayer` measures each target with `getBoundingClientRect` at
launch time (the top bar reflows, so the vector can't be precomputed) and
silently drops any chip whose target isn't mounted rather than flinging it
at a corner.

## Consequences elsewhere

- The `complete-commission` shortcut (<kbd>C</kbd>) is gone. The door rows
  answer to <kbd>1</kbd>–<kbd>9</kbd> instead.
- The corkboard work order names the client and points at the door; the
  phone's accepted-job rows keep **Cancel** but lost **Deliver**.
- Jobs no longer fire the big `commission-complete` stinger — that was
  always wrong for routine work. Their whole audio is the cha-ching.

## Future work

- **A carry cost.** `getMaterialInventorySize` is written and called from
  nowhere: the player's hands are unbounded, so the walk to the door is
  currently a formality rather than a trip. Wiring the cap up is what would
  make a four-board job weigh something and give the job tip timer
  something to bite on. Deliberately out of scope here — it's a balance
  change with blast radius well beyond delivery.
- **A pickup visual.** Someone actually appearing at the door to take the
  goods, rather than the card standing in for them.
- **Listings** still vanish from inventory into an abstraction when listed
  (see `docs/marketplace-and-jobs.md`). The "packed boxes by the door" idea
  now has a door worth stacking them by.
