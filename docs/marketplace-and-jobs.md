# Marketplace & Jobs — Selling System Redesign

Design doc for replacing free selling (the sales table) with a marketplace
listing system, and adding a second, generated tier of paid work ("jobs")
alongside the authored commission sequence.

**Status: implemented.** The sale model and listing actions live in
`src/game/marketplace.ts` and
`src/game/game-actions/marketplace-actions.ts`, job generation in
`src/game/job-generation.ts`, and the UI in
`src/components/marketplace-page/`. Notable deltas from the design below:
job offers carry a `materialCostFree` flag so the board refresh can enforce
the income-floor guarantee, raw stock shares one "lumber" demand bucket
instead of per-type buckets, and the Ticker is mounted on the Marketplace
tab so the sim keeps running while you browse.

## Why

Free selling today has no decisions in it: place any item on the sales table
and it converts to money on the next tick. It's a faucet, not a system. This
redesign replaces it with two interlocking systems that live in one new UI
surface — the **Marketplace tab**, the in-fiction equivalent of opening your
phone and browsing Craigslist / Facebook Marketplace / Etsy:

- **Listings**: put an item up for sale at a price *you choose*, and get paid
  only when a buyer bites. Sale chance is simulated from price, reputation,
  and demand.
- **Jobs**: generated one-off requests ("4 sanded oak boards, 3×4×1") you
  accept and fulfill for guaranteed money. They give guidance and steady
  income without advancing the story.

After this change the game has three income tracks with distinct roles:

| Track       | Pay vs. fair value | Guaranteed?         | Role                                        |
| ----------- | ------------------ | ------------------- | ------------------------------------------- |
| Commissions | ~3×                | Yes                 | Story progression, unlocks, boss paydays    |
| Jobs        | ~1.5–2× (+ tip)    | Yes                 | Guided grind, guaranteed price              |
| Listings    | You set the price  | No (probabilistic)  | Higher ceiling for skilled pricing/rep play |

## What we're keeping

- **The authored commission sequence** (`commissionSequence.ts`) is untouched:
  linear, story-driven, each entry introduces one new element, big money and
  reputation on completion. The word *commission* now refers exclusively to
  this track; generated work is a *job*.
- **`getSellValue()`** (`material-values.ts`) survives as the price anchor,
  but its meaning changes: it is no longer "what you get," it is **fair
  value** — what the market thinks an item is worth. All sale-chance math and
  job payouts are expressed relative to it, so the existing species / surface
  / finish tuning keeps paying off.
- **Reputation** and its existing sink (lumber channel gating in
  `lumberStock.ts`). This redesign adds new sources (job bonuses, sale
  reviews) and a new sink (pricing power on listings).
