# The Paperwork Design System

The UI is the paperwork of a small woodworking shop: paper props sitting on
dark workshop chrome. Every panel should read as a *physical object* — a
receipt, a corkboard, a folder, a spec sheet taped to a machine — not as a
generic web card. The tokens live in `tailwind.config.ts`; the shared
component classes live in `src/styles/index.css`. This doc is the rubric for
using them.

The core rule: **when everything is stylized, nothing reads as important.**
Character fonts and loud surfaces are a budget to be spent, not a default.

## Font roles

| Font | Class | Role | Budget |
| --- | --- | --- | --- |
| Barlow Condensed | `font-condensed` | **The workhorse.** All UI chrome: labels, buttons, list rows, tabs, stats, tooltips, keyboard legends. This is the base font (`html`), so unstyled text gets it for free. | Unlimited — it's the quiet default. |
| JetBrains Mono | `font-mono` | **Machine-printed numbers.** Money, counts, timers, order numbers. Pair with `tabular-nums`. | Numbers only. Never prose. |
| Special Elite (typewriter) | `font-typewriter` | **Typed documents.** Body text of in-fiction paperwork: commission sheets, the calendar page, receipt fine print. Opt-in only — never on interactive chrome. | A few document surfaces per screen. |
| Stardos Stencil | `font-stencil` | **Retired.** Too grating for UI at any size — it survives only as title-screen flair (`StartMenu`). Headings everywhere, including the store's retail signage, are bold condensed. Don't reintroduce it. | Title screen only. |
| Caveat | `font-ink` | **Handwriting.** Human margin notes: a client's note on a work order, a scribbled errand, a tally next to a quantity, a "nothing here" note pinned to the board. Runs small — use `text-base`/`text-lg`, never `text-xs`. | The character lever. Use it where a human would plausibly have written on the paper, nowhere else. |

Legacy fonts (`sans`/Nunito, `serif`/Bree Serif, `lumberjack`) are for the
logo and old sprites only. Don't use them in new UI.

## Surface roles

| Surface | Class / token | Means |
| --- | --- | --- |
| Workshop chrome | `workshop-bg` / `workshop-panel` / `workshop-edge` | The dark room the paper sits in. Never put body text directly on it except `.section-heading` object titles and `.button` chrome. |
| Manila | `.paper-card`, `paper-manila` | Folders and general shop paperwork. The default card. |
| Ivory | `.paper-card-ivory`, `.receipt-strip`, `paper-ivory` | Machine-printed output: receipts, the ledger, the calendar page, reference cards. Numbers on ivory are `font-mono`. |
| Legal | `.paper-card-legal`, `paper-legal` | Official documents from other people: commission work orders. |
| Lined sheet | `.lined-sheet` (cream) | Ruled paper for lists people maintain by hand: inventory manifests, the supplies tally. Quantities here are handwritten (`font-ink`). **Content must sit on the rules**: the ruling is 2rem, so every text line gets `leading-[2rem]`, rows have no vertical padding, and the rules themselves are the row dividers (no `divide-y`). If content can't hold the ruling, use a plain cream note instead of faking it. |
| Corkboard | `corkboard-*` + `.corkboard-bg` | The job board. Things on it are *pinned* (thumbtack + slight rotation via `Thumbtack` component). |
| Big-box store | `store-*`, `.product-card`, `.aisle-heading`, `.price-tag` | StorePage (and the skills catalog, which mimics it) only. Deliberately louder — it's a different location with its own retail fiction. Don't leak these tokens into the shop UI. |

## Panel hierarchy (Home screen)

The home screen is composed of a small number of physical objects, not a
stack of equal-weight cards:

- **Top bar** — nav tabs plus status chrome docked beside them: the day +
  speed controls (`Ticker`, which also drives the game loop) and the
  balance, both drawn directly on the dark bar, no paper.
- **Job board** (`JobBoard`, left) — one corkboard holding the active
  commission (pinned legal sheet, foldable to a stub via its header) and
  the errands note (pinned cream memo). No label — a corkboard of work
  orders explains itself.
- **Supply cabinet** (`SuppliesSection`, bottom-left) — a small lined
  tally of consumables; hidden until something is stocked.
- **Controls** (`ActionBar`, bottom-center) — small ivory reference card
  of live keys, under the shop view.
- **Shop manifest** (`ShopManifest`, top-right) — one manila folder
  holding the Inventory and Floor sheets, both always visible; long lists
  scroll inside the folder.
- **Machine spec sheet** (`MachinesSection`, right) — contextual; appears
  only when standing at a machine. It stays outside the folder because the
  core loop (load from inventory → operate) needs it visible *alongside*
  the inventory list.

The home screen is viewport-sized (`h-screen` + `overflow-hidden`) and each
side rail anchors its panels — manifest hangs from the top, controls sit on
the bottom, the spec sheet pops into the gap between them. Panels appearing
or growing must never shove their neighbors around: long content scrolls
*inside* its panel, and the page itself never grows a scrollbar.

When adding a new panel, first ask which existing object it belongs *inside*.
Only mint a new top-level object if it's genuinely a new piece of furniture,
and give it exactly one `.section-heading`.

## Rules of thumb

- Headings: one stencil `.section-heading` per top-level object, small
  `font-condensed` uppercase labels (`.subsection-heading` scale) for
  everything inside it.
- Buttons: `.button` / `.button-ghost` on dark chrome, `.button-paper` on
  paper. Don't invent new button styles outside the store.
- Emphasis comes from size, weight, and ink color (`ink-red` for warnings,
  `ink-blue` for active states, `gold` for money/progress) — not from
  switching fonts.
- It's a game: prefer diegetic weirdness (a thumbtack, a coffee-stain, a
  handwritten tally) over web-app decoration (badges, pills, gradients).
