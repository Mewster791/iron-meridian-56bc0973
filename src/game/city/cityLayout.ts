/**
 * Pure-data city layout for the free city of Varos-Meridian.
 * No three.js or React here: the arena renders and collides against this data,
 * and the campaign rules read building / floor ids from it.
 */

export const CITY_HALF_EXTENT = 160;
export const PLAYABLE_HALF_EXTENT = 152;
export const BLOCK_PITCH = 52;
export const BLOCK_SIZE = 40;
export const STREET_WIDTH = 12;
export const BLOCKS_PER_SIDE = 6;
export const FLOOR_HEIGHT = 3.4;
export const WALL_THICKNESS = 0.3;
export const SLAB_THICKNESS = 0.25;
export const STEP_UP = 0.6;
export const ACTOR_HEAD_CLEARANCE = 1.85;
/** The convoy avenue runs east-west along this street centerline. */
export const AVENUE_Z = 0;

const CORE_WIDTH = 2.6;
const RAMP_LENGTH = 7.2;

export type BuildingRole =
  | 'SAFEHOUSE'
  | 'PRECINCT'
  | 'POST_OFFICE'
  | 'BROADCAST'
  | 'HOSPITAL'
  | 'RECORDS'
  | 'HOTEL'
  | 'SUBSTATION'
  | 'GARAGE'
  | 'COURTHOUSE'
  | 'BANK'
  | 'TOWER'
  | 'APARTMENT'
  | 'OFFICE'
  | 'SHOPS';

export type LootKind = 'AMMO' | 'MEDKIT' | 'SALVAGE' | 'ARMOR' | 'DOSSIER';

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface LootSpot {
  id: string;
  buildingId: string;
  floor: number;
  x: number;
  z: number;
  kind: LootKind;
}

export interface WallBox {
  cx: number;
  cz: number;
  sx: number;
  sz: number;
  y0: number;
  y1: number;
  kind: 'EXTERIOR' | 'INTERIOR' | 'CORE';
}

export interface Building {
  id: string;
  index: number;
  name: string;
  role: BuildingRole;
  footprint: Rect;
  floors: number;
  /** Stair core rectangle (inner clear area). Ramps run +Z from minZ to maxZ. */
  core: Rect;
  doorSide: 'N' | 'S';
  doorX: number;
  /** Rooms per floor (inner rects) used for enemy patrols and loot. */
  rooms: Rect[];
  walls: WallBox[];
  loot: LootSpot[];
  facadeTone: number;
  isSpecial: boolean;
}

export interface CityBlock {
  i: number;
  j: number;
  cx: number;
  cz: number;
  kind: 'BUILDINGS' | 'PLAZA' | 'PARK';
  name?: string;
}

export interface CityLayout {
  blocks: CityBlock[];
  buildings: Building[];
  byId: Map<string, Building>;
  lootById: Map<string, LootSpot>;
}

export function createSeededRng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function blockCenter(index: number): number {
  return -CITY_HALF_EXTENT + 30 + index * BLOCK_PITCH;
}

export function floorY(floor: number): number {
  return floor * FLOOR_HEIGHT;
}

interface SpecialSpec {
  i: number;
  j: number;
  id: string;
  name: string;
  role: BuildingRole;
  w: number;
  d: number;
  floors: number;
}

