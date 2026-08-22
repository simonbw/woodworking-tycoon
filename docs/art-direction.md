# The World Art Direction

Everything drawn on the canvas — machines, materials, people, the lot, the
marks over them — follows the design language in this doc, the way the DOM
follows `docs/design-system.md`. That doc governs the paperwork; this one
governs the world the paperwork floats over.

This doc is **aspirational where it says so**: it describes the style the
game is converging on, so new art is drawn to it and the places that don't
match yet are known debts rather than precedents. What still wants drawing
is tracked in `docs/asset-backlog.md`; this is the rubric for what any of
it should look like.

## The four kinds of things

Everything on the canvas is one of these, and its kind — not its substance —
decides how it renders:

| Kind                         | Examples                                                            | Voice                                      |
| ---------------------------- | ------------------------------------------------------------------- | ------------------------------------------ |
| **Things you pick up**       | Boards, sheets, glue-ups, finished pieces, loose tools, the pallet  | Loud: saturated, strong edges, exaggerated |
| **Things you interact with** | Machines, benches, racks, the truck, the stand, crates, people      | Quiet: same vocabulary, muted              |
| **The environment**          | Floor, walls, the lot, the store's shell                            | Ground: muted photographic texture         |
| **Marks that aren't things** | Selection outlines, kerf previews, ghost outlines, clamp indicators | Chrome: never object-like                  |

## Ground rules

### True scale is the ground truth

Everything is drawn at real physical dimensions against `PIXELS_PER_INCH`
(`src/views/shop-scale.ts`). A board is as long as a board; a bench is as
deep as a bench. The code depends on it — collision boxes are measured from
the art, feed clearance is measured in real inches — and so does the
fiction: the shop reads as a place because its proportions are true. This
is the one rule with no exceptions in any tier.

### Stylized figures on a muted ground

The fidelity gradient runs **inward**: the ground is the most photographic
thing on screen, and the things the player handles are the most stylized.
This is the animation rule — draw what moves and what you touch simply,
against a background as rich as it likes — and it exists for a reason:
photographic texture is high-frequency noise, and noise reads as _ground_.
A simplified shape with clean edges and confident color pops against it; a
photo-real board on a photo-real floor is camouflage.

Stylization is also how the game shows its information. Cartooning gets to
_exaggerate_: grain drawn as a few confident strokes reads at floor zoom
where photographic grain needs the bench dive; a rough face and a sanded
face can differ boldly instead of subtly. The style isn't a coat of paint
over the simulation — it's how the simulation is made legible.

### The wood is the hero

Materials get the loudness budget: the full saturation, the strongest
edges, the exaggerated grain and state. Everything else is drawn to make
the wood readable — machines are quiet so the stock on them pops, the
ground is muted so the figures on it pop. When a choice trades machine
detail against material legibility, the material wins.

### Provenance is visible

Everything the player makes visibly shows what it's made of. Assembled
products draw themselves from their bill of materials
(`AssembledProductSprite`) — a shelf built from the boards you milled
_looks like those boards_, joined; there is no flat "finished product" art,
by decision. The same rule reaches down into the parts: a piece keeps its
history (the board you sanded still reads sanded inside the finished
piece), grain follows a cut (a piece wears the grain it was cut with —
the windowing in `woodFills.ts` exists to enforce this), and fasteners and
glue lines stay visible in the assembly.

This principle is also an argument for the stylization above: photographic
parts composited into an assembly read as collage — seams, mismatched
light, no unity. Stylized parts composite cleanly, which is what lets a
built thing look _built_ rather than pasted.

### Loudness follows role, not substance

A material changes tiers when its role changes, even though it's the same
stuff. Fresh stock renders loud. The moment it's absorbed into the shop —
built into a bench top, installed as a shelf — it drops to the quiet tier:
**service patina**. An installed surface is desaturated, darkened, and
worn, the way a real bench top is scarred and faded within a month, while
still reading as the material it was built from. That keeps provenance
honest (the bench is visibly its sheet) while keeping figure/ground honest
(stock lying on a surface of the same material still pops).

