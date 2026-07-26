/**
 * Every font face the UI can ask for, in `font-weight size family` form.
 *
 * Browsers only fetch a face the first time a glyph needs it, so without
 * this the shop's fonts trickle in: the menu pulls Lumberjack, then
 * starting a game pulls the typewriter/ink/mono faces, and each arrival
 * re-lays out the text under it. Loading them all up front, behind the
 * same boot gate as the textures, means the first frame is already
 * wearing its final type.
 *
 * Keep this in step with the `fontFamily` block in `tailwind.config.ts`:
 * the Google families come from the stylesheet link in `static/index.html`
 * (weights must match the ones its URL requests) and the rest from the
 * `@font-face` rules in `src/styles/fonts.css`.
 */
const FONT_FACES = [
  // Barlow Condensed — the workhorse, on <html> itself
  '400 1rem "Barlow Condensed"',
  '500 1rem "Barlow Condensed"',
  '600 1rem "Barlow Condensed"',
  '700 1rem "Barlow Condensed"',

  // Andada Pro — document surfaces
  '400 1rem "Andada Pro"',
  '500 1rem "Andada Pro"',
  '600 1rem "Andada Pro"',
  '700 1rem "Andada Pro"',

  // JetBrains Mono — figures and receipts
  '400 1rem "JetBrains Mono"',
  '500 1rem "JetBrains Mono"',
  '700 1rem "JetBrains Mono"',

  // Caveat — handwriting
  '400 1rem "Caveat"',
  '700 1rem "Caveat"',

  // Stardos Stencil — retail signage
  '400 1rem "Stardos Stencil"',
  '700 1rem "Stardos Stencil"',

  // Lumberjack — the logo, local and by far the heaviest file
  '400 1rem "Lumberjack"',
];

/**
 * How long boot will wait on the type. A blocked or offline font host
 * must cost a moment of fallback text, not a game that never starts.
 */
const FONT_TIMEOUT_MS = 3000;

/**
 * Fetch every declared font face before the app renders. Resolves once
 * they have all settled, or once the timeout runs out — never rejects.
 */
export async function loadFonts(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;

  // A face missing from the stylesheets rejects; that is the stylesheet's
  // problem to fix, not a reason to hold up the shop.
  const faces = FONT_FACES.map((face) =>
    document.fonts.load(face).catch(() => []),
  );

  await Promise.race([
    Promise.all(faces).then(() => document.fonts.ready),
    new Promise((resolve) => setTimeout(resolve, FONT_TIMEOUT_MS)),
  ]);
}
