import React, { useId, memo } from "react";

export const JobsiteTableSawSprite: React.FC = memo(() => {
  const gradientId = useId();

  const center = 50;
  const tableWidth = 75;
  const tableHeight = 68;
  const topY = center - tableHeight / 2;
  const bottomY = center + tableHeight / 2;
  const leftX = center - tableWidth / 2;
  const rightX = center + tableWidth / 2;
  const miterWidth = 4;
  const insertHeight = tableHeight / 2;
  const insertWidth = 18;
  const bladeHeight = insertHeight - 10;
  const bladeWidth = 3;

  return (
    <g className="drop-shadow-sm" shapeRendering="geometricPrecision">
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" className="stop-gray-400" />
          <stop offset="25%" className="stop-gray-300" />
          <stop offset="30%" className="stop-gray-200" />
          <stop offset="35%" className="stop-gray-300" />
          <stop offset="100%" className="stop-gray-500" />
        </linearGradient>
      </defs>

      {/* Table */}
      <rect
        x={leftX - 5}
        y={bottomY - 4}
        width={tableWidth + 10}
        height={8}
        className="fill-gray-400"
      />
      <rect
        x={leftX}
        y={topY}
        width={tableWidth}
        height={tableHeight}
        fill={`url(#${gradientId})`}
        className="drop-shadow-sm"
      />

      {/* Insert and Blade */}
      <rect
        x={center - insertWidth / 2}
        y={topY + (tableHeight - insertHeight) / 2}
        rx={insertWidth / 2}
        width={insertWidth}
        height={insertHeight}
        className="fill-yellow-400"
      />
      <rect
        x={center - bladeWidth / 2}
        y={topY + (tableHeight - bladeHeight) / 2}
        width={bladeWidth}
        height={bladeHeight}
        className="fill-gray-600"
      />

      {/* Miter slots */}
      <rect
        x={leftX + 18}
        y={topY}
        width={miterWidth}
        height={tableHeight}
        className="fill-gray-500/90"
      />
      <rect
        x={rightX - 18 - miterWidth}
        y={topY}
        width={miterWidth}
        height={tableHeight}
        className="fill-gray-500/90"
      />

      {/* Fence */}
      <g transform={`translate(${tableWidth / 2 + 35} 0)`}>
        <rect
          x={0}
          y={topY - 5}
          width={10}
          height={tableHeight + 10}
          rx={2}
          className="fill-gray-800 drop-shadow-sm"
        />
        <rect
          x={0}
          y={topY + 1}
          width={10}
          height={tableHeight - 2}
          className="fill-gray-300"
        />
      </g>
    </g>
  );
});