The patina must hold up in the bench dive: it reads as _wear_ — scuffs,
stains, faded patches with structure — not a gray wash.

The testable form of the rule: **if E or F can pick it up, it renders
loud; if it's installed, it renders quiet.** Two edge cases, decided:

- The pallet is furniture-shaped but pickup-able — a bundle of future
  stock. It stays loud.
- A finished piece on the for-sale stand is done but not installed — it's
  the thing you're proudest of. It stays loud. Quietness is for things
  absorbed into the shop, not for things that are finished.

### The art is the fixture; state is drawn live

Anything whose contents vary gets art for the furniture only — the rack,
the shelf, the stand, the horses — with the simulation's contents rendered
on top, and the art has to read as empty when nothing is in it. (This is
the backlog's standing rule; it lives here now as a principle.) More
generally: state lives in the simulation and is shown physically — surface
condition, dust, wear, settings — never by badges or labels floating over
the world.

### Three vocabularies, with owners

The canvas speaks exactly three rendering languages, each owned by a tier:

1. **Muted photographic texture** — the environment only. Photography is
   allowed on the ground precisely because it's tinted down and
   low-contrast (the lawn and driveway tiles are the precedent). It never
   climbs onto a figure.
2. **Stylized flat shading** — everything simulated: materials loud,
   machines and fixtures and people quiet. One vocabulary, two volumes.
3. **Chrome** — the interface marks, below.

Nobody adds a fourth. Icons — the tools and consumables pictured in the
DOM — belong to the _paperwork_ design language, not the world's: the
aspiration is printed matter, the way a hardware-store flyer draws a
hammer, not miniature renderings of the floor sprites. (The current pixel
art is a placeholder; see the backlog.)

## Tier notes

### Materials

The loud tier and the deep one — see `docs/sheet-goods.md` and the module
headers in `views/material-sprites/` for the machinery. Aspirationally the
faces are stylized: a small palette per species (anchored on
`colorBySpecies.ts`), simplified confident grain, state differences turned
up. Today the faces window raw photography from `assets/textures/`; the
processing pass that stylizes it — keeping the photos as ground truth and
making the look a tunable parameter of `npm run process:textures` — is
issue #234. The silhouettes stay procedural forever (dimensions vary
continuously; see the backlog's "stays procedural" list).

### Machines and fixtures

The quiet tier. Silhouette-first — a top-down bandsaw is recognized by its
outline, not its detail — flat-shaded, desaturated relative to the wood,
with the detail budget spent on the parts that move or adjust (layered
art: fences slide, blades spin) and on leaving room for the state drawn
onto them: stock feeding through, mounted tools, dust. Character level:
this is a scrappy garage of hand-me-down jobsite tools, not a showroom —
wear and scuffs are wanted, and wear is exactly what hand-drawn art
carries that procedural rects can't.

### People

The player sprite is the reference for scale and style; customers,
shoppers, and any future walkers are drawn to match it. Quiet tier —
people are staffage, not heroes.

### The environment

The ground vocabulary: muted photographic texture, low contrast, sitting
under the daylight multiply. It must never compete with the figures
standing on it, and structurally it follows arbitrary footprints — walls
and floors are tiling strips, never composed scenes.

### Effects and light

Procedural forever — dust, particles, and light are simulation output, not
art, and their colors derive from data (dust is colored by species). Their
budget is spent on motion and accumulation, not texture. The lighting
model: the sun moves (`game/daylight.ts`), so **art carries no strong
baked directional light** — shading on sprites is soft and ambient, and
cast shadows are separate layers or procedural passes that can live under
the moving light.

### Marks that aren't things

Interface marks drawn on the canvas — the selection outline, kerf
previews, ghost outlines, bench markers — are in the world but not of it,
and must never be mistakable for objects: they speak in outlines,
translucency, and chrome colors, never in the wood-and-steel vocabulary of
the things they annotate. This is the canvas-side sibling of the paperwork
doc's chrome/paper distinction.