/** Fixed story locations. Grid: i = west→east, j = north→south. */
export const SPECIAL_BUILDINGS: ReadonlyArray<SpecialSpec> = [
  { i: 0, j: 5, id: 'safehouse', name: 'Kestrel Row Apartments (Safehouse)', role: 'SAFEHOUSE', w: 22, d: 18, floors: 3 },
  { i: 2, j: 5, id: 'post', name: 'Central Post & Telegraph', role: 'POST_OFFICE', w: 30, d: 22, floors: 2 },
  { i: 1, j: 4, id: 'precinct', name: '9th Precinct Station', role: 'PRECINCT', w: 28, d: 26, floors: 3 },
  { i: 4, j: 4, id: 'hospital', name: 'St. Aurel General Hospital', role: 'HOSPITAL', w: 32, d: 30, floors: 5 },
  { i: 2, j: 3, id: 'records', name: 'Municipal Records Hall', role: 'RECORDS', w: 28, d: 24, floors: 3 },
  { i: 3, j: 3, id: 'courthouse', name: 'Varos Hall of Justice', role: 'COURTHOUSE', w: 32, d: 28, floors: 4 },
  { i: 5, j: 3, id: 'substation', name: 'Varos East Power Substation', role: 'SUBSTATION', w: 26, d: 20, floors: 2 },
  { i: 0, j: 2, id: 'broadcast', name: 'Meridian Broadcast House', role: 'BROADCAST', w: 24, d: 22, floors: 5 },
  { i: 2, j: 2, id: 'bank', name: 'Meridian Reserve Bank', role: 'BANK', w: 32, d: 28, floors: 3 },
  { i: 1, j: 1, id: 'garage', name: 'Ostrava Parking Structure', role: 'GARAGE', w: 32, d: 30, floors: 4 },
  { i: 3, j: 1, id: 'hotel', name: 'Hotel Imperial', role: 'HOTEL', w: 26, d: 24, floors: 7 },
  { i: 3, j: 0, id: 'tower', name: 'Ashgrove Consortium Tower', role: 'TOWER', w: 26, d: 26, floors: 9 },
];

const OPEN_BLOCKS: ReadonlyArray<{ i: number; j: number; kind: 'PLAZA' | 'PARK'; name: string }> = [
  { i: 3, j: 2, kind: 'PLAZA', name: 'Liberty Plaza' },
  { i: 0, j: 0, kind: 'PARK', name: 'Northgate Park' },
  { i: 5, j: 0, kind: 'PARK', name: 'Old Fortress Green' },
];

const GENERIC_NAMES: Record<'APARTMENT' | 'OFFICE' | 'SHOPS', string[]> = {
  APARTMENT: ['Linden Flats', 'Morava Tenements', 'Harbor Court', 'Sokol House', 'Brightwater Flats', 'Vesna Block', 'Iron Lane Flats', 'Corvin Residences'],
  OFFICE: ['Halvard Trading Co.', 'Danube Insurance', 'Pellar Shipping Office', 'Grey Ledger Offices', 'Union Telegraph Annex', 'Steelmark Offices'],
  SHOPS: ['Market Arcade', 'Old Town Shops', 'Kovac Department Store', 'Cannery Row Stores', 'Tram Depot Shops'],
};

function rectContains(r: Rect, x: number, z: number, pad = 0): boolean {
  return x >= r.minX - pad && x <= r.maxX + pad && z >= r.minZ - pad && z <= r.maxZ + pad;
}

/**
 * Builds the interior: exterior walls with windows + doorway, stair core walls, partitions,
 * rooms and loot spots. Everything is axis-aligned so collision stays simple.
 */
