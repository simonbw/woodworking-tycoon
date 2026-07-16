# Skills, XP & Recipe Unlocking — Design

Companion to `docs/tools-and-surfaces.md`. **Now** = implemented; **Later**
= direction.

## The two progression axes

- **Skills (XP + tree)**: *what you know how to make.* Supply-side,
  player-directed. Earned by doing the craft.
- **Reputation**: *who trusts you.* Demand-side. Reserved for commission
  tiers, special orders, and store relationships — it does NOT gate recipes.
  (Not yet consumed by anything; that's its future.)

Commissions remain the authored campaign; the skill tree is the character
build that powers the free-selling economy.

## Every recipe has a skill (Now)

Operations may declare `requiredSkill`. Recipes the player can use from the
start belong to **starter skills** — nodes that begin unlocked. This is
deliberate teaching: the tree shows "you already have these certificates"
instead of some recipes being mysteriously dependency-free. One rule,
uniformly applied.

Locked recipes are hidden at the workstation (no clutter at the bench) and
visible on the Skills page (that's where aspiration lives).

## XP (Now)

- Earned on **completing products** (XP = the product's sell value — better
  products teach you more) and **completing commissions** (rewardMoney / 5).
  Not per operation tick (that rewards busywork) and not per sale (that
  re-taxes selling).
- Levels follow an increasing-cost curve; each level grants 1 skill point.
  Points are spent on the Skills page. No respec (nothing is a trap yet).

## The tree (Now: 12 nodes, 3 branches)

**Milling** — `basic-milling`★ (dismantle, crosscut, rip, plane) →
`quick-dry-glue` (all glue-ups — batch, pair, and strip extension — dry 40%
faster)

**Joinery** — `rustic-carpentry`★ (rustic shelf) and `panel-work`★ (glue-up,
cutting board) → `fine-shelving` (Proper Shelf: sanded hardwood, $45 base) →
`box-joinery` (Jewelry Box: thin sanded stock — planer-era product, $90 base).
`panel-work` also → `freeform-lamination` (Glue Up Pair + Glue On Strip:
build panels of any width and strip pattern, one strip at a time — the
machinery for every pattern board, and later for custom pattern commissions)

**Finishing** — `surface-prep`★ (sanding) → `efficient-sanding` (sand 40%
faster) → `two-tone-boards` (Two-Tone Cutting Board: exactly two species,
premium price) → `striped-boards` (Striped Cutting Board: strict alternation,
$60 base) → `sunrise-boards` (Sunrise Cutting Board: one wood fades out as
the other fades in, e.g. 3W,1M,2W,2M,1W,3M — requires `striped-boards` AND
`freeform-lamination`, the tree's first cross-branch node, $100 base)

★ = starter skill, unlocked at game start.

### The strip-board ladder

Same raw materials, escalating pattern discipline, escalating price:
simple ($40, one species) → two-tone ($40 x avg-species x 1.5, any two-species
mix) → striped ($60 base, strict alternation of 2" strips) → sunrise ($100
base, alternating fade with strictly shrinking/growing widths, min 6 strips =
12" wide). A striped panel also satisfies the two-tone recipe — the better
skill is purely an upgrade on the same glue-up. End-grain boards are the
intended next rung (crosscut + re-glue; needs its own design pass).

## Later

- More branches/nodes as systems land: finishing (oil/varnish), end-grain
  boards (crosscut + re-glue), offcut recovery, resawing, scavenging perks.
- Blueprint drops: rare plans/magazines in scavenged pallets granting a
  free point or specific recipe — ties the scavenging loop to this one.
- Reputation consumers: commission tiers, special orders, store stock.
- Prestige/respec, multi-point nodes, XP from operations: only if needed.
