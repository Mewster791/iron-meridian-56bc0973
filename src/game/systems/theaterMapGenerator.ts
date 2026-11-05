import {
  ObjectiveArchetype,
  ObjectiveStatus,
  TerrainBiome,
  TheaterObjective,
} from '../types/systems';

// Medium-sized tactical theater: 320x320 world meters (representing a 3.2km x 3.2km 1:10 compressed regional sector)
export const THEATER_HALF_EXTENT = 160;
export const THEATER_FULL_SIZE = 320;
export const RIVER_WATER_LEVEL = -1.65;
export const BRIDGE_X_COORDS: ReadonlyArray<number> = [-84, -18, 56];

export interface TheaterLandmark {
  id: string;
  name: string;
  sectorCode: string;
  kind: 'OUTPOST' | 'SAM_SITE' | 'DEPOT' | 'VILLAGE' | 'CHECKPOINT' | 'BRIDGE';
  x: number;
  z: number;
  rotationY: number;
  collisionRadius: number;
}

/**
 * Deterministic PRNG (Mulberry32) so any run seed reproduces the exact 50-of-500 objective layout.
 */
export function createSeededRng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Meandering river Z centerline as a function of X across the central valley.
 */
export function getRiverCenterZ(x: number): number {
  return Math.sin(x * 0.022) * 26 + Math.cos(x * 0.011) * 12 + 14;
}

/**
 * Tactical asphalt convoy highway Z centerline running along the northern valley bench.
 */
export function getHighwayCenterZ(x: number): number {
  return Math.sin(x * 0.016 + 0.7) * 18 - 28;
}

/**
 * North-South dirt tactical supply road linking Mountain Ridges, Highway, Bridge #-18, and South Valley.
 */
