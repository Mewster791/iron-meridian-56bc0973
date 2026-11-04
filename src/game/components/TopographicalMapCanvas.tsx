import React, { useEffect, useMemo, useRef } from 'react';
import {
  ObjectiveArchetype,
  ObjectiveStatus,
  TerrainBiome,
  TheaterObjective,
} from '../types/systems';
import {
  BRIDGE_X_COORDS,
  getCrossValleyRoadX,
  getHighwayCenterZ,
  getRiverCenterZ,
  RIVER_WATER_LEVEL,
  sampleTerrainHeight,
  THEATER_LANDMARKS,
} from '../systems/theaterMapGenerator';

// Singleton cached hillshaded topographical bitmap data URL so 640x640 relief only computes once
let cachedReliefDataUrl: string | null = null;

export function getTopographicalReliefDataUrl(): string {
  if (cachedReliefDataUrl) return cachedReliefDataUrl;
  if (typeof document === 'undefined') return '';

  const res = 512;
  const canvas = document.createElement('canvas');
  canvas.width = res;
  canvas.height = res;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const img = ctx.createImageData(res, res);
  const data = img.data;

  // Sun vector for crisp NW cartographic hillshading
  const lx = -0.62;
  const ly = 0.58;
  const lz = -0.52;

  for (let py = 0; py < res; py++) {
    const wz = (py / (res - 1)) * 320 - 160;
    for (let px = 0; px < res; px++) {
      const wx = (px / (res - 1)) * 320 - 160;
      const h = sampleTerrainHeight(wx, wz);

      // Finite-difference slope normal for hillshading
      const hx = sampleTerrainHeight(wx + 1.1, wz) - h;
      const hz = sampleTerrainHeight(wx, wz + 1.1) - h;
      let nx = -hx * 1.35;
      let ny = 1.0;
      let nz = -hz * 1.35;
      const invLen = 1 / Math.hypot(nx, ny, nz);
      nx *= invLen;
      ny *= invLen;
      nz *= invLen;

      const shade = Math.max(0.35, Math.min(1.28, nx * lx + ny * ly + nz * lz + 0.36));

      const distRiv = Math.abs(wz - getRiverCenterZ(wx));
      const distHw = Math.abs(wz - getHighwayCenterZ(wx));
      const distDirt = Math.abs(wx - getCrossValleyRoadX(wz));

      let r = 46;
      let g = 66;
      let b = 43;

      if (h < RIVER_WATER_LEVEL) {
        const depth = Math.min(1, (RIVER_WATER_LEVEL - h) / 2.2);
        r = Math.round(24 - depth * 10);
        g = Math.round(86 - depth * 28);
        b = Math.round(118 - depth * 24);
      } else if (distRiv < 9.2 && h < RIVER_WATER_LEVEL + 1.3) {
        r = 104;
        g = 97;
        b = 79;
      } else if (distHw < 3.6) {
        r = 56;
        g = 62;
        b = 71;
      } else if (distDirt < 2.4 && h < 16.5) {
        r = 92;
        g = 80;
        b = 62;
      } else if (h > 22.0) {
        const snow = Math.min(1, (h - 22.0) / 6.5);
        r = Math.round(88 + snow * 124);
        g = Math.round(95 + snow * 126);
        b = Math.round(104 + snow * 126);
      } else if (h > 11.2) {
        const rock = Math.min(1, (h - 11.2) / 9.0);
        r = Math.round(39 + rock * 48);
        g = Math.round(58 + rock * 37);
        b = Math.round(41 + rock * 60);
      } else if (h > 3.6) {
        r = 36;
        g = 56;
        b = 39;
      }

      // Apply hillshade (less on water)
      const s = h < RIVER_WATER_LEVEL ? 0.92 + (shade - 0.8) * 0.25 : shade;
      r = Math.min(255, Math.round(r * s));
      g = Math.min(255, Math.round(g * s));
      b = Math.min(255, Math.round(b * s));

      // Topographical Contour Lines every 4m & major index contours every 12m
      if (h > RIVER_WATER_LEVEL + 0.25 && distHw > 3.8) {
        const mod4 = ((h % 4) + 4) % 4;
        const mod12 = ((h % 12) + 12) % 12;
        const slopeMag = Math.hypot(hx, hz) + 0.12;
        if (mod12 < 0.22 * slopeMag) {
          r = Math.round(r * 0.62);
          g = Math.round(g * 0.62);
          b = Math.round(b * 0.62);
        } else if (mod4 < 0.14 * slopeMag) {
          r = Math.round(r * 0.8);
          g = Math.round(g * 0.8);
          b = Math.round(b * 0.8);
        }
      }

      const idx = (py * res + px) * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  cachedReliefDataUrl = canvas.toDataURL('image/png');
  return cachedReliefDataUrl;
}

interface TopographicalMapProps {
  objectives: TheaterObjective[];
  selectedObjectiveUid?: string | null;
  pinnedObjectiveUid?: string | null;
  playerCoords?: { x: number; z: number; yaw: number };
  vehicleCoords?: { x: number; z: number };
  squadTargetCoords?: { x: number; z: number } | null;
  convoyCoords?: { x: number; z: number; intact: boolean };
  compactMinimap?: boolean;
  densePoolMode?: boolean;
  onSelectObjective?: (obj: TheaterObjective) => void;
  onClickMapWorldPoint?: (worldX: number, worldZ: number) => void;
}

export const TopographicalMapView: React.FC<TopographicalMapProps> = ({
  objectives,
  selectedObjectiveUid,
  pinnedObjectiveUid,
  playerCoords,
  vehicleCoords,
  squadTargetCoords,
  convoyCoords,
  compactMinimap = false,
  densePoolMode = false,
  onSelectObjective,
  onClickMapWorldPoint,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const reliefUrl = useMemo(() => getTopographicalReliefDataUrl(), []);

  useEffect(() => {
    getTopographicalReliefDataUrl();
  }, []);

  const { highwayPath, dirtPath } = useMemo(() => {
    const hPts: string[] = [];
    const dPts: string[] = [];
    for (let x = -160; x <= 160; x += 6) {
      hPts.push(`${x},${getHighwayCenterZ(x).toFixed(1)}`);
    }
    for (let z = -150; z <= 150; z += 6) {
      dPts.push(`${getCrossValleyRoadX(z).toFixed(1)},${z}`);
    }
    return {
      highwayPath: `M ${hPts.join(' L ')}`,
      dirtPath: `M ${dPts.join(' L ')}`,
    };
  }, []);

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!onClickMapWorldPoint || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const nz = (e.clientY - rect.top) / rect.height;
    const wx = Number((nx * 320 - 160).toFixed(1));
    const wz = Number((nz * 320 - 160).toFixed(1));
    onClickMapWorldPoint(wx, wz);
  };

  const gridCols = ['A', 'B', 'C', 'D', 'E'];

  return (
    <svg
      ref={svgRef}
      viewBox="-160 -160 320 320"
      onClick={handleSvgClick}
      className="w-full h-full select-none"
    >
      {/* Cached High-Resolution Hillshaded Topographical Relief Bitmap */}
      {reliefUrl && (
        <image
          href={reliefUrl}
          x="-160"
          y="-160"
          width="320"
          height="320"
          preserveAspectRatio="none"
        />
      )}

      {/* Tactical Military Grid Overlay (64m = 640m real-scale grid squares A1..E5) */}
      {!compactMinimap &&
        [-96, -32, 32, 96].map((g) => (
          <g key={g}>
            <line x1={g} y1="-160" x2={g} y2="160" stroke="#ffffff" strokeOpacity="0.11" strokeWidth="0.5" />
            <line x1="-160" y1={g} x2="160" y2={g} stroke="#ffffff" strokeOpacity="0.11" strokeWidth="0.5" />
          </g>
        ))}

      {!compactMinimap &&
        gridCols.map((col, ci) =>
          [1, 2, 3, 4, 5].map((row, ri) => (
            <text
              key={`${col}${row}`}
              x={-155 + ci * 64}
              y={-149 + ri * 64}
              fill="rgba(226,232,240,0.34)"
              fontSize="5.5"
              fontFamily="monospace"
            >
              {col}
              {row}
            </text>
          ))
        )}

      {/* Secondary North-South Tactical Trail Centerline */}
      <path
        d={dirtPath}
        fill="none"
        stroke="#d6b88d"
        strokeOpacity="0.4"
        strokeWidth={compactMinimap ? 1.5 : 1.1}
        strokeDasharray="3 3"
      />

      {/* Primary Asphalt Convoy Highway Centerline */}
      <path
        d={highwayPath}
        fill="none"
        stroke="#e2e8f0"
        strokeOpacity="0.55"
        strokeWidth={compactMinimap ? 1.6 : 1.0}
        strokeDasharray="4 4"
      />

      {/* 3 Reinforced River Truss Bridges */}
      {BRIDGE_X_COORDS.map((bx) => {
        const bz = getRiverCenterZ(bx);
        return (
          <g key={bx}>
            <rect
              x={bx - 4.8}
              y={bz - 13}
              width="9.6"
              height="26"
              fill="#cbd5e1"
              stroke="#0f172a"
              strokeWidth="0.9"
            />
          </g>
        );
      })}

      {/* Named Strategic Landmarks & Bases */}
      {!compactMinimap &&
        THEATER_LANDMARKS.filter((l) => l.kind !== 'BRIDGE').map((lm) => (
          <g key={lm.id} transform={`translate(${lm.x}, ${lm.z})`}>
            <rect
              x="-3.6"
              y="-3.6"
              width="7.2"
              height="7.2"
              fill="#0f172a"
              fillOpacity="0.82"
              stroke="#94a3b8"
              strokeWidth="0.9"
            />
            <text
              x="5.5"
              y="2"
              fill="#e2e8f0"
              fontSize="5.4"
              fontFamily="monospace"
              fontWeight="600"
              style={{ paintOrder: 'stroke', stroke: '#090d14', strokeWidth: 1.8 }}
            >
              {lm.name}
            </text>
          </g>
        ))}

      {/* Squad Custom Tactical Order Target Marker */}
      {squadTargetCoords && (
        <g transform={`translate(${squadTargetCoords.x}, ${squadTargetCoords.z})`}>
          <circle r="5.5" fill="none" stroke="#10b981" strokeWidth="1.2" strokeDasharray="2 2" />
          <line x1="-4" y1="0" x2="4" y2="0" stroke="#10b981" strokeWidth="1.1" />
          <line x1="0" y1="-4" x2="0" y2="4" stroke="#10b981" strokeWidth="1.1" />
        </g>
      )}

      {/* Objective Pins */}
      {objectives.map((obj) => {
        const isSelected = selectedObjectiveUid === obj.uid;
        const isPinned = pinnedObjectiveUid === obj.uid;
        const isDone = obj.status === ObjectiveStatus.COMPLETED;
        const baseR = compactMinimap ? 3.1 : densePoolMode ? 1.9 : 3.4;

        const fill = isDone
          ? '#10b981'
          : obj.archetype === ObjectiveArchetype.CONVOY_AMBUSH
            ? '#ef4444'
            : obj.biome === TerrainBiome.ALPINE_PEAK
              ? '#38bdf8'
              : '#f59e0b';

        return (
          <g
            key={obj.uid}
            onClick={(e) => {
              if (onSelectObjective) {
                e.stopPropagation();
                onSelectObjective(obj);
              }
            }}
            className={onSelectObjective ? 'cursor-pointer' : undefined}
          >
            {isPinned && (
              <circle
                cx={obj.worldX}
                cy={obj.worldZ}
                r={compactMinimap ? 7.5 : 7.8}
                fill="none"
                stroke="#38bdf8"
                strokeWidth="1.5"
              />
            )}
            {isSelected && (
              <circle
                cx={obj.worldX}
                cy={obj.worldZ}
                r={densePoolMode ? 5.2 : 6.4}
                fill="none"
                stroke="#ffffff"
                strokeWidth="1.4"
              />
            )}
            <circle
              cx={obj.worldX}
              cy={obj.worldZ}
              r={baseR}
              fill={fill}
              stroke="#090d14"
              strokeWidth={densePoolMode ? 0.45 : 0.85}
            />
          </g>
        );
      })}

      {/* Friendly Squad 8x8 Command APC */}
      {vehicleCoords && (
        <g transform={`translate(${vehicleCoords.x}, ${vehicleCoords.z})`}>
          <rect
            x="-4.2"
            y="-4.2"
            width="8.4"
            height="8.4"
            rx="1.5"
            fill="#10b981"
            stroke="#06281e"
            strokeWidth="1.2"
          />
          {!compactMinimap && (
            <text
              x="6"
              y="2"
              fill="#6ee7b7"
              fontSize="5.5"
              fontFamily="monospace"
              fontWeight="700"
              style={{ paintOrder: 'stroke', stroke: '#090d14', strokeWidth: 2 }}
            >
              APC
            </text>
          )}
        </g>
      )}

      {/* Enemy Armored Supply Convoy */}
      {convoyCoords && convoyCoords.intact && (
        <g transform={`translate(${convoyCoords.x}, ${convoyCoords.z})`}>
          <polygon
            points="0,-6.5 6.5,0 0,6.5 -6.5,0"
            fill="#ef4444"
            stroke="#ffffff"
            strokeWidth="1"
          />
          {!compactMinimap && (
            <text
              x="8"
              y="2"
              fill="#fca5a5"
              fontSize="5.5"
              fontFamily="monospace"
              fontWeight="700"
              style={{ paintOrder: 'stroke', stroke: '#090d14', strokeWidth: 2 }}
            >
              CONVOY
            </text>
          )}
        </g>
      )}

      {/* Player Operator Arrow & Camera View Cone */}
      {playerCoords && (
        <g
          transform={`translate(${playerCoords.x}, ${playerCoords.z}) rotate(${
            (-playerCoords.yaw * 180) / Math.PI
          })`}
        >
          <polygon
            points="0,0 -22,-36 22,-36"
            fill="rgba(56,189,248,0.18)"
            stroke="rgba(56,189,248,0.38)"
            strokeWidth="0.6"
          />
          <polygon
            points="0,-9.5 6.5,7.5 0,3.8 -6.5,7.5"
            fill="#38bdf8"
            stroke="#090d14"
            strokeWidth="1.2"
          />
        </g>
      )}
    </svg>
  );
};
