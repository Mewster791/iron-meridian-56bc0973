import React, { useMemo, useRef } from "react";
import { BLOCK_SIZE, CITY_HALF_EXTENT, getCityLayout } from "../city/cityLayout";

interface CityMapViewProps {
  playerCoords?: { x: number; z: number; yaw: number };
  vehicleCoords?: { x: number; z: number };
  squadTargetCoords?: { x: number; z: number } | null;
  convoyCoords?: { x: number; z: number; intact: boolean };
  waypoint?: { x: number; z: number } | null;
  targetBuildingId?: string | null;
  destroyedBuildingIds?: string[];
  /** Small HUD map: zoomed in and centered on the player. */
  compactMinimap?: boolean;
  onClickMapWorldPoint?: (worldX: number, worldZ: number) => void;
}

const COMPACT_SPAN = 130;

export const CityMapView: React.FC<CityMapViewProps> = ({
  playerCoords,
  vehicleCoords,
  squadTargetCoords,
  convoyCoords,
  waypoint,
  targetBuildingId,
  destroyedBuildingIds = [],
  compactMinimap = false,
  onClickMapWorldPoint,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const layout = useMemo(() => getCityLayout(), []);
  const destroyed = useMemo(() => new Set(destroyedBuildingIds), [destroyedBuildingIds]);

  const ext = CITY_HALF_EXTENT;
  const view =
    compactMinimap && playerCoords
      ? {
          x: playerCoords.x - COMPACT_SPAN / 2,
          y: playerCoords.z - COMPACT_SPAN / 2,
          w: COMPACT_SPAN,
          h: COMPACT_SPAN,
        }
      : { x: -ext, y: -ext, w: ext * 2, h: ext * 2 };
  const k = compactMinimap ? 0.65 : 1; // marker scale

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!onClickMapWorldPoint || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const nz = (e.clientY - rect.top) / rect.height;
    onClickMapWorldPoint(
      Number((view.x + nx * view.w).toFixed(1)),
      Number((view.y + nz * view.h).toFixed(1)),
    );
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
      onClick={handleClick}
      className="w-full h-full select-none"
    >
      <rect x={-ext - 20} y={-ext - 20} width={ext * 2 + 40} height={ext * 2 + 40} fill="#22262b" />

      {layout.blocks.map((blk) => (
        <g key={`${blk.i}-${blk.j}`}>
          <rect
            x={blk.cx - BLOCK_SIZE / 2}
            y={blk.cz - BLOCK_SIZE / 2}
            width={BLOCK_SIZE}
            height={BLOCK_SIZE}
            fill={blk.kind === "PARK" ? "#334028" : blk.kind === "PLAZA" ? "#4d4a43" : "#3a3d42"}
            stroke="#4b5058"
            strokeWidth={0.6 * k}
          />
          {!compactMinimap && blk.name && (
            <text
              x={blk.cx}
              y={blk.cz + 2}
              textAnchor="middle"
              fill="#cbd5e1"
              fontSize="4.6"
              fontFamily="monospace"
            >
              {blk.name}
            </text>
          )}
        </g>
      ))}

      {layout.buildings.map((b) => {
        const isTarget = b.id === targetBuildingId;
        const isDestroyed = destroyed.has(b.id);
        const isSafe = b.role === "SAFEHOUSE";
        const fill = isDestroyed
          ? "#5b2d2a"
          : isTarget
            ? "#b7791f"
            : isSafe
              ? "#1f6b4f"
              : b.isSpecial
                ? "#5e6672"
                : "#4c535c";
        return (
          <g key={b.id}>
            <rect
              x={b.footprint.minX}
              y={b.footprint.minZ}
              width={b.footprint.maxX - b.footprint.minX}
              height={b.footprint.maxZ - b.footprint.minZ}
              fill={fill}
              stroke={isTarget ? "#fbbf24" : "#1b1e22"}
              strokeWidth={(isTarget ? 1.4 : 0.5) * k}
              strokeDasharray={isDestroyed ? `${2 * k} ${2 * k}` : undefined}
            />
            {!compactMinimap && b.isSpecial && (
              <text
                x={(b.footprint.minX + b.footprint.maxX) / 2}
                y={b.footprint.minZ - 1.5}
                textAnchor="middle"
                fill={isTarget ? "#fde68a" : "#e2e8f0"}
                fontSize="4"
                fontFamily="monospace"
                fontWeight="600"
                style={{ paintOrder: "stroke", stroke: "#0b0e13", strokeWidth: 1.4 }}
              >
                {b.name.replace(" (Safehouse)", "")}
              </text>
            )}
          </g>
        );
      })}

      {/* Grand Avenue */}
      <line
        x1={-ext}
        y1={0}
        x2={ext}
        y2={0}
        stroke="#d6aa3c"
        strokeOpacity="0.45"
        strokeWidth={0.8 * k}
        strokeDasharray={`${4 * k} ${3 * k}`}
      />

      {squadTargetCoords && (
        <g transform={`translate(${squadTargetCoords.x}, ${squadTargetCoords.z})`}>
          <circle
            r={5 * k}
            fill="none"
            stroke="#10b981"
            strokeWidth={1.1 * k}
            strokeDasharray={`${2 * k} ${2 * k}`}
          />
        </g>
      )}

      {waypoint && (
        <g transform={`translate(${waypoint.x}, ${waypoint.z})`}>
          <circle r={7 * k} fill="none" stroke="#38bdf8" strokeWidth={1.6 * k} />
          <circle r={2.4 * k} fill="#38bdf8" />
        </g>
      )}

      {vehicleCoords && (
        <rect
          x={vehicleCoords.x - 3.6 * k}
          y={vehicleCoords.z - 3.6 * k}
          width={7.2 * k}
          height={7.2 * k}
          rx={1.2 * k}
          fill="#10b981"
          stroke="#06281e"
          strokeWidth={1 * k}
        />
      )}

      {convoyCoords && convoyCoords.intact && (
        <polygon
          transform={`translate(${convoyCoords.x}, ${convoyCoords.z}) scale(${k})`}
          points="0,-6 6,0 0,6 -6,0"
          fill="#ef4444"
          stroke="#ffffff"
          strokeWidth="1"
        />
      )}

      {playerCoords && (
        <g
          transform={`translate(${playerCoords.x}, ${playerCoords.z}) rotate(${(-playerCoords.yaw * 180) / Math.PI}) scale(${k})`}
        >
          <polygon points="0,0 -18,-30 18,-30" fill="rgba(56,189,248,0.16)" />
          <polygon
            points="0,-8 5.5,6.5 0,3.2 -5.5,6.5"
            fill="#38bdf8"
            stroke="#090d14"
            strokeWidth="1.1"
          />
        </g>
      )}
    </svg>
  );
};