export function getCrossValleyRoadX(z: number): number {
  return -18 + Math.sin((z + 18) * 0.025) * 14;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Analytical multi-biome heightfield featuring:
 * - Northern & Far-Southern Alpine Mountains & Ridges (up to +34m)
 * - Rolling Forested Slopes & Foothills
 * - Central Tactical Valley Floor + Secondary Dirt Cross-Road
 * - Carved Meandering River Channel & Floodplain Banks
 * - Graded Asphalt Convoy Highway Corridor
 */
export function sampleTerrainHeight(x: number, z: number): number {
  const n1 = Math.sin(x * 0.024) * Math.cos(z * 0.024);
  const n2 = Math.sin(x * 0.058 + 1.3) * Math.cos(z * 0.052 - 0.8) * 0.48;
  const n3 = Math.sin((x + z) * 0.11) * 0.2 + Math.cos((x - z) * 0.19) * 0.08;
  const fbm = n1 + n2 + n3;

  const northSouthDist = Math.max(0, Math.abs(z) - 52);
  const mountainFactor = Math.pow(northSouthDist / 108, 1.85);
  const perimeterFactor = Math.pow(Math.max(0, Math.abs(x) - 128) / 34, 2.1);

  const ridgePeaks =
    Math.abs(Math.sin(x * 0.037 + z * 0.019)) * 16.5 +
    Math.abs(Math.cos(x * 0.071 - z * 0.063)) * 6.8;

  let h =
    fbm * 3.1 +
    mountainFactor * (14.2 + ridgePeaks) +
    perimeterFactor * 16.0;

  // Flatten highway bench smoothly along the valley supply corridor
  const hwZ = getHighwayCenterZ(x);
  const distHw = Math.abs(z - hwZ);
  if (distHw < 14) {
    const roadBlend = 1 - smoothstep(4.2, 14.0, distHw);
    const targetRoadH = 1.35 + Math.sin(x * 0.015) * 0.55;
    h = h * (1 - roadBlend) + targetRoadH * roadBlend;
  }

  // Carve meandering river channel & valley banks
  const rivZ = getRiverCenterZ(x);
  const distRiv = Math.abs(z - rivZ);
  if (distRiv < 21) {
    const channelBlend = 1 - smoothstep(5.6, 21.0, distRiv);
    const riverBed = -3.45 + Math.cos(x * 0.05) * 0.35;
    h = h * (1 - channelBlend) + riverBed * channelBlend;
  }

  return h;
}

/**
 * Exact unified walkable/drivable elevation including all 3 River Truss Bridges & graded approach ramps.
 * Guarantees 0.00m mismatch between visual bridge deck geometry and player/vehicle ground support.
 */
export function sampleWalkableHeight(x: number, z: number): number {
  const terrainH = sampleTerrainHeight(x, z);
  const deckWorldY = RIVER_WATER_LEVEL + 2.75; // +1.10m world Y

  for (let i = 0; i < BRIDGE_X_COORDS.length; i++) {
    const bx = BRIDGE_X_COORDS[i];
    if (Math.abs(x - bx) <= 4.35) {
      const bz = getRiverCenterZ(bx);
      const dz = Math.abs(z - bz);
      if (dz <= 14.0) {
        return Math.max(terrainH, deckWorldY);
      }
      if (dz <= 24.5) {
        const rampT = 1 - (dz - 14.0) / 10.5;
        const rampY = terrainH + (deckWorldY - terrainH) * rampT;
        return Math.max(terrainH, rampY);
      }
    }
  }

  return terrainH;
}

export function sampleTerrainBiome(x: number, z: number): TerrainBiome {
  const distRiv = Math.abs(z - getRiverCenterZ(x));
  if (distRiv < 7.2) return TerrainBiome.RIVER_CHANNEL;

  const distHw = Math.abs(z - getHighwayCenterZ(x));
  if (distHw < 4.6) return TerrainBiome.HIGHWAY_CORRIDOR;

  const h = sampleTerrainHeight(x, z);
  if (h >= 19.5) return TerrainBiome.ALPINE_PEAK;
  if (h >= 10.5) return TerrainBiome.ROCKY_RIDGE;
  if (h >= 3.6) return TerrainBiome.FORESTED_SLOPE;
  return TerrainBiome.CENTRAL_VALLEY;
}

export const THEATER_LANDMARKS: ReadonlyArray<TheaterLandmark> = [
  {
    id: 'lm-outpost-alpha',
    name: 'Command Bunker Severny',
    sectorCode: 'SEC-B3',
    kind: 'OUTPOST',
    x: -18,
    z: -16,
    rotationY: 0.18,
    collisionRadius: 3.9,
  },
  {
    id: 'lm-depot-kama',
    name: 'Kama Heavy Logistics Depot',
    sectorCode: 'SEC-D2',
    kind: 'DEPOT',
    x: 36,
    z: -42,
    rotationY: -0.35,
    collisionRadius: 5.4,
  },
  {
    id: 'lm-village-fulda',
    name: 'Fulda Valley Ruined Compound',
    sectorCode: 'SEC-B4',
    kind: 'VILLAGE',
    x: -54,
    z: 42,
    rotationY: 0.55,
    collisionRadius: 4.8,
  },
  {
    id: 'lm-sam-north',
    name: 'Tatra Crest SAM & Radar Battery',
    sectorCode: 'SEC-C1',
    kind: 'SAM_SITE',
    x: 8,
    z: -92,
    rotationY: 0.0,
    collisionRadius: 4.5,
  },
  {
    id: 'lm-sam-south',
    name: 'Carpathian Ridge C4ISR Relay',
    sectorCode: 'SEC-E5',
    kind: 'SAM_SITE',
    x: 62,
    z: 86,
    rotationY: Math.PI * 0.85,
    collisionRadius: 4.5,
  },
  {
    id: 'lm-checkpoint-west',
    name: 'Suwalki Highway Checkpoint',
    sectorCode: 'SEC-A2',
    kind: 'CHECKPOINT',
    x: -68,
    z: getHighwayCenterZ(-68) + 5.8,
    rotationY: 0.1,
    collisionRadius: 2.6,
  },
  {
    id: 'lm-checkpoint-east',
    name: 'Vistula Approach Checkpoint',
    sectorCode: 'SEC-E2',
    kind: 'CHECKPOINT',
    x: 78,
    z: getHighwayCenterZ(78) - 5.8,
    rotationY: -0.15,
    collisionRadius: 2.6,
  },
  ...BRIDGE_X_COORDS.map((bx, idx) => ({
    id: `lm-bridge-${idx}`,
    name:
      idx === 0
        ? 'West Dnieper Truss Bridge'
        : idx === 1
          ? 'Central Oka Causeway'
          : 'East Oder Crossing',
    sectorCode: idx === 0 ? 'SEC-A3' : idx === 1 ? 'SEC-C3' : 'SEC-D3',
    kind: 'BRIDGE' as const,
    x: bx,
    z: getRiverCenterZ(bx),
    rotationY: 0,
    collisionRadius: 0,
  })),
];

const CALLSIGN_PREFIXES = [
  'IRON', 'GRANITE', 'VIPER', 'COBALT', 'FROST', 'DAGGER', 'ANVIL', 'SPEAR',
  'FALCON', 'BASTION', 'MERIDIAN', 'VANGUARD', 'SENTINEL', 'TEMPEST', 'TALON',
  'AEGIS', 'WATCHTOWER', 'SCORPION', 'KESTREL', 'VECTOR',
];

const SECTOR_NAMES = [
  'Kama Gorge', 'Severny Ridge', 'Oka Crossing', 'Dnieper Bend', 'Vistula Approach',
  'Carpathian Saddle', 'Fulda Gap', 'Suwalki Corridor', 'Narva Floodplain', 'Tatra Crest',
  'Donets Basin', 'Oder Causeway', 'Balkan Pass', 'Valdai Foothills', 'Silesian Lowland',
  'Pomeranian Pinewood', 'Moravian Gate', 'Ardennes Spur', 'Bohemian Timberline', 'Drava Ford',
  'Bug River Lock', 'Transylvanian Switchback', 'Vardar Valley', 'Lublin Junction', 'Galician Bench',
];

const ARCHETYPE_TEMPLATES: ReadonlyArray<{
  archetype: ObjectiveArchetype;
  preferredBiomes: TerrainBiome[];
  labelVerb: string;
  unlocksHint: string;
}> = [
  {
    archetype: ObjectiveArchetype.CONVOY_AMBUSH,
    preferredBiomes: [TerrainBiome.HIGHWAY_CORRIDOR, TerrainBiome.CENTRAL_VALLEY],
    labelVerb: 'Convoy Interdiction',
    unlocksHint: 'Drops Reactive Armor Cassettes & MIL-STD/GOST Adapters',
  },
  {
    archetype: ObjectiveArchetype.SAM_BATTERY_RAID,
    preferredBiomes: [TerrainBiome.ROCKY_RIDGE, TerrainBiome.FORESTED_SLOPE],
    labelVerb: 'Mobile SAM Neutralization',
    unlocksHint: 'Drops Active Protection Millimeter-Wave Radar Modules',
  },
  {
    archetype: ObjectiveArchetype.BRIDGE_INTERDICTION,
    preferredBiomes: [TerrainBiome.RIVER_CHANNEL, TerrainBiome.CENTRAL_VALLEY],
    labelVerb: 'River Crossing Control',
    unlocksHint: 'Chokepoint Control + Heavy Scrap Alloy Cache',
  },
  {
    archetype: ObjectiveArchetype.MOUNTAIN_RELAY_CAPTURE,
    preferredBiomes: [TerrainBiome.ALPINE_PEAK, TerrainBiome.ROCKY_RIDGE],
    labelVerb: 'High-Altitude Relay Seizure',
    unlocksHint: 'Unlocks Sector Telemetry & Encrypted Fire-Control Chips',
  },
  {
    archetype: ObjectiveArchetype.DEPOT_SALVAGE,
    preferredBiomes: [TerrainBiome.CENTRAL_VALLEY, TerrainBiome.FORESTED_SLOPE],
    labelVerb: 'Forward Logistics Raid',
    unlocksHint: 'High-Yield Reserve Ammunition, IFAKs & Composite Plating',
  },
  {
    archetype: ObjectiveArchetype.UAV_RECOVERY,
    preferredBiomes: [TerrainBiome.FORESTED_SLOPE, TerrainBiome.ROCKY_RIDGE],
    labelVerb: 'Downed Stealth UAV Blackbox',
    unlocksHint: 'Drops Hunter-Killer Thermal Optics & EW Jammer Cores',
  },
  {
    archetype: ObjectiveArchetype.ARMOR_SPEARHEAD_HALT,
    preferredBiomes: [TerrainBiome.HIGHWAY_CORRIDOR, TerrainBiome.CENTRAL_VALLEY],
    labelVerb: 'Armored Recon Vanguard Halt',
    unlocksHint: 'Drops Remote Weapon Station & Tandem ATGM Rails',
  },
  {
    archetype: ObjectiveArchetype.COMMS_BUNKER_BREACH,
    preferredBiomes: [TerrainBiome.ALPINE_PEAK, TerrainBiome.FORESTED_SLOPE],
    labelVerb: 'Hardened C4ISR Bunker Breach',
    unlocksHint: 'Reveals High-Value Convoy Schedules & Elite Salvage',
  },
];

/**
 * Deterministically builds the full 500-Objective Master Catalog across all terrain biomes,
 * and samples 50 spatially balanced Active Run Objectives for the current 1-2 hour regional run.
 */
export function generateRegionalTheaterObjectives(runSeed: number): {
  masterPool500: TheaterObjective[];
  activeRun50: TheaterObjective[];
} {
  const masterRng = createSeededRng(20261103);
  const masterPool500: TheaterObjective[] = [];

  for (let i = 0; i < 500; i++) {
    const tmpl = ARCHETYPE_TEMPLATES[i % ARCHETYPE_TEMPLATES.length];
    const callsign = CALLSIGN_PREFIXES[i % CALLSIGN_PREFIXES.length];
    const sector = SECTOR_NAMES[Math.floor(i / 20) % SECTOR_NAMES.length];

    let bestX = 0;
    let bestZ = 0;
    let bestBiome = TerrainBiome.CENTRAL_VALLEY;

    for (let attempt = 0; attempt < 24; attempt++) {
      let cx = (masterRng() * 2 - 1) * 136;
      let cz = (masterRng() * 2 - 1) * 136;

      if (tmpl.archetype === ObjectiveArchetype.CONVOY_AMBUSH) {
        cx = (masterRng() * 2 - 1) * 134;
        cz = getHighwayCenterZ(cx) + (masterRng() * 2 - 1) * 3.2;
      } else if (tmpl.archetype === ObjectiveArchetype.BRIDGE_INTERDICTION) {
        cx = (masterRng() * 2 - 1) * 128;
        cz = getRiverCenterZ(cx) + (masterRng() > 0.5 ? 7.2 : -7.2);
      } else if (tmpl.archetype === ObjectiveArchetype.MOUNTAIN_RELAY_CAPTURE) {
        cx = (masterRng() * 2 - 1) * 136;
        cz = (masterRng() > 0.5 ? 1 : -1) * (82 + masterRng() * 54);
      }

      const b = sampleTerrainBiome(cx, cz);
      bestX = cx;
      bestZ = cz;
      bestBiome = b;
      if (tmpl.preferredBiomes.includes(b)) {
        break;
      }
    }

    const wy = Math.max(RIVER_WATER_LEVEL + 0.35, sampleWalkableHeight(bestX, bestZ));
    const tier = ((i % 4) + 1) as 1 | 2 | 3 | 4;

    masterPool500.push({
      uid: `OBJ-${String(i + 1).padStart(3, '0')}`,
      poolIndex: i + 1,
      runOrderIndex: 0,
      title: `${callsign}-${(i % 99) + 1}: ${sector} ${tmpl.labelVerb}`,
      archetype: tmpl.archetype,
      biome: bestBiome,
      worldX: Number(bestX.toFixed(1)),
      worldY: Number(wy.toFixed(1)),
      worldZ: Number(bestZ.toFixed(1)),
      threatTier: tier,
      rewardScrap: 20 + tier * 15,
      rewardArmorUnits: tier >= 2 ? 1 + (tier === 4 ? 1 : 0) : 0,
      rewardChips: tier >= 3 ? 1 : 0,
      unlocksTechHint: tmpl.unlocksHint,
      status: ObjectiveStatus.ACTIVE,
    });
  }

  const runRng = createSeededRng(runSeed);
  const shuffled = [...masterPool500];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(runRng() * (i + 1));
    const tmp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = tmp;
  }

  const activeRun50: TheaterObjective[] = [];
  const minSpacingSq = 22 * 22;

  for (const cand of shuffled) {
    if (activeRun50.length >= 50) break;
    const tooClose = activeRun50.some((existing) => {
      const dx = existing.worldX - cand.worldX;
      const dz = existing.worldZ - cand.worldZ;
      return dx * dx + dz * dz < minSpacingSq;
    });
    if (!tooClose) {
      activeRun50.push({
        ...cand,
        runOrderIndex: activeRun50.length + 1,
        status: ObjectiveStatus.ACTIVE,
      });
    }
  }

  if (activeRun50.length < 50) {
    for (const cand of shuffled) {
      if (activeRun50.length >= 50) break;
      if (!activeRun50.some((e) => e.uid === cand.uid)) {
        activeRun50.push({
          ...cand,
          runOrderIndex: activeRun50.length + 1,
          status: ObjectiveStatus.ACTIVE,
        });
      }
    }
  }

  return { masterPool500, activeRun50 };
}