- **The tick simulation and the existing day concept** (600 ticks/day,
  already shown on the Ticker's calendar page). Sale rolls happen per tick;
  the job board refreshes daily. No richer calendar machinery until craft
  markets need it (see Future work).
- **Fulfillment from player inventory** via `materialMeetsInput`, exactly as
  `completeCommissionAction` does today. Jobs deliver, and listings list,
  what the player is carrying.
- **Scavenging errands**, currently gated on the `freeSelling` flag — they
  re-gate on the marketplace unlock (same unlock moment, see below).
- **The injectable-RNG pattern** from `scavenge-actions.ts`
  (`rng: () => number = Math.random` as a defaulted parameter) for all sale
  rolls and job generation, so everything stays unit-testable.

## What we're getting rid of

- **The sales table** (`machines/salesTable.ts`), its sprite case in
  `MachineSprite.tsx`, and the auto-sell pass at the bottom of
  `tickAction.ts`. Instant "item → money next tick" selling is gone entirely.
- **The `freeSelling` progression flag**, replaced by `marketplaceUnlocked`.
  Same unlock trigger (completing the *Cut to Order* commission, per
  `UNLOCK_CONDITIONS`), but it now reveals the Marketplace tab instead of
  granting a machine.
- **The sales-table grant** in `progression-actions.ts` (the machine no
  longer exists to grant).
- **The `StoreSellingSection` copy** pointing players at the sales table —
  either removed or rewritten to point at the Marketplace tab.
- **Save migration**: old saves may contain a placed or stored sales table
  and a `freeSelling` flag. On load, drop the machine (returning any items on
  it to the material dropoff position as piles) and map `freeSelling` →
  `marketplaceUnlocked`.

## The Marketplace tab

A new top-level UI surface (another `UiMode`, alongside normal / store),
styled as the player's phone or laptop. It has two panes:

1. **For Sale** — your active listings: item, asking price, how long it's
   been up, and an interest indicator.
2. **Job Board** — open offers, plus your currently accepted jobs and their
   tip timers.

Hidden entirely until `marketplaceUnlocked` (completing *Cut to Order*),
preserving the current tutorial cadence: first commission unlocks the store,
miter saw unlocks layout, second commission unlocks earning money freely.

## Selling: listings

### Flow

1. Player carries an item (in `player.inventory`) and opens the Marketplace
   tab.
2. They pick the item, see its fair value hint, and choose an asking price.
3. Listing the item removes it from inventory — it's boxed up awaiting
   pickup and no longer exists in the shop world. (v1 keeps this abstract;
   see Open questions.)
4. Each tick, every listing rolls a chance to sell. On a sale: money +=
   asking price, a small review-based reputation gain, and the existing
   `"sale"` sound cue.
5. Listings can be repriced or delisted at any time (delisting returns the
   item to inventory).

### Sale model

Per listing, per tick:

```
P(sale) = BASE_RATE × priceFactor(r, reputation) × demandFactor(category)
```

- **`r = askingPrice / fairValue`** — the player's one big decision.
- **`priceFactor`** is a logistic curve centered near `r = 1`: underpricing
  sells fast, fair pricing sells reliably, overpricing stalls. **Reputation
  shifts the curve's center right** — pricing power. A high-rep shop sells at
  `r = 1.3` about as easily as a nobody sells at `r = 1.0`.
- **`demandFactor`** is per-product-category **saturation**: each sale of a
  category (cutting boards, shelves, …) dips that category's demand meter,
  which recovers over a day or two. Selling ten identical cutting boards
  floods your local market; rotating across your recipe book keeps every
  meter high. This is the guard against find-best-item-and-spam.

Tuning starting points (all subject to play): at `r = 1` with baseline
reputation and full demand, an item should sell in roughly **half a day**
(~300 ticks, so `BASE_RATE ≈ 1/300`). At `r = 0.7` it sells within an hour
or two of game time; at `r = 1.5` with low rep, effectively never.

### Reviews: the reputation trickle

Every sale grants a small reputation gain scaled by value-for-money —
roughly proportional to `fairValue / askingPrice`, capped, and never
negative in v1. This creates the strategic arc: early game you underprice to
build reputation; late game you spend that reputation as pricing power. The
first non-commission reputation source in the game.

### Anti-frustration guarantees

- **Pity timer**: any listing priced at or below fair value (`r ≤ 1`) that
  hasn't sold after **2 days** sells automatically at asking price. A fairly
  priced item can be slow, but never stuck.
- The interest indicator makes the model legible **at listing time**:
  "priced to move" / "fair — should sell soon" / "ambitious — expect a
  wait." The player is making an informed bet, not gambling blind.

## Jobs

### The board

- The Job Board shows **3–5 open offers**. It refreshes on the day boundary:
  stale offers rotate out (offers last ~3 days), new ones roll in.
- Accepting moves an offer to your accepted list. **Concurrent-job limit:
  starts at 1, grows to ~5** at reputation milestones (exact thresholds are
  tuning; a skill-tree node granting +1 slot is a natural later addition).

### Job anatomy

A job reuses the commission data shape where possible:

- `requiredMaterials`: `InputMaterialWithQuantity[]` — same matching logic
  as commissions (`materialMeetsInput`, delivered from player inventory).
- `basePay`: ~**1.5–2× the fair value** of the deliverables. Never decays.
- `baseReputation`: a small fixed gain. Never decays.
- **Tip**: a speed bonus starting at ~**+40% of basePay** and decaying
  linearly to zero over ~**3 days from acceptance**, with a matching decaying
  reputation bonus. Time pressure that never goes negative — a slow job is
  merely less lucrative, not a failure.
- **Cancelling** an accepted job is the only true penalty: a small
  reputation loss. Letting an unaccepted offer expire costs nothing.

### Generation

Jobs are generated from the player's **capability envelope** — what they can
actually build right now, derived from owned machines and mounted tools
(`ownsMachine` etc.) plus `progression.commissionsCompleted` as a tech-tier
marker. Rules:

- Never generate a job the player cannot physically produce.
- **Bias toward the newest capability**: just bought a planer? The board
  fills with planing work. This is the "guidance" role — jobs teach the tool
  you just acquired, emergently rather than through authored content.
- **Always keep at least one zero-material-cost job on the board** — pallet
  wood work, fulfillable from scavenged materials — so a broke player always
  has a path back to solvency. (Together with the listing pity timer, this
  is the income floor.)
- Higher reputation skews generation toward bigger, better-paying requests.

## Reputation economy after this change

| Direction | Mechanism                                                      |
| --------- | -------------------------------------------------------------- |
| Earn      | Commissions (big chunks) — existing                            |
| Earn      | Job base + speed bonuses (steady)                              |
| Earn      | Sale reviews (trickle, boosted by underpricing)                |
| Spend     | Lumber channel access — existing                               |
| Spend     | Pricing power on listings (charge above fair value)            |
| Spend     | More concurrent job slots; better job offers                   |
| Lose      | Cancelling an accepted job (only loss in the system)           |

## Data model & implementation sketch

New persisted state (all in `GameState` / `saveLoad`):

```ts
interface MarketListing {
  readonly id: string;
  readonly material: MaterialInstance;
  readonly askingPrice: number;
  readonly listedAtTick: number;
}

interface JobOffer {
  readonly id: string;
  readonly name: string;          // flavor: who's asking, generated
  readonly description: string;
  readonly requiredMaterials: ReadonlyArray<InputMaterialWithQuantity>;
  readonly basePay: number;
  readonly baseReputation: number;
  readonly postedAtTick: number;  // offers expire ~3 days after this
}

interface AcceptedJob extends JobOffer {
  readonly acceptedAtTick: number; // tip decay runs from here
}

// GameState additions
readonly listings: ReadonlyArray<MarketListing>;
readonly jobBoard: ReadonlyArray<JobOffer>;
readonly acceptedJobs: ReadonlyArray<AcceptedJob>;
readonly categoryDemand: Readonly<Record<string, number>>; // 0–1 saturation meters
```

New actions (`src/game/game-actions/marketplace-actions.ts`):
`listItemAction`, `delistItemAction`, `repriceListingAction`,
`acceptJobAction`, `cancelJobAction`, `deliverJobAction`. Two new tick
passes replace the sales-table pass in `tickAction`: sale rolls (+ pity
timer + demand recovery) every tick, and a board refresh on day boundaries
(`tick % 600 === 0`). All randomness through injected RNG.

Suggested build order:

1. **Listings core**: data model, list/delist/reprice, sale roll + pity
   timer, Marketplace tab UI, sales-table removal + save migration.
2. **Job board**: generation, offer lifecycle, accept/cancel/deliver, tip
   decay, slot limits.
3. **Depth layer**: category saturation meters, review-based reputation,
   interest indicators, reputation-scaled generation.

Phases 1–2 are each shippable; phase 3 items are individually optional and
tunable.

## Future work (explicitly out of scope)

- **Craft markets**: calendar events announced in advance — build up
  inventory, then sell a burst of stock in one day at a stall. This design
  leaves room for them: the listing model doubles as booth inventory, the
  day concept extends to a visible forward calendar, and demand meters give
  markets a lever ("the fair ignores local saturation"). Requires a richer
  calendar than v1 needs.
- **Haggling**: buyers occasionally counter-offer below asking; accept or
  hold out. A good skill unlock once the base loop is proven.
- **Demand events**: "cutting boards are hot this week" rotating modifiers.
- **Negative reviews** for overpriced sales, once the economy is stable
  enough to afford a punishment lever.
- **An online-store upgrade** (larger reach, higher base rate) as a
  late-game purchase.

## Open questions

- Should listed items still occupy physical space somewhere (a staging
  shelf) until sold? v1 says no — listing removes the item — but a "packed
  boxes by the door" visual would be flavorful and could return as a soft
  constraint later.
- Exact reputation thresholds for job slots 2–5.
- Should job flavor (client names, request text) be a generation table now,
  or minimal placeholder text until the system proves out?
- Does delivering a job happen entirely in the Marketplace tab (like
  commissions in the store today), or should jobs eventually want a physical
  handoff (customer pickup at the shop door)?
