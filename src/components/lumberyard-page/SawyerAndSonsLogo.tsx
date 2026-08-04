import React from "react";

/**
 * The Sawyer & Sons sign — the big S sweeping under a stacked
 * "SAWYER / & SONS". Inlined rather than loaded as an <img> because the
 * lettering is live SVG text set in Lumberjack, and an external image
 * can't reach the page's fonts. Draws in currentColor so the header bar's
 * ink applies. Source art: assets/sawyer-and-sons.svg.
 */
export const SawyerAndSonsLogo: React.FC<{ className?: string }> = ({
  className,
}) => (
  <svg
    viewBox="0 0 140 48"
    className={className}
    fill="currentColor"
    role="img"
    aria-label="Sawyer & Sons"
  >
    <g transform="matrix(1,0,0,1,-144.372,-276.455)">
      <g>
        <g transform="matrix(1,0,0,1,32.9673,37.4066)">
          <text
            x="138.935px"
            y="270.627px"
            style={{ fontFamily: "Lumberjack", fontSize: "37.714px" }}
          >
            A
            <tspan
              x="158.269px 191.598px 212.002px "
              y="270.627px 270.627px 270.627px "
            >
              WYE
            </tspan>
            R
          </text>
        </g>
        <g transform="matrix(1.3168,0,0,1.37166,-65.6248,-114.261)">
          <text
            x="158.035px"
            y="318.933px"
            style={{ fontFamily: "Lumberjack", fontSize: "48px" }}
          >
            S
          </text>
        </g>
      </g>
      <g transform="matrix(1,0,0,1,-128.622,48.3221)">
        <g transform="matrix(1.2,0,0,1,-62.3665,0)">
          <text
            x="311.833px"
            y="275.445px"
            style={{ fontFamily: "Lumberjack", fontSize: "18px" }}
          >
            &amp;
          </text>
        </g>
        <g transform="matrix(1.2,0,0,1,-65.7145,0)">
          <text
            x="328.573px"
            y="275.445px"
            style={{ fontFamily: "Lumberjack", fontSize: "17.286px" }}
          >
            S
          </text>
        </g>
        <g transform="matrix(1.2,0,0,1,-67.8303,0)">
          <text
            x="339.152px"
            y="275.445px"
            style={{ fontFamily: "Lumberjack", fontSize: "17.286px" }}
          >
            O
            <tspan x="349.281px 359.808px " y="275.445px 275.445px ">
              NS
            </tspan>
          </text>
        </g>
      </g>
    </g>
  </svg>
);
