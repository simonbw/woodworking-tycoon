import React, { memo } from "react";

export const MiterSawSprite: React.FC = memo(() => (
  <g className="drop-shadow" shapeRendering="geometricPrecision">
    {/* bottom base */}
    <path
      d="M 1.756 67.376 L 7.244 67.376 L 13.369 52.787 L 17.244 42.883 L 10.632 16.197 L 1.756 16.197 L 1.756 67.376 Z"
      transform="matrix(1, 0, 0, 1, 0, -1.7763568394002505e-15)"
      className="fill-gray-500"
    />
    <path
      d="M 82.756 16.197 L 88.244 16.197 L 94.369 30.786 L 98.244 40.69 L 91.632 67.376 L 82.756 67.376 L 82.756 16.197 Z"
      style={{ transformOrigin: "90.5px 41.7865px" }}
      transform="matrix(-1, 0, 0, -1, 0, 0)"
      className="fill-gray-500"
    />
    <path
      d="M80.806 47.617c0 17.041-14.42 31.461-31.461 31.461-17.042 0-30.151-14.42-30.151-31.461v-14.42h61.612v14.42Z"
      className="fill-gray-500"
    />

    {/* wings */}
    <g className="drop-shadow">
      <path
        d="M1.816 33.197h21.488V51.69l-10.612 9.686H1.816V33.197Z"
        className="fill-gray-400"
      />
      <path
        d="M76.696 61.376h21.488V42.883l-10.611-9.686H76.696v28.179Z"
        className="fill-gray-400"
        transform="rotate(180 0 0)"
        style={{ transformOrigin: "87.44px 47.2865px" }}
      />
    </g>

    {/* Bottom rotating part */}
    <g style={{ transformOrigin: "50px 50px" }} className="drop-shadow">
      <circle cx={50} cy={50} r={24.472} className="fill-gray-400" />
      {/* handle */}
      <path
        d="M46.284 82.731h7.431l-1.311 12.303h-4.809l-1.311-12.303Z"
        className="fill-gray-900"
      />
      <path
        d="M 41.663 67.466 L 58.338 67.466 L 54.716 86.323 L 45.285 86.323 L 41.663 67.466 Z"
        className="fill-gray-400"
      />
      <path
        d="M 37.663 33.809 L 62.338 33.809 L 59.716 14.952 L 40.285 14.952 L 37.663 33.809 Z"
        className="fill-gray-400"
      />

      {/* insert */}
      <g>
        <path
          d="M46.088 32.614h7.824c1.204 0 2.18 6.976 2.18 8.18v25.875c0 1.204-.976 15.18-2.18 15.18h-7.824c-1.204 0-2.18-13.976-2.18-15.18V40.794c0-1.204.976-8.18 2.18-8.18Z"
          className="fill-yellow-500"
        />
        <rect
          width={1.352}
          height={44.249}
          x={49.324}
          y={34.996}
          rx={0.2}
          ry={0.2}
          className="fill-gray-900"
        />
      </g>
    </g>

    {/* fence */}
    <path
      d="M.984 34.826h39.253v5.845H.984zM59.764 34.826h39.253v5.845H59.764z"
      className="fill-gray-300 drop-shadow-sm"
    />

    <g className="drop-shadow-md">
      <rect
        width={32.303}
        height={20.26}
        x={51.489}
        y={42.07}
        rx={1.992}
        ry={1.992}
        className="fill-gray-600"
      />
      <rect
        width={8.805}
        height={45.75}
        x={45.528}
        y={28.219}
        rx={1.042}
        ry={1.042}
        className="fill-gray-600"
      />
      <rect
        width={32.303}
        height={20.26}
        x={55.513}
        y={42.07}
        rx={1.992}
        ry={1.992}
        className="fill-yellow-500"
      />
      <path
        d="M79.662 42.07h6.162c1.1 0 1.992.892 1.992 1.992v16.276c0 1.1-.892 1.992-1.992 1.992h-6.162c-1.1 0-1.1-20.26 0-20.26Z"
        className="fill-gray-900"
      />
    </g>
  </g>
));