function buildBuilding(
  index: number,
  id: string,
  name: string,
  role: BuildingRole,
  cx: number,
  cz: number,
  w: number,
  d: number,
  floors: number,
  doorSide: 'N' | 'S',
  rng: () => number,
  isSpecial: boolean
): Building {
  const footprint: Rect = { minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 };
  const t = WALL_THICKNESS;
  const H = FLOOR_HEIGHT;
  const walls: WallBox[] = [];

  const coreMinX = footprint.minX + t;
  const coreMaxX = coreMinX + CORE_WIDTH;
  const core: Rect = {
    minX: coreMinX,
    maxX: coreMaxX,
    minZ: cz - RAMP_LENGTH / 2,
    maxZ: cz + RAMP_LENGTH / 2,
  };

  const innerMinX = coreMaxX + t;
  const partitionX = innerMinX + (footprint.maxX - t - innerMinX) * 0.5;
  const doorX = innerMinX + (partitionX - innerMinX) * 0.5;

  const windowWidth = 1.7;
  const sill = 1.0;
  const lintel = 2.4;

  // Exterior wall along X (north or south face) at fixed z.
  const addXWall = (z: number, floor: number, withDoor: boolean) => {
    const y0 = floorY(floor);
    const len = w;
    const count = Math.max(1, Math.floor(len / 6));
    const openings: Array<{ c: number; width: number; door: boolean }> = [];
    for (let k = 0; k < count; k++) {
      const c = footprint.minX + (len * (k + 0.5)) / count;
      openings.push({ c, width: windowWidth, door: false });
    }
    if (withDoor) {
      // Replace the opening nearest the door with a doorway.
      let best = 0;
      for (let k = 1; k < openings.length; k++) {
        if (Math.abs(openings[k].c - doorX) < Math.abs(openings[best].c - doorX)) best = k;
      }
      openings[best] = { c: doorX, width: 2.2, door: true };
    }
    openings.sort((a, b) => a.c - b.c);
    let cursor = footprint.minX;
    for (const op of openings) {
      const a = op.c - op.width / 2;
      const b = op.c + op.width / 2;
      if (a - cursor > 0.05) {
        walls.push({ cx: (cursor + a) / 2, cz: z, sx: a - cursor, sz: t, y0, y1: y0 + H, kind: 'EXTERIOR' });
      }
      if (!op.door) {
        walls.push({ cx: op.c, cz: z, sx: op.width, sz: t, y0, y1: y0 + sill, kind: 'EXTERIOR' });
      }
      walls.push({ cx: op.c, cz: z, sx: op.width, sz: t, y0: y0 + (op.door ? 2.7 : lintel), y1: y0 + H, kind: 'EXTERIOR' });
      cursor = b;
    }
    if (footprint.maxX - cursor > 0.05) {
      walls.push({ cx: (cursor + footprint.maxX) / 2, cz: z, sx: footprint.maxX - cursor, sz: t, y0, y1: y0 + H, kind: 'EXTERIOR' });
    }
  };

  // Exterior wall along Z (west or east face) at fixed x. West face has no windows by the stair core.
  const addZWall = (x: number, floor: number, windows: boolean) => {
    const y0 = floorY(floor);
    const minZ = footprint.minZ + t;
    const maxZ = footprint.maxZ - t;
    if (!windows) {
      walls.push({ cx: x, cz: (minZ + maxZ) / 2, sx: t, sz: maxZ - minZ, y0, y1: y0 + H, kind: 'EXTERIOR' });
      return;
    }
    const len = maxZ - minZ;
    const count = Math.max(1, Math.floor(len / 6));
    let cursor = minZ;
    for (let k = 0; k < count; k++) {
      const c = minZ + (len * (k + 0.5)) / count;
      const a = c - windowWidth / 2;
      const b = c + windowWidth / 2;
      walls.push({ cx: x, cz: (cursor + a) / 2, sx: t, sz: a - cursor, y0, y1: y0 + H, kind: 'EXTERIOR' });
      walls.push({ cx: x, cz: c, sx: t, sz: windowWidth, y0, y1: y0 + sill, kind: 'EXTERIOR' });
      walls.push({ cx: x, cz: c, sx: t, sz: windowWidth, y0: y0 + lintel, y1: y0 + H, kind: 'EXTERIOR' });
      cursor = b;
    }
    walls.push({ cx: x, cz: (cursor + maxZ) / 2, sx: t, sz: maxZ - cursor, y0, y1: y0 + H, kind: 'EXTERIOR' });
  };

  const rooms: Rect[] = [];
  const westRoom: Rect = { minX: innerMinX + 0.4, maxX: partitionX - 0.6, minZ: footprint.minZ + 0.8, maxZ: footprint.maxZ - 0.8 };
  const bigEast = d >= 26;
  const splitZ = cz;
  if (bigEast) {
    rooms.push(westRoom);
    rooms.push({ minX: partitionX + 0.6, maxX: footprint.maxX - 0.8, minZ: footprint.minZ + 0.8, maxZ: splitZ - 0.6 });
    rooms.push({ minX: partitionX + 0.6, maxX: footprint.maxX - 0.8, minZ: splitZ + 0.6, maxZ: footprint.maxZ - 0.8 });
  } else {
    rooms.push(westRoom);
    rooms.push({ minX: partitionX + 0.6, maxX: footprint.maxX - 0.8, minZ: footprint.minZ + 0.8, maxZ: footprint.maxZ - 0.8 });
  }

  for (let f = 0; f < floors; f++) {
    const y0 = floorY(f);
    addXWall(footprint.minZ + t / 2, f, f === 0 && doorSide === 'N');
    addXWall(footprint.maxZ - t / 2, f, f === 0 && doorSide === 'S');
    addZWall(footprint.minX + t / 2, f, false);
    addZWall(footprint.maxX - t / 2, f, true);

    // Stair core inner side wall (open at both ends).
    walls.push({ cx: coreMaxX + t / 2, cz, sx: t, sz: RAMP_LENGTH, y0, y1: y0 + H, kind: 'CORE' });

    // Partition along Z at partitionX with two doorways.
    const pMinZ = footprint.minZ + t;
    const pMaxZ = footprint.maxZ - t;
    const doorA = pMinZ + (pMaxZ - pMinZ) * 0.25;
    const doorB = pMinZ + (pMaxZ - pMinZ) * 0.75;
    const dw = 1.4;
    const segs: Array<[number, number]> = [
      [pMinZ, doorA - dw / 2],
      [doorA + dw / 2, doorB - dw / 2],
      [doorB + dw / 2, pMaxZ],
    ];
    for (const [a, b] of segs) {
      if (b - a > 0.1) walls.push({ cx: partitionX, cz: (a + b) / 2, sx: 0.2, sz: b - a, y0, y1: y0 + H - 0.02, kind: 'INTERIOR' });
    }
    for (const dz of [doorA, doorB]) {
      walls.push({ cx: partitionX, cz: dz, sx: 0.2, sz: dw, y0: y0 + 2.3, y1: y0 + H - 0.02, kind: 'INTERIOR' });
    }

    if (bigEast) {
      const qMinX = partitionX + 0.1;
      const qMaxX = footprint.maxX - t;
      const doorC = (qMinX + qMaxX) / 2;
      walls.push({ cx: (qMinX + doorC - 0.7) / 2, cz: splitZ, sx: doorC - 0.7 - qMinX, sz: 0.2, y0, y1: y0 + H - 0.02, kind: 'INTERIOR' });
      walls.push({ cx: (doorC + 0.7 + qMaxX) / 2, cz: splitZ, sx: qMaxX - doorC - 0.7, sz: 0.2, y0, y1: y0 + H - 0.02, kind: 'INTERIOR' });
      walls.push({ cx: doorC, cz: splitZ, sx: 1.4, sz: 0.2, y0: y0 + 2.3, y1: y0 + H - 0.02, kind: 'INTERIOR' });
    }
  }

  // Loot: 2-3 spots per floor in rooms.
  const loot: LootSpot[] = [];
  const kinds: LootKind[] = ['AMMO', 'SALVAGE', 'MEDKIT', 'AMMO', 'ARMOR', 'SALVAGE'];
  for (let f = 0; f < floors; f++) {
    const count = 2 + (rng() < 0.45 ? 1 : 0);
    for (let k = 0; k < count; k++) {
      const room = rooms[(k + f) % rooms.length];
      // Place near a room corner so crates sit against walls.
      const cornerX = rng() < 0.5 ? room.minX + 0.6 : room.maxX - 0.6;
      const cornerZ = room.minZ + 0.8 + rng() * Math.max(0.1, room.maxZ - room.minZ - 1.6);
      const roll = rng();
      const kind: LootKind = roll < 0.06 ? 'DOSSIER' : kinds[Math.floor(rng() * kinds.length)];
      loot.push({ id: `${id}-f${f}-l${k}`, buildingId: id, floor: f, x: cornerX, z: cornerZ, kind });
    }
  }

  return {
    id,
    index,
    name,
    role,
    footprint,
    floors,
    core,
    doorSide,
    doorX,
    rooms,
    walls,
    loot,
    facadeTone: rng(),
    isSpecial,
  };
}

