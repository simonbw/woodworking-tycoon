/**
 * Debug/preview switches carried in the URL's query string. These are
 * deliberately not player-facing — nothing in the game links to them —
 * they exist so a hidden surface can still be looked at (see the `?seed`
 * and `?goal` switches in randUtils.ts for the same idiom).
 */

/**
 * `?website`: open store trips as the old full-screen storefront overlay
 * instead of the walkable store. The overlay is the future Orange Box
 * website (issue #200) and stays in the tree behind this flag until that
 * unlock is designed.
 */
export function websiteRequested(): boolean {
  return new URLSearchParams(window.location.search).has("website");
}
