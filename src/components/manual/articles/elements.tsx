import React from "react";

/**
 * The typesetting kit for manual articles: typed-document body text in the
 * paperwork style. Articles compose these instead of raw tailwind so the
 * whole binder stays typographically consistent.
 */

/**
 * The old typists' convention: two spaces after a sentence. The typewriter
 * face crams sentences together with a single space, so every string
 * inside body copy gets an extra non-breaking space after sentence-ending
 * punctuation (nbsp first, so the line still breaks at the real space and
 * a new line can't open with a stray indent). Applied automatically by
 * P and UL — article authors just write normal prose. The handwritten
 * Note deliberately doesn't participate; nobody double-spaces a pen.
 */
function doubleSentenceSpacing(node: React.ReactNode): React.ReactNode {
  if (typeof node === "string") {
    return node.replace(/([.!?…])( )(?=[A-Z0-9"“(])/g, "$1\u00A0$2");
  }
  if (Array.isArray(node)) {
    return React.Children.map(node, doubleSentenceSpacing);
  }
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    const children = node.props.children;
    if (children === undefined) return node;
    return React.cloneElement(node, {
      children: doubleSentenceSpacing(children),
    });
  }
  return node;
}

/** Body paragraph — typewriter, like every typed document in the game. */
export const P: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="font-typewriter text-sm leading-relaxed">
    {doubleSentenceSpacing(children)}
  </p>
);

/** Section heading within an article. */
export const H: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="mt-6 border-b border-ink-black/20 pb-1 font-condensed font-semibold text-xs uppercase tracking-[0.2em] text-ink-fade">
    {children}
  </h3>
);

/** Bulleted list in the article voice. */
export const UL: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ul className="list-disc pl-5 space-y-1.5 font-typewriter text-sm leading-relaxed">
    {doubleSentenceSpacing(children)}
  </ul>
);

/** A term being introduced — the manual's version of bold ink. */
export const Term: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => <strong className="font-semibold">{children}</strong>;

/** A margin note from whoever owned this binder before you. Handwriting,
 * so it does NOT get the typist's double sentence spacing. */
export const Note: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <p className="font-ink text-base text-ink-blue -rotate-1 pl-4">{children}</p>
);

/**
 * A row of Photos, alternating their tilt so they read as prints laid on
 * the page rather than a web image grid.
 */
export const FigureRow: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <div className="flex flex-wrap justify-center gap-5 py-2 [&>*:nth-child(even)]:rotate-[1.5deg] [&>*:nth-child(odd)]:rotate-[-1.5deg]">
    {children}
  </div>
);

/**
 * A photo print taped into the binder: white border, handwritten caption.
 * `src` is a path under static/ (e.g. "/images/pallet.png").
 */
export const Photo: React.FC<{ src: string; caption: string }> = ({
  src,
  caption,
}) => (
  <figure className="border border-ink-black/10 bg-white px-1.5 pt-1.5 shadow-md">
    <img src={src} alt={caption} className="h-24 w-24 object-contain" />
    <figcaption className="pb-0.5 text-center font-ink text-sm leading-tight text-ink-black/70">
      {caption}
    </figcaption>
  </figure>
);