let cachedLayout: CityLayout | null = null;

export function getCityLayout(): CityLayout {
  if (cachedLayout) return cachedLayout;
  const rng = createSeededRng(20311104);
  const blocks: CityBlock[] = [];
  const buildings: Building[] = [];
  const nameCursor = { APARTMENT: 0, OFFICE: 0, SHOPS: 0 };

  for (let j = 0; j < BLOCKS_PER_SIDE; j++) {
    for (let i = 0; i < BLOCKS_PER_SIDE; i++) {
      const cx = blockCenter(i);
      const cz = blockCenter(j);
      const open = OPEN_BLOCKS.find((b) => b.i === i && b.j === j);
      if (open) {
        blocks.push({ i, j, cx, cz, kind: open.kind, name: open.name });
        continue;
      }
      blocks.push({ i, j, cx, cz, kind: 'BUILDINGS' });
      const special = SPECIAL_BUILDINGS.find((s) => s.i === i && s.j === j);
      // Door faces the avenue side of the block when possible.
      const doorSide: 'N' | 'S' = cz < AVENUE_Z ? 'S' : 'N';
      if (special) {
        buildings.push(
          buildBuilding(buildings.length, special.id, special.name, special.role, cx, cz, special.w, special.d, special.floors, doorSide, rng, true)
        );
        continue;
      }

      const roll = rng();
      const lots: Array<{ x: number; z: number; w: number; d: number; door: 'N' | 'S' }> = [];
      const inset = BLOCK_SIZE / 2 - 2;
      if (roll < 0.3) {
        lots.push({ x: cx, z: cz, w: 30 + Math.floor(rng() * 5), d: 26 + Math.floor(rng() * 6), door: doorSide });
      } else if (roll < 0.75) {
        const w = 16;
        lots.push({ x: cx - inset + w / 2, z: cz, w, d: 30, door: doorSide });
        lots.push({ x: cx + inset - w / 2, z: cz, w, d: 30, door: doorSide });
      } else {
        const s = 16;
        lots.push({ x: cx - inset + s / 2, z: cz - inset + s / 2, w: s, d: s + 0, door: 'N' });
        lots.push({ x: cx + inset - s / 2, z: cz - inset + s / 2, w: s, d: s, door: 'N' });
        lots.push({ x: cx - inset + s / 2, z: cz + inset - s / 2, w: s, d: s, door: 'S' });
        lots.push({ x: cx + inset - s / 2, z: cz + inset - s / 2, w: s, d: s, door: 'S' });
      }

      for (const lot of lots) {
        const typeRoll = rng();
        const role: 'APARTMENT' | 'OFFICE' | 'SHOPS' = typeRoll < 0.5 ? 'APARTMENT' : typeRoll < 0.8 ? 'OFFICE' : 'SHOPS';
        const floors = role === 'SHOPS' ? 2 : 2 + Math.floor(rng() * 3);
        const list = GENERIC_NAMES[role];
        const baseName = list[nameCursor[role] % list.length];
        const suffix = nameCursor[role] >= list.length ? ` ${Math.floor(nameCursor[role] / list.length) + 1}` : '';
        nameCursor[role]++;
        const bid = `b${i}${j}-${lots.indexOf(lot)}`;
        buildings.push(buildBuilding(buildings.length, bid, baseName + suffix, role, lot.x, lot.z, lot.w, lot.d, floors, lot.door, rng, false));
      }
    }
  }

  const byId = new Map<string, Building>();
  const lootById = new Map<string, LootSpot>();
  for (const b of buildings) {
    byId.set(b.id, b);
    for (const l of b.loot) lootById.set(l.id, l);
  }
  cachedLayout = { blocks, buildings, byId, lootById };
  return cachedLayout;
}

