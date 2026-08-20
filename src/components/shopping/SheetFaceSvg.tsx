import React from "react";
import { SheetGoodKind } from "../../game/Materials";
import { colorBySheetGoodKind } from "../../views/colorBySpecies";

/**
 * A sheet seen face-on with its edge showing, drawn small for the store
 * shelf. Same tells as the shop-floor SheetGoodSprite, reduced to what
 * survives at icon size: the kind's face color, a hint of what the face
 * is made of, and the edge — plywood's laminations stripe it, the chip
 * boards crumble into speckle, MDF stays solid.
 */
export const SheetFaceSvg: React.FC<{
  kind: SheetGoodKind;
  className?: string;
}> = ({ kind, className }) => {
  const { primary, secondary } = colorBySheetGoodKind[kind];
  const plywood = kind.startsWith("plywood");
  const chipboard = kind === "osb" || kind === "particleBoard";

  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      {/* face */}
      <rect x="3" y="4" width="24" height="24" fill={primary} />
      {/* the edge, extruded to the right */}
      <rect x="27" y="4" width="3" height="24" fill={secondary} />
      {plywood && (
        // laminations: pale glue lines up the edge
        <>
          {[8, 14, 20].map((y) => (
            <rect key={y} x="27" y={y} width="3" height="1" fill={primary} />
          ))}
          {/* rotary-cut cathedral grain across the face */}
          <path
            d="M 6 26 C 12 18, 12 14, 9 6 M 15 26 C 21 18, 21 14, 18 6"
            fill="none"
            stroke={secondary}
            strokeWidth="1"
            strokeOpacity="0.6"
          />
        </>
      )}
      {chipboard &&
        // pressed chips and strands, seeded by nothing — a fixed scatter
        // is enough at this size and never shimmers
        [
          [6, 8],
          [13, 11],
          [20, 7],
          [8, 17],
          [17, 19],
          [23, 14],
          [11, 24],
          [21, 24],
        ].map(([x, y]) => (
          <rect
            key={`${x}-${y}`}
            x={x}
            y={y}
            width={kind === "osb" ? 5 : 3}
            height="2"
            fill={secondary}
            transform={`rotate(${(x * 37) % 90} ${x} ${y})`}
          />
        ))}
    </svg>
  );
};
