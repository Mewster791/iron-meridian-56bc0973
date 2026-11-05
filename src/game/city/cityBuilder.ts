import * as THREE from 'three';
import { StaticWorldPhysics } from '../systems/staticCollisionSystem';
import {
  AVENUE_Z,
  BLOCK_SIZE,
  Building,
  CITY_HALF_EXTENT,
  CityLayout,
  FLOOR_HEIGHT,
  LootKind,
  SLAB_THICKNESS,
  WALL_THICKNESS,
  blockCenter,
  BLOCKS_PER_SIDE,
  floorY,
} from './cityLayout';

/** Accumulates axis-aligned boxes into one vertex-colored BufferGeometry. */
class BoxBatch {
  positions: number[] = [];
  normals: number[] = [];
  colors: number[] = [];
  uvs: number[] = [];
  indices: number[] = [];

  add(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, color: THREE.Color, uvMode: 'world' | 'facade' = 'world') {
    const faces: Array<{ n: [number, number, number]; v: Array<[number, number, number]> }> = [
      { n: [1, 0, 0], v: [[maxX, minY, maxZ], [maxX, minY, minZ], [maxX, maxY, minZ], [maxX, maxY, maxZ]] },
      { n: [-1, 0, 0], v: [[minX, minY, minZ], [minX, minY, maxZ], [minX, maxY, maxZ], [minX, maxY, minZ]] },
      { n: [0, 1, 0], v: [[minX, maxY, maxZ], [maxX, maxY, maxZ], [maxX, maxY, minZ], [minX, maxY, minZ]] },
      { n: [0, -1, 0], v: [[minX, minY, minZ], [maxX, minY, minZ], [maxX, minY, maxZ], [minX, minY, maxZ]] },
      { n: [0, 0, 1], v: [[minX, minY, maxZ], [maxX, minY, maxZ], [maxX, maxY, maxZ], [minX, maxY, maxZ]] },
      { n: [0, 0, -1], v: [[maxX, minY, minZ], [minX, minY, minZ], [minX, maxY, minZ], [maxX, maxY, minZ]] },
    ];
    for (const f of faces) {
      const base = this.positions.length / 3;
      for (const [x, y, z] of f.v) {
        this.positions.push(x, y, z);
        this.normals.push(f.n[0], f.n[1], f.n[2]);
        this.colors.push(color.r, color.g, color.b);
        if (uvMode === 'facade') {
          if (f.n[1] !== 0) this.uvs.push(0.01, 0.01);
          else this.uvs.push((f.n[0] !== 0 ? z : x) / 6, y / FLOOR_HEIGHT);
        } else if (f.n[1] !== 0) {
          this.uvs.push(x / 4, z / 4);
        } else {
          this.uvs.push((f.n[0] !== 0 ? z : x) / 4, y / 4);
        }
      }
      this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    g.setIndex(this.indices);
    g.computeBoundingSphere();
    return g;
  }
}

const FACADE_PALETTE = ['#b7a58b', '#9d8b77', '#a6a8a1', '#8f604b', '#c4b79c', '#7f8b81', '#a9947a', '#94847a'];
const ROLE_COLORS: Partial<Record<Building['role'], string>> = {
  SAFEHOUSE: '#a98f6f',
  PRECINCT: '#6f7b8b',
  POST_OFFICE: '#b69a6a',
  BROADCAST: '#7d7f86',
  HOSPITAL: '#d3d0c5',
  RECORDS: '#a38d73',
  HOTEL: '#b46f55',
  SUBSTATION: '#6c6f6a',
  GARAGE: '#8a8a86',
  COURTHOUSE: '#c9c1ad',
  BANK: '#d0c8b4',
  TOWER: '#56606b',
};

function makeWindowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#2a2f36';
  ctx.fillRect(22, 18, 20, 26);
  ctx.fillStyle = 'rgba(255,214,150,0.55)';
  ctx.fillRect(24, 20, 7, 10);
  ctx.fillStyle = '#d9d4cb';
  ctx.fillRect(0, 60, 64, 4);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeGroundTexture(layout: CityLayout): THREE.CanvasTexture {
  const size = 2048;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const ext = CITY_HALF_EXTENT + 10;
  const s = size / (ext * 2);
  const tx = (x: number) => (x + ext) * s;

  ctx.fillStyle = '#3a3c3f';
  ctx.fillRect(0, 0, size, size);
  // Asphalt grain
  for (let i = 0; i < 9000; i++) {
    const v = 50 + Math.floor(Math.random() * 18);
    ctx.fillStyle = `rgb(${v},${v + 1},${v + 3})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }

  for (const blk of layout.blocks) {
    const half = BLOCK_SIZE / 2;
    const x0 = tx(blk.cx - half);
    const z0 = tx(blk.cz - half);
    const w = BLOCK_SIZE * s;
    // Curb + sidewalk
    ctx.fillStyle = '#8d8a83';
    ctx.fillRect(x0, z0, w, w);
    ctx.fillStyle = blk.kind === 'PARK' ? '#4b5a3a' : blk.kind === 'PLAZA' ? '#a39c8e' : '#7b776f';
    ctx.fillRect(x0 + 2.4 * s, z0 + 2.4 * s, w - 4.8 * s, w - 4.8 * s);
    if (blk.kind === 'PLAZA') {
      ctx.strokeStyle = 'rgba(80,70,60,0.35)';
      ctx.lineWidth = 1;
      for (let g = 0; g < 40; g += 2) {
        ctx.beginPath();
        ctx.moveTo(x0 + g * s, z0);
        ctx.lineTo(x0 + g * s, z0 + w);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x0, z0 + g * s);
        ctx.lineTo(x0 + w, z0 + g * s);
        ctx.stroke();
      }
    }
    if (blk.kind === 'PARK') {
      ctx.fillStyle = '#9b8c6e';
      ctx.fillRect(x0 + w / 2 - 1.5 * s, z0, 3 * s, w);
      ctx.fillRect(x0, z0 + w / 2 - 1.5 * s, w, 3 * s);
    }
  }

  // Lane markings
  ctx.strokeStyle = 'rgba(230,220,180,0.7)';
  ctx.lineWidth = 0.35 * s;
  ctx.setLineDash([3 * s, 3 * s]);
  for (let k = 0; k <= BLOCKS_PER_SIDE; k++) {
    const c0 = blockCenter(k) - 26;
    ctx.beginPath();
    ctx.moveTo(tx(c0), tx(-ext));
    ctx.lineTo(tx(c0), tx(ext));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tx(-ext), tx(c0));
    ctx.lineTo(tx(ext), tx(c0));
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(214,170,60,0.85)';
  ctx.lineWidth = 0.3 * s;
  ctx.beginPath();
  ctx.moveTo(tx(-ext), tx(AVENUE_Z - 0.25));
  ctx.lineTo(tx(ext), tx(AVENUE_Z - 0.25));
  ctx.moveTo(tx(-ext), tx(AVENUE_Z + 0.25));
  ctx.lineTo(tx(ext), tx(AVENUE_Z + 0.25));
  ctx.stroke();

  // Building footprints darken the ground under them (keeps interiors' floor readable).
  for (const b of layout.buildings) {
    ctx.fillStyle = '#5c544b';
    ctx.fillRect(tx(b.footprint.minX), tx(b.footprint.minZ), (b.footprint.maxX - b.footprint.minX) * s, (b.footprint.maxZ - b.footprint.minZ) * s);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export interface CityScene {
  root: THREE.Group;
  lootMesh: THREE.InstancedMesh;
  lootIndexById: Map<string, number>;
  hideLoot: (id: string) => void;
  setBuildingDestroyed: (b: Building) => void;
  dispose: () => void;
}

const LOOT_COLORS: Record<LootKind, string> = {
  AMMO: '#5d6b3c',
  MEDKIT: '#e5e1d8',
  SALVAGE: '#6b7078',
  ARMOR: '#3f6ea8',
  DOSSIER: '#d49a2a',
};

export function buildCityScene(
  layout: CityLayout,
  physics: StaticWorldPhysics,
  opts: { castShadows: boolean; concreteBump: THREE.Texture; lootedIds: ReadonlySet<string>; destroyedIds: ReadonlySet<string> }
): CityScene {
  const root = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];

  // Ground
  const groundTex = makeGroundTexture(layout);
  const groundGeo = new THREE.PlaneGeometry((CITY_HALF_EXTENT + 10) * 2, (CITY_HALF_EXTENT + 10) * 2);
  groundGeo.rotateX(-Math.PI / 2);
  const groundMat = new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95, metalness: 0 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.receiveShadow = true;
  root.add(ground);
  disposables.push(groundTex, groundGeo, groundMat);

  const bump = opts.concreteBump.clone();
  bump.repeat.set(1, 1);
  bump.needsUpdate = true;
  const detailMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.02, bumpMap: bump, bumpScale: 0.6 });
  const windowTex = makeWindowTexture();
  const shellMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.02, map: windowTex });
  disposables.push(bump, detailMat, windowTex, shellMat);

  const interiorCol = new THREE.Color('#cfc5b2');
  const coreCol = new THREE.Color('#9b958b');
  const floorCol = new THREE.Color('#7a6a58');
  const roofCol = new THREE.Color('#4b4946');
  const stepCol = new THREE.Color('#857f77');
  const tmp = new THREE.Color();

  const buildingObjects = new Map<string, THREE.Object3D>();

  for (const b of layout.buildings) {
    const fp = b.footprint;
    const facade = new THREE.Color(ROLE_COLORS[b.role] ?? FACADE_PALETTE[Math.floor(b.facadeTone * FACADE_PALETTE.length) % FACADE_PALETTE.length]);
    const detail = new BoxBatch();
    const group = b.id;

    for (const wbox of b.walls) {
      const col = wbox.kind === 'EXTERIOR' ? facade : wbox.kind === 'CORE' ? coreCol : interiorCol;
      detail.add(wbox.cx - wbox.sx / 2, wbox.y0, wbox.cz - wbox.sz / 2, wbox.cx + wbox.sx / 2, wbox.y1, wbox.cz + wbox.sz / 2, col);
      physics.addBox({
        id: `${b.id}-w`,
        cx: wbox.cx,
        cz: wbox.cz,
        widthX: wbox.sx,
        depthZ: wbox.sz,
        minY: wbox.y0,
        maxY: wbox.y1,
        material: 'CONCRETE',
        walkableTop: false,
        group,
      });
    }

    // Ground floor tiles (visual only).
    detail.add(fp.minX + WALL_THICKNESS, 0, fp.minZ + WALL_THICKNESS, fp.maxX - WALL_THICKNESS, 0.03, fp.maxZ - WALL_THICKNESS, floorCol);

    // Slabs with stair holes.
    for (let f = 1; f <= b.floors; f++) {
      const top = floorY(f);
      const bot = top - SLAB_THICKNESS;
      const isRoof = f === b.floors;
      const col = isRoof ? roofCol : floorCol;
      const pieces: Array<[number, number, number, number]> = [];
      if (!isRoof) {
        pieces.push([fp.minX, fp.minZ, fp.maxX, b.core.minZ]);
        pieces.push([fp.minX, b.core.maxZ, fp.maxX, fp.maxZ]);
        pieces.push([b.core.maxX, b.core.minZ, fp.maxX, b.core.maxZ]);
      } else {
        pieces.push([fp.minX, fp.minZ, fp.maxX, fp.maxZ]);
      }
      for (const [x0, z0, x1, z1] of pieces) {
        detail.add(x0, bot, z0, x1, top, z1, col);
        physics.addBox({
          id: `${b.id}-s`,
          cx: (x0 + x1) / 2,
          cz: (z0 + z1) / 2,
          widthX: x1 - x0,
          depthZ: z1 - z0,
          minY: bot,
          maxY: top,
          material: 'CONCRETE',
          walkableTop: true,
          stepUp: 0.65,
          group,
        });
      }
      if (isRoof) {
        // Parapet
        tmp.copy(facade).multiplyScalar(0.85);
        detail.add(fp.minX, top, fp.minZ, fp.maxX, top + 0.9, fp.minZ + 0.3, tmp);
        detail.add(fp.minX, top, fp.maxZ - 0.3, fp.maxX, top + 0.9, fp.maxZ, tmp);
        detail.add(fp.minX, top, fp.minZ, fp.minX + 0.3, top + 0.9, fp.maxZ, tmp);
        detail.add(fp.maxX - 0.3, top, fp.minZ, fp.maxX, top + 0.9, fp.maxZ, tmp);
      }
    }

    // Stair treads (collision is analytic in cityLayout.sampleCitySupport).
    const steps = 12;
    const runZ = (b.core.maxZ - b.core.minZ) / steps;
    for (let r = 0; r < b.floors - 1; r++) {
      for (let k = 0; k < steps; k++) {
        const z0 = b.core.minZ + k * runZ;
        const yTop = floorY(r) + ((k + 0.5) / steps) * FLOOR_HEIGHT;
        detail.add(b.core.minX, yTop - 0.2, z0, b.core.maxX, yTop, z0 + runZ, stepCol);
      }
    }

    const detailMesh = new THREE.Mesh(detail.build(), detailMat);
    detailMesh.castShadow = opts.castShadows;
    detailMesh.receiveShadow = true;
    disposables.push(detailMesh.geometry);

    const shell = new BoxBatch();
    const height = floorY(b.floors);
    shell.add(fp.minX, 0, fp.minZ, fp.maxX, height, fp.maxZ, facade, 'facade');
    tmp.copy(facade).multiplyScalar(0.85);
    shell.add(fp.minX, height, fp.minZ, fp.maxX, height + 0.9, fp.maxZ, tmp, 'facade');
    const shellMesh = new THREE.Mesh(shell.build(), shellMat);
    shellMesh.castShadow = opts.castShadows;
    disposables.push(shellMesh.geometry);

    const lod = new THREE.LOD();
    lod.addLevel(detailMesh, 0);
    lod.addLevel(shellMesh, 85);
    lod.position.set(0, 0, 0);
    root.add(lod);
    buildingObjects.set(b.id, lod);
  }

  // Loot crates (instanced; looted ones are scaled to zero).
  const allLoot = layout.buildings.flatMap((b) => b.loot);
  const lootGeo = new THREE.BoxGeometry(0.95, 0.62, 0.62);
  lootGeo.translate(0, 0.31, 0);
  const lootMat = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.25, emissive: '#2a1d08', emissiveIntensity: 0.35 });
  const lootMesh = new THREE.InstancedMesh(lootGeo, lootMat, allLoot.length);
  lootMesh.castShadow = opts.castShadows;
  const dummy = new THREE.Object3D();
  const lootIndexById = new Map<string, number>();
  allLoot.forEach((l, idx) => {
    lootIndexById.set(l.id, idx);
    dummy.position.set(l.x, floorY(l.floor) + 0.02, l.z);
    dummy.rotation.set(0, (idx % 4) * (Math.PI / 2) + 0.15, 0);
    dummy.scale.setScalar(opts.lootedIds.has(l.id) ? 0 : 1);
    dummy.updateMatrix();
    lootMesh.setMatrixAt(idx, dummy.matrix);
    lootMesh.setColorAt(idx, tmp.set(LOOT_COLORS[l.kind]));
  });
  lootMesh.instanceMatrix.needsUpdate = true;
  if (lootMesh.instanceColor) lootMesh.instanceColor.needsUpdate = true;
  lootMesh.computeBoundingSphere();
  root.add(lootMesh);
  disposables.push(lootGeo, lootMat);

  const hideLoot = (id: string) => {
    const idx = lootIndexById.get(id);
    if (idx === undefined) return;
    lootMesh.getMatrixAt(idx, dummy.matrix);
    dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
    dummy.scale.setScalar(0);
    dummy.updateMatrix();
    lootMesh.setMatrixAt(idx, dummy.matrix);
    lootMesh.instanceMatrix.needsUpdate = true;
  };

  // Street props: parked cars (solid cover), street lamps, park trees, plaza fountain.
  buildStreetProps(root, physics, layout, opts.castShadows, disposables);

  // Rubble for destroyed buildings.
  const rubbleMat = new THREE.MeshStandardMaterial({ color: '#5e5850', roughness: 1, bumpMap: bump, bumpScale: 0.8 });
  disposables.push(rubbleMat);
  const setBuildingDestroyed = (b: Building) => {
    const obj = buildingObjects.get(b.id);
    if (!obj || !obj.visible) return;
    obj.visible = false;
    physics.setGroupActive(b.id, false);
    for (const l of b.loot) hideLoot(l.id);
    const rubble = new BoxBatch();
    const fp = b.footprint;
    const w = fp.maxX - fp.minX;
    const d = fp.maxZ - fp.minZ;
    let seed = b.index * 7 + 3;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const col = new THREE.Color('#6a635a');
    for (let k = 0; k < 28; k++) {
      const cx = fp.minX + rnd() * w;
      const cz = fp.minZ + rnd() * d;
      const sx = 2 + rnd() * 4;
      const sz = 2 + rnd() * 4;
      const sy = 0.6 + rnd() * 2.2;
      rubble.add(cx - sx / 2, 0, cz - sz / 2, cx + sx / 2, sy, cz + sz / 2, col.clone().multiplyScalar(0.8 + rnd() * 0.4));
    }
    // Standing wall stubs
    rubble.add(fp.minX, 0, fp.minZ, fp.minX + 0.4, 4 + rnd() * 3, fp.minZ + d * 0.4, col);
    rubble.add(fp.maxX - w * 0.35, 0, fp.maxZ - 0.4, fp.maxX, 3 + rnd() * 3, fp.maxZ, col);
    const mesh = new THREE.Mesh(rubble.build(), rubbleMat);
    mesh.castShadow = opts.castShadows;
    mesh.receiveShadow = true;
    root.add(mesh);
    disposables.push(mesh.geometry);
    physics.addBox({ id: `${b.id}-rubble`, cx: (fp.minX + fp.maxX) / 2, cz: (fp.minZ + fp.maxZ) / 2, widthX: w * 0.7, depthZ: d * 0.7, minY: 0, maxY: 1.4, material: 'CONCRETE', walkableTop: false });
  };
  for (const b of layout.buildings) {
    if (opts.destroyedIds.has(b.id)) setBuildingDestroyed(b);
  }

  return {
    root,
    lootMesh,
    lootIndexById,
    hideLoot,
    setBuildingDestroyed,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}

function buildStreetProps(
  root: THREE.Group,
  physics: StaticWorldPhysics,
  layout: CityLayout,
  castShadows: boolean,
  disposables: Array<{ dispose: () => void }>
) {
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  // Parked cars along curbs (skip the convoy lanes on the avenue).
  const carSpots: Array<{ x: number; z: number; yaw: number }> = [];
  let seed = 991;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let k = 0; k <= BLOCKS_PER_SIDE; k++) {
    const street = blockCenter(k) - 26;
    for (let m = 0; m < BLOCKS_PER_SIDE; m++) {
      const along = blockCenter(m);
      if (rnd() < 0.55) {
        const side = rnd() < 0.5 ? -1 : 1;
        // north-south street (x = street)
        carSpots.push({ x: street + side * 4.6, z: along + (rnd() - 0.5) * 24, yaw: 0 });
      }
      if (rnd() < 0.55 && Math.abs(street - AVENUE_Z) > 1) {
        const side = rnd() < 0.5 ? -1 : 1;
        carSpots.push({ x: along + (rnd() - 0.5) * 24, z: street + side * 4.6, yaw: Math.PI / 2 });
      }
    }
  }
  const carBody = new THREE.BoxGeometry(1.9, 0.9, 4.3);
  carBody.translate(0, 0.65, 0);
  const carCabin = new THREE.BoxGeometry(1.7, 0.7, 2.2);
  carCabin.translate(0, 1.42, -0.2);
  const carMat = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.5 });
  const glassMat = new THREE.MeshStandardMaterial({ color: '#1f262d', roughness: 0.2, metalness: 0.7 });
  const bodies = new THREE.InstancedMesh(carBody, carMat, carSpots.length);
  const cabins = new THREE.InstancedMesh(carCabin, glassMat, carSpots.length);
  bodies.castShadow = castShadows;
  const carPalette = ['#6b2a26', '#2f4a5e', '#4a4f45', '#8c8577', '#2b2b2e', '#5a5f66', '#7a6340'];
  carSpots.forEach((c, i) => {
    dummy.position.set(c.x, 0, c.z);
    dummy.rotation.set(0, c.yaw + (rnd() - 0.5) * 0.12, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    bodies.setMatrixAt(i, dummy.matrix);
    cabins.setMatrixAt(i, dummy.matrix);
    bodies.setColorAt(i, color.set(carPalette[i % carPalette.length]));
    physics.addBox({ id: `car-${i}`, cx: c.x, cz: c.z, widthX: c.yaw === 0 ? 1.9 : 4.3, depthZ: c.yaw === 0 ? 4.3 : 1.9, minY: 0, maxY: 1.75, material: 'STEEL', walkableTop: true });
  });
  bodies.instanceMatrix.needsUpdate = true;
  cabins.instanceMatrix.needsUpdate = true;
  if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
  bodies.computeBoundingSphere();
  cabins.computeBoundingSphere();
  root.add(bodies, cabins);
  disposables.push(carBody, carCabin, carMat, glassMat);

  // Street lamps at block corners.
  const lampGeo = new THREE.CylinderGeometry(0.08, 0.12, 6, 6);
  lampGeo.translate(0, 3, 0);
  const lampHeadGeo = new THREE.BoxGeometry(0.5, 0.18, 0.9);
  lampHeadGeo.translate(0, 6, 0.3);
  const lampMat = new THREE.MeshStandardMaterial({ color: '#2b2f33', roughness: 0.6, metalness: 0.6 });
  const lampHeadMat = new THREE.MeshStandardMaterial({ color: '#ffe3a8', emissive: '#ffcf7a', emissiveIntensity: 1.4 });
  const corners: Array<[number, number]> = [];
  for (const blk of layout.blocks) {
    const h = BLOCK_SIZE / 2 - 0.8;
    corners.push([blk.cx - h, blk.cz - h], [blk.cx + h, blk.cz + h]);
  }
  const lamps = new THREE.InstancedMesh(lampGeo, lampMat, corners.length);
  const heads = new THREE.InstancedMesh(lampHeadGeo, lampHeadMat, corners.length);
  corners.forEach(([x, z], i) => {
    dummy.position.set(x, 0, z);
    dummy.rotation.set(0, i % 2 === 0 ? Math.PI : 0, 0);
    dummy.updateMatrix();
    lamps.setMatrixAt(i, dummy.matrix);
    heads.setMatrixAt(i, dummy.matrix);
    physics.addCylinder({ id: `lamp-${i}`, cx: x, cz: z, radius: 0.15, minY: 0, maxY: 6, material: 'STEEL' });
  });
  lamps.computeBoundingSphere();
  heads.computeBoundingSphere();
  root.add(lamps, heads);
  disposables.push(lampGeo, lampHeadGeo, lampMat, lampHeadMat);

  // Trees in parks and around the plaza.
  const treeSpots: Array<[number, number]> = [];
  for (const blk of layout.blocks) {
    if (blk.kind === 'PARK') {
      for (let k = 0; k < 18; k++) {
        const x = blk.cx + (rnd() - 0.5) * 32;
        const z = blk.cz + (rnd() - 0.5) * 32;
        if (Math.abs(x - blk.cx) < 2.5 || Math.abs(z - blk.cz) < 2.5) continue;
        treeSpots.push([x, z]);
      }
    } else if (blk.kind === 'PLAZA') {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        treeSpots.push([blk.cx + Math.cos(a) * 15, blk.cz + Math.sin(a) * 15]);
      }
    }
  }
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 2.6, 6);
  trunkGeo.translate(0, 1.3, 0);
  const crownGeo = new THREE.IcosahedronGeometry(1.9, 0);
  crownGeo.translate(0, 3.6, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#3e3126', roughness: 0.95 });
  const crownMat = new THREE.MeshStandardMaterial({ color: '#4d5a35', roughness: 0.9, flatShading: true });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeSpots.length);
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, treeSpots.length);
  crowns.castShadow = castShadows;
  treeSpots.forEach(([x, z], i) => {
    dummy.position.set(x, 0, z);
    dummy.rotation.set(0, i * 1.3, 0);
    dummy.scale.setScalar(0.85 + (i % 5) * 0.08);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    crowns.setMatrixAt(i, dummy.matrix);
    crowns.setColorAt(i, color.setHSL(0.22 + (i % 4) * 0.015, 0.28, 0.24 + (i % 3) * 0.03));
    physics.addCylinder({ id: `tree-${i}`, cx: x, cz: z, radius: 0.35, minY: 0, maxY: 2.6, material: 'WOOD' });
  });
  trunks.computeBoundingSphere();
  crowns.computeBoundingSphere();
  root.add(trunks, crowns);
  disposables.push(trunkGeo, crownGeo, trunkMat, crownMat);

  // Plaza fountain + sandbag barricades for the defend mission.
  const plaza = layout.blocks.find((b) => b.kind === 'PLAZA');
  if (plaza) {
    const stoneMat = new THREE.MeshStandardMaterial({ color: '#a59d8d', roughness: 0.85 });
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.3, 0.9, 24), stoneMat);
    basin.position.set(plaza.cx, 0.45, plaza.cz);
    const statue = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 4.5, 8), stoneMat);
    statue.position.set(plaza.cx, 2.7, plaza.cz);
    basin.castShadow = castShadows;
    statue.castShadow = castShadows;
    root.add(basin, statue);
    physics.addCylinder({ id: 'fountain', cx: plaza.cx, cz: plaza.cz, radius: 4.2, minY: 0, maxY: 0.9, material: 'CONCRETE', walkableTop: true });
    physics.addCylinder({ id: 'statue', cx: plaza.cx, cz: plaza.cz, radius: 0.9, minY: 0, maxY: 5, material: 'CONCRETE' });
    const sandMat = new THREE.MeshStandardMaterial({ color: '#8a7a5c', roughness: 1 });
    const sandGeo = new THREE.BoxGeometry(3.2, 1.1, 0.9);
    disposables.push(stoneMat, sandMat, sandGeo, basin.geometry, statue.geometry);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3;
      const x = plaza.cx + Math.cos(a) * 9.5;
      const z = plaza.cz + Math.sin(a) * 9.5;
      const bag = new THREE.Mesh(sandGeo, sandMat);
      bag.position.set(x, 0.55, z);
      bag.rotation.y = -a + Math.PI / 2;
      bag.castShadow = castShadows;
      root.add(bag);
      physics.addBox({ id: `sandbag-${k}`, cx: x, cz: z, widthX: 3.2, depthZ: 0.9, yaw: -a + Math.PI / 2, minY: 0, maxY: 1.1, material: 'CONCRETE', walkableTop: true });
    }
  }
}