/** Finds the building whose footprint contains the point (with optional padding). */
export function findBuildingAt(x: number, z: number, pad = 0): Building | null {
  const layout = getCityLayout();
  for (const b of layout.buildings) {
    if (rectContains(b.footprint, x, z, pad)) return b;
  }
  return null;
}

/** Ramp surface height for ramp `r` (floor r → r+1) at z, or null when outside. */
function rampHeight(b: Building, r: number, x: number, z: number): number | null {
  if (!rectContains(b.core, x, z)) return null;
  const t = (z - b.core.minZ) / (b.core.maxZ - b.core.minZ);
  return floorY(r) + Math.max(0, Math.min(1, t)) * FLOOR_HEIGHT;
}

function forEachSurface(b: Building, x: number, z: number, cb: (h: number) => void) {
  const inCore = rectContains(b.core, x, z);
  for (let f = 1; f <= b.floors; f++) {
    // Slab f has a stair hole when ramp f-1 exists (f <= floors-1).
    const hasHole = f <= b.floors - 1;
    if (hasHole && inCore) continue;
    cb(floorY(f));
  }
  for (let r = 0; r < b.floors - 1; r++) {
    const h = rampHeight(b, r, x, z);
    if (h !== null) cb(h);
  }
}

/**
 * Highest walkable surface at (x, z) that an actor whose feet are at `y` can stand on
 * (step-up tolerance included). Street level is 0.
 */
export function sampleCitySupport(x: number, z: number, y: number): number {
  const b = findBuildingAt(x, z);
  let best = 0;
  if (!b) return best;
  forEachSurface(b, x, z, (h) => {
    if (h <= y + STEP_UP && h > best) best = h;
  });
  return best;
}

/** True when a ramp or slab would intersect an actor's body at (x, z, y) — e.g. walking under low stairs. */
export function isBlockedByStairs(x: number, z: number, y: number): boolean {
  const b = findBuildingAt(x, z);
  if (!b || !rectContains(b.core, x, z)) return false;
  for (let r = 0; r < b.floors - 1; r++) {
    const h = rampHeight(b, r, x, z);
    if (h === null) continue;
    if (h > y + STEP_UP && h < y + ACTOR_HEAD_CLEARANCE) return true;
  }
  return false;
}

/** Floor index the actor stands on inside a building, or -1 outside. */
export function getFloorAt(b: Building, y: number): number {
  return Math.max(0, Math.min(b.floors - 1, Math.round(y / FLOOR_HEIGHT - 0.1)));
}

export function getBuildingEntrance(b: Building): { x: number; z: number } {
  const z = b.doorSide === 'N' ? b.footprint.minZ - 2.2 : b.footprint.maxZ + 2.2;
  return { x: b.doorX, z };
}

/** Deterministic enemy posts on a floor (inside rooms, away from the stair core). */
export function getFloorPosts(b: Building, floor: number, count: number): Array<{ x: number; z: number; room: Rect }> {
  const rng = createSeededRng(b.index * 131 + floor * 17 + count);
  const out: Array<{ x: number; z: number; room: Rect }> = [];
  for (let k = 0; k < count; k++) {
    const room = b.rooms[k % b.rooms.length];
    out.push({
      x: room.minX + 0.6 + rng() * Math.max(0.2, room.maxX - room.minX - 1.2),
      z: room.minZ + 0.6 + rng() * Math.max(0.2, room.maxZ - room.minZ - 1.2),
      room,
    });
  }
  return out;
}
