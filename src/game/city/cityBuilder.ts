import * as THREE from "three";
import { StaticWorldPhysics } from "../systems/staticCollisionSystem";
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
} from "./cityLayout";

/** Accumulates axis-aligned boxes into one vertex-colored BufferGeometry. */
class BoxBatch {
  positions: number[] = [];
  normals: number[] = [];
  colors: number[] = [];
  uvs: number[] = [];
  indices: number[] = [];

  add(
    minX: number,
    minY: number,
    minZ: number,
    maxX: number,
    maxY: number,
    maxZ: number,
    color: THREE.Color,
    uvMode: "world" | "facade" = "world",
  ) {
    const faces: Array<{ n: [number, number, number]; v: Array<[number, number, number]> }> = [
      {
        n: [1, 0, 0],
        v: [
          [maxX, minY, maxZ],
          [maxX, minY, minZ],
          [maxX, maxY, minZ],
          [maxX, maxY, maxZ],
        ],
      },
      {
        n: [-1, 0, 0],
        v: [
          [minX, minY, minZ],
          [minX, minY, maxZ],
          [minX, maxY, maxZ],
          [minX, maxY, minZ],
        ],
      },
      {
        n: [0, 1, 0],
        v: [
          [minX, maxY, maxZ],
          [maxX, maxY, maxZ],
          [maxX, maxY, minZ],
          [minX, maxY, minZ],
        ],
      },
      {
        n: [0, -1, 0],
        v: [
          [minX, minY, minZ],
          [maxX, minY, minZ],
          [maxX, minY, maxZ],
          [minX, minY, maxZ],
        ],
      },
      {
        n: [0, 0, 1],
        v: [
          [minX, minY, maxZ],
          [maxX, minY, maxZ],
          [maxX, maxY, maxZ],
          [minX, maxY, maxZ],
        ],
      },
      {
        n: [0, 0, -1],
        v: [
          [maxX, minY, minZ],
          [minX, minY, minZ],
          [minX, maxY, minZ],
          [maxX, maxY, minZ],
        ],
      },
    ];
    for (const f of faces) {
      const base = this.positions.length / 3;
      for (const [x, y, z] of f.v) {
        this.positions.push(x, y, z);
        this.normals.push(f.n[0], f.n[1], f.n[2]);
        this.colors.push(color.r, color.g, color.b);
        if (uvMode === "facade") {
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
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.normals, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.colors, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uvs, 2));
    g.setIndex(this.indices);
    g.computeBoundingSphere();
    return g;
  }
}

const FACADE_PALETTE = [
  "#b7a58b",
  "#9d8b77",
  "#a6a8a1",
  "#8f604b",
  "#c4b79c",
  "#7f8b81",
  "#a9947a",
  "#94847a",
];
const ROLE_COLORS: Partial<Record<Building["role"], string>> = {
  SAFEHOUSE: "#a98f6f",
  PRECINCT: "#6f7b8b",
  POST_OFFICE: "#b69a6a",
  BROADCAST: "#7d7f86",
  HOSPITAL: "#d3d0c5",
  RECORDS: "#a38d73",
  HOTEL: "#b46f55",
  SUBSTATION: "#6c6f6a",
  GARAGE: "#8a8a86",
  COURTHOUSE: "#c9c1ad",
  BANK: "#d0c8b4",
  TOWER: "#56606b",
};

function makeWindowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = "#22272e";
  ctx.fillRect(20, 16, 24, 28);
  ctx.fillStyle = "rgba(255,214,150,0.6)";
  ctx.fillRect(23, 19, 9, 12);
  ctx.fillStyle = "#b8b2a7";
  ctx.fillRect(0, 58, 64, 6);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeGroundTexture(layout: CityLayout): THREE.CanvasTexture {
  const size = 2048;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  const ext = CITY_HALF_EXTENT + 10;
  const s = size / (ext * 2);
  const tx = (x: number) => (x + ext) * s;

  // Rich textured asphalt base
  ctx.fillStyle = "#343639";
  ctx.fillRect(0, 0, size, size);

  // Micro-granite asphalt noise & weathering
  for (let i = 0; i < 18000; i++) {
    const v = 42 + Math.floor(Math.random() * 26);
    ctx.fillStyle = `rgb(${v},${v + 1},${v + 3})`;
    const sz = Math.random() < 0.2 ? 3 : 2;
    ctx.fillRect(Math.random() * size, Math.random() * size, sz, sz);
  }

  for (const blk of layout.blocks) {
    const half = BLOCK_SIZE / 2;
    const x0 = tx(blk.cx - half);
    const z0 = tx(blk.cz - half);
    const w = BLOCK_SIZE * s;

    // Dark contact shadow edge under sidewalks
    ctx.fillStyle = "#232528";
    ctx.fillRect(x0 - 0.4 * s, z0 - 0.4 * s, w + 0.8 * s, w + 0.8 * s);

    // Curb edge stone
    ctx.fillStyle = "#8f8c85";
    ctx.fillRect(x0, z0, w, w);

    // Sidewalk paving
    ctx.fillStyle = blk.kind === "PARK" ? "#475637" : blk.kind === "PLAZA" ? "#a59e90" : "#7d7970";
    ctx.fillRect(x0 + 2.2 * s, z0 + 2.2 * s, w - 4.4 * s, w - 4.4 * s);

    if (blk.kind === "PLAZA") {
      ctx.strokeStyle = "rgba(70,60,50,0.32)";
      ctx.lineWidth = 1.2;
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
    if (blk.kind === "PARK") {
      ctx.fillStyle = "#9c8d6f";
      ctx.fillRect(x0 + w / 2 - 1.8 * s, z0, 3.6 * s, w);
      ctx.fillRect(x0, z0 + w / 2 - 1.8 * s, w, 3.6 * s);
    }
  }

  // Crosswalks (pedestrian zebra stripes) at all street intersections
  ctx.fillStyle = "rgba(235, 230, 215, 0.78)";
  for (let k = 0; k <= BLOCKS_PER_SIDE; k++) {
    const street = blockCenter(k) - 26;
    for (let m = 0; m <= BLOCKS_PER_SIDE; m++) {
      const cross = blockCenter(m) - 26;
      // North-South zebra
      for (let bar = -5; bar <= 5; bar += 1.2) {
        ctx.fillRect(tx(street + bar), tx(cross - 5.5), 0.7 * s, 3.2 * s);
        ctx.fillRect(tx(street + bar), tx(cross + 2.3), 0.7 * s, 3.2 * s);
      }
      // East-West zebra
      for (let bar = -5; bar <= 5; bar += 1.2) {
        ctx.fillRect(tx(street - 5.5), tx(cross + bar), 3.2 * s, 0.7 * s);
        ctx.fillRect(tx(street + 2.3), tx(cross + bar), 3.2 * s, 0.7 * s);
      }
    }
  }

  // Stop lines at street corners
  ctx.fillStyle = "rgba(240, 235, 220, 0.85)";
  for (let k = 0; k <= BLOCKS_PER_SIDE; k++) {
    const street = blockCenter(k) - 26;
    for (let m = 0; m <= BLOCKS_PER_SIDE; m++) {
      const cross = blockCenter(m) - 26;
      ctx.fillRect(tx(street - 4.5), tx(cross - 6.2), 9 * s, 0.5 * s);
      ctx.fillRect(tx(street - 4.5), tx(cross + 5.7), 9 * s, 0.5 * s);
    }
  }

  // Dashed white centerlines
  ctx.strokeStyle = "rgba(235,225,190,0.72)";
  ctx.lineWidth = 0.38 * s;
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

  // Double solid yellow centerlines along Grand Avenue
  ctx.strokeStyle = "rgba(224,178,54,0.92)";
  ctx.lineWidth = 0.32 * s;
  ctx.beginPath();
  ctx.moveTo(tx(-ext), tx(AVENUE_Z - 0.32));
  ctx.lineTo(tx(ext), tx(AVENUE_Z - 0.32));
  ctx.moveTo(tx(-ext), tx(AVENUE_Z + 0.32));
  ctx.lineTo(tx(ext), tx(AVENUE_Z + 0.32));
  ctx.stroke();

  // Building footprints darken the ground under them
  for (const b of layout.buildings) {
    ctx.fillStyle = "#544c43";
    ctx.fillRect(
      tx(b.footprint.minX),
      tx(b.footprint.minZ),
      (b.footprint.maxX - b.footprint.minX) * s,
      (b.footprint.maxZ - b.footprint.minZ) * s,
    );
  }

  // Manhole covers & street drains
  for (let k = 0; k < BLOCKS_PER_SIDE; k++) {
    for (let m = 0; m < BLOCKS_PER_SIDE; m++) {
      const mx = tx(blockCenter(k) - 22);
      const mz = tx(blockCenter(m) - 22);
      ctx.fillStyle = "#222326";
      ctx.beginPath();
      ctx.arc(mx, mz, 1.4 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#43464d";
      ctx.lineWidth = 0.3 * s;
      ctx.stroke();
    }
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
  AMMO: "#5d6b3c",
  MEDKIT: "#e5e1d8",
  SALVAGE: "#6b7078",
  ARMOR: "#3f6ea8",
  DOSSIER: "#d49a2a",
};

export function buildCityScene(
  layout: CityLayout,
  physics: StaticWorldPhysics,
  opts: {
    castShadows: boolean;
    concreteBump: THREE.Texture;
    lootedIds: ReadonlySet<string>;
    destroyedIds: ReadonlySet<string>;
  },
): CityScene {
  const root = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];

  // Ground
  const groundTex = makeGroundTexture(layout);
  const groundGeo = new THREE.PlaneGeometry(
    (CITY_HALF_EXTENT + 10) * 2,
    (CITY_HALF_EXTENT + 10) * 2,
  );
  groundGeo.rotateX(-Math.PI / 2);
  const groundMat = new THREE.MeshStandardMaterial({
    map: groundTex,
    roughness: 0.94,
    metalness: 0.04,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.receiveShadow = true;
  root.add(ground);
  disposables.push(groundTex, groundGeo, groundMat);

  const bump = opts.concreteBump.clone();
  bump.repeat.set(1, 1);
  bump.needsUpdate = true;
  const detailMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.88,
    metalness: 0.04,
    bumpMap: bump,
    bumpScale: 0.5,
  });
  const windowTex = makeWindowTexture();
  const shellMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.88,
    metalness: 0.04,
    map: windowTex,
  });
  disposables.push(bump, detailMat, windowTex, shellMat);

  const interiorCol = new THREE.Color("#cfc5b2");
  const coreCol = new THREE.Color("#9b958b");
  const floorCol = new THREE.Color("#7a6a58");
  const roofCol = new THREE.Color("#4b4946");
  const stepCol = new THREE.Color("#857f77");
  const tmp = new THREE.Color();

  const buildingObjects = new Map<string, THREE.Object3D>();

  for (const b of layout.buildings) {
    const fp = b.footprint;
    const facade = new THREE.Color(
      ROLE_COLORS[b.role] ??
        FACADE_PALETTE[Math.floor(b.facadeTone * FACADE_PALETTE.length) % FACADE_PALETTE.length],
    );
    const detail = new BoxBatch();
    const group = b.id;

    for (const wbox of b.walls) {
      const col = wbox.kind === "EXTERIOR" ? facade : wbox.kind === "CORE" ? coreCol : interiorCol;
      detail.add(
        wbox.cx - wbox.sx / 2,
        wbox.y0,
        wbox.cz - wbox.sz / 2,
        wbox.cx + wbox.sx / 2,
        wbox.y1,
        wbox.cz + wbox.sz / 2,
        col,
      );
      physics.addBox({
        id: `${b.id}-w`,
        cx: wbox.cx,
        cz: wbox.cz,
        widthX: wbox.sx,
        depthZ: wbox.sz,
        minY: wbox.y0,
        maxY: wbox.y1,
        material: "CONCRETE",
        walkableTop: false,
        group,
      });
    }

    // Ground floor tiles (visual only, inset by 0.05m to prevent exterior clipping)
    detail.add(
      fp.minX + WALL_THICKNESS + 0.05,
      0,
      fp.minZ + WALL_THICKNESS + 0.05,
      fp.maxX - WALL_THICKNESS - 0.05,
      0.03,
      fp.maxZ - WALL_THICKNESS - 0.05,
      floorCol,
    );

    // Slabs with stair holes (inset from exterior walls by 0.05m to eliminate coplanar Z-fighting!)
    const INSET = 0.05;
    const innerMinX = fp.minX + INSET;
    const innerMaxX = fp.maxX - INSET;
    const innerMinZ = fp.minZ + INSET;
    const innerMaxZ = fp.maxZ - INSET;

    for (let f = 1; f <= b.floors; f++) {
      const top = floorY(f);
      const bot = top - SLAB_THICKNESS;
      const isRoof = f === b.floors;
      const col = isRoof ? roofCol : floorCol;
      const pieces: Array<[number, number, number, number]> = [];

      if (!isRoof) {
        pieces.push([innerMinX, innerMinZ, innerMaxX, b.core.minZ]);
        pieces.push([innerMinX, b.core.maxZ, innerMaxX, innerMaxZ]);
        pieces.push([b.core.maxX, b.core.minZ, innerMaxX, b.core.maxZ]);
      } else {
        pieces.push([innerMinX, innerMinZ, innerMaxX, innerMaxZ]);
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
          material: "CONCRETE",
          walkableTop: true,
          stepUp: 0.65,
          group,
        });
      }

      // Architectural belt-course ledge / cornice trim ringing each floor on the building exterior
      // (Projects 0.08m out from wall, eliminates coplanar flickering and provides rich AAA architectural relief!)
      const ledgeCol = facade.clone().multiplyScalar(0.78);
      detail.add(
        fp.minX - 0.08,
        top - 0.16,
        fp.minZ - 0.08,
        fp.maxX + 0.08,
        top + 0.02,
        fp.maxZ + 0.08,
        ledgeCol,
      );

      if (isRoof) {
        // Parapet with architectural cap stone
        tmp.copy(facade).multiplyScalar(0.85);
        detail.add(fp.minX, top, fp.minZ, fp.maxX, top + 0.95, fp.minZ + 0.32, tmp);
        detail.add(fp.minX, top, fp.maxZ - 0.32, fp.maxX, top + 0.95, fp.maxZ, tmp);
        detail.add(fp.minX, top, fp.minZ, fp.minX + 0.32, top + 0.95, fp.maxZ, tmp);
        detail.add(fp.maxX - 0.32, top, fp.minZ, fp.maxX, top + 0.95, fp.maxZ, tmp);

        // Coping stone on top of parapet
        const capCol = facade.clone().multiplyScalar(1.05);
        detail.add(
          fp.minX - 0.06,
          top + 0.95,
          fp.minZ - 0.06,
          fp.maxX + 0.06,
          top + 1.05,
          fp.minZ + 0.38,
          capCol,
        );
        detail.add(
          fp.minX - 0.06,
          top + 0.95,
          fp.maxZ - 0.38,
          fp.maxX + 0.06,
          top + 1.05,
          fp.maxZ + 0.06,
          capCol,
        );
        detail.add(
          fp.minX - 0.06,
          top + 0.95,
          fp.minZ - 0.06,
          fp.minX + 0.38,
          top + 1.05,
          fp.maxZ + 0.06,
          capCol,
        );
        detail.add(
          fp.maxX - 0.38,
          top + 0.95,
          fp.minZ - 0.06,
          fp.maxX + 0.06,
          top + 1.05,
          fp.maxZ + 0.06,
          capCol,
        );
      }
    }

    // Stair treads (collision is analytic in cityLayout.sampleCitySupport).
    const steps = 12;
    const runZ = (b.core.maxZ - b.core.minZ) / steps;
    for (let r = 0; r < b.floors - 1; r++) {
      for (let k = 0; k < steps; k++) {
        const z0 = b.core.minZ + k * runZ;
        const yTop = floorY(r) + ((k + 0.5) / steps) * FLOOR_HEIGHT;
        detail.add(
          b.core.minX + 0.02,
          yTop - 0.2,
          z0,
          b.core.maxX - 0.02,
          yTop,
          z0 + runZ,
          stepCol,
        );
      }
    }

    const detailMesh = new THREE.Mesh(detail.build(), detailMat);
    detailMesh.castShadow = opts.castShadows;
    detailMesh.receiveShadow = true;
    disposables.push(detailMesh.geometry);

    const shell = new BoxBatch();
    const height = floorY(b.floors);
    shell.add(fp.minX, 0, fp.minZ, fp.maxX, height, fp.maxZ, facade, "facade");
    tmp.copy(facade).multiplyScalar(0.85);
    shell.add(fp.minX, height, fp.minZ, fp.maxX, height + 0.95, fp.maxZ, tmp, "facade");
    const shellMesh = new THREE.Mesh(shell.build(), shellMat);
    shellMesh.castShadow = opts.castShadows;
    disposables.push(shellMesh.geometry);

    const bcx = (fp.minX + fp.maxX) / 2;
    const bcz = (fp.minZ + fp.maxZ) / 2;
    detailMesh.geometry.translate(-bcx, 0, -bcz);
    shellMesh.geometry.translate(-bcx, 0, -bcz);
    detailMesh.geometry.computeBoundingSphere();
    shellMesh.geometry.computeBoundingSphere();
    const lod = new THREE.LOD();
    lod.addLevel(detailMesh, 0);
    lod.addLevel(shellMesh, 85);
    lod.position.set(bcx, 0, bcz);
    root.add(lod);
    buildingObjects.set(b.id, lod);
  }

  // Loot crates (instanced; looted ones scaled to zero).
  // ALL crates have registered solid collision boxes so players cannot phase inside them!
  const allLoot = layout.buildings.flatMap((b) => b.loot);
  const lootGeo = new THREE.BoxGeometry(0.95, 0.62, 0.62);
  lootGeo.translate(0, 0.31, 0);
  const lootMat = new THREE.MeshStandardMaterial({
    roughness: 0.6,
    metalness: 0.25,
    emissive: "#2a1d08",
    emissiveIntensity: 0.35,
  });
  const lootMesh = new THREE.InstancedMesh(lootGeo, lootMat, allLoot.length);
  lootMesh.castShadow = opts.castShadows;
  const dummy = new THREE.Object3D();
  const lootIndexById = new Map<string, number>();

  allLoot.forEach((l, idx) => {
    lootIndexById.set(l.id, idx);
    const crateY = floorY(l.floor) + 0.02;
    dummy.position.set(l.x, crateY, l.z);
    dummy.rotation.set(0, (idx % 4) * (Math.PI / 2) + 0.15, 0);
    dummy.scale.setScalar(opts.lootedIds.has(l.id) ? 0 : 1);
    dummy.updateMatrix();
    lootMesh.setMatrixAt(idx, dummy.matrix);
    lootMesh.setColorAt(idx, tmp.set(LOOT_COLORS[l.kind]));

    // Register solid collider for each loot crate
    physics.addBox({
      id: `loot-${l.id}`,
      cx: l.x,
      cz: l.z,
      widthX: 0.95,
      depthZ: 0.62,
      minY: floorY(l.floor),
      maxY: floorY(l.floor) + 0.65,
      material: "STEEL",
      walkableTop: true,
      stepUp: 0.2,
    });
    if (opts.lootedIds.has(l.id)) {
      physics.setColliderActive(`loot-${l.id}`, false);
    }
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
    physics.setColliderActive(`loot-${id}`, false);
  };

  // Street props: parked cars with 3D wheels, lamps, park trees, plaza fountain.
  buildStreetProps(root, physics, layout, opts.castShadows, disposables);

  // Rubble for destroyed buildings: full footprint coverage + standing wall stubs
  const rubbleMat = new THREE.MeshStandardMaterial({
    color: "#5e5850",
    roughness: 0.95,
    bumpMap: bump,
    bumpScale: 0.8,
  });
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
    const col = new THREE.Color("#6a635a");
    for (let k = 0; k < 32; k++) {
      const cx = fp.minX + rnd() * w;
      const cz = fp.minZ + rnd() * d;
      const sx = 2.2 + rnd() * 4.2;
      const sz = 2.2 + rnd() * 4.2;
      const sy = 0.8 + rnd() * 2.4;
      rubble.add(
        cx - sx / 2,
        0,
        cz - sz / 2,
        cx + sx / 2,
        sy,
        cz + sz / 2,
        col.clone().multiplyScalar(0.8 + rnd() * 0.4),
      );
    }
    // Standing wall stubs
    rubble.add(fp.minX, 0, fp.minZ, fp.minX + 0.45, 4.5 + rnd() * 3, fp.minZ + d * 0.45, col);
    rubble.add(fp.maxX - w * 0.4, 0, fp.maxZ - 0.45, fp.maxX, 3.8 + rnd() * 3, fp.maxZ, col);

    const mesh = new THREE.Mesh(rubble.build(), rubbleMat);
    mesh.castShadow = opts.castShadows;
    mesh.receiveShadow = true;
    root.add(mesh);
    disposables.push(mesh.geometry);

    // Completely solid rubble mound across the entire building perimeter so players cannot phase through rubble!
    physics.addBox({
      id: `${b.id}-rubble-main`,
      cx: (fp.minX + fp.maxX) / 2,
      cz: (fp.minZ + fp.maxZ) / 2,
      widthX: w,
      depthZ: d,
      minY: 0,
      maxY: 1.85,
      material: "CONCRETE",
      walkableTop: true,
      stepUp: 0.35,
    });
    // Standing corner stub colliders
    physics.addBox({
      id: `${b.id}-rubble-wall1`,
      cx: fp.minX + 0.22,
      cz: fp.minZ + d * 0.22,
      widthX: 0.45,
      depthZ: d * 0.45,
      minY: 0,
      maxY: 4.8,
      material: "CONCRETE",
      walkableTop: false,
    });
    physics.addBox({
      id: `${b.id}-rubble-wall2`,
      cx: fp.maxX - w * 0.2,
      cz: fp.maxZ - 0.22,
      widthX: w * 0.4,
      depthZ: 0.45,
      minY: 0,
      maxY: 4.2,
      material: "CONCRETE",
      walkableTop: false,
    });
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
  disposables: Array<{ dispose: () => void }>,
) {
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  // Parked cars along curbs (with 3D wheels and accurate yaw collision boxes)
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
        carSpots.push({ x: street + side * 4.6, z: along + (rnd() - 0.5) * 24, yaw: 0 });
      }
      if (rnd() < 0.55 && Math.abs(street - AVENUE_Z) > 1) {
        const side = rnd() < 0.5 ? -1 : 1;
        carSpots.push({ x: along + (rnd() - 0.5) * 24, z: street + side * 4.6, yaw: Math.PI / 2 });
      }
    }
  }

  const carBody = new THREE.BoxGeometry(1.95, 0.9, 4.35);
  carBody.translate(0, 0.65, 0);
  const carCabin = new THREE.BoxGeometry(1.72, 0.72, 2.25);
  carCabin.translate(0, 1.44, -0.2);
  const carMat = new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0.58 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: "#161c22",
    roughness: 0.18,
    metalness: 0.85,
  });

  const bodies = new THREE.InstancedMesh(carBody, carMat, carSpots.length);
  const cabins = new THREE.InstancedMesh(carCabin, glassMat, carSpots.length);
  bodies.castShadow = castShadows;

  // 3D Wheels for parked cars
  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({
    color: "#1a1b1e",
    roughness: 0.82,
    metalness: 0.18,
  });
  const wheels = new THREE.InstancedMesh(wheelGeo, wheelMat, carSpots.length * 4);
  wheels.castShadow = castShadows;

  const carPalette = ["#6b2a26", "#2f4a5e", "#4a4f45", "#8c8577", "#25262a", "#5a5f66", "#7a6340"];
  const wheelOffsets = [
    [-0.95, 0.34, 1.25],
    [0.95, 0.34, 1.25],
    [-0.95, 0.34, -1.25],
    [0.95, 0.34, -1.25],
  ];

  const wheelDummy = new THREE.Object3D();
  carSpots.forEach((c, i) => {
    const actualYaw = c.yaw + (rnd() - 0.5) * 0.14;
    dummy.position.set(c.x, 0, c.z);
    dummy.rotation.set(0, actualYaw, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();

    bodies.setMatrixAt(i, dummy.matrix);
    cabins.setMatrixAt(i, dummy.matrix);
    bodies.setColorAt(i, color.set(carPalette[i % carPalette.length]));

    // Place 4 wheels per car
    wheelOffsets.forEach(([ox, oy, oz], wIdx) => {
      wheelDummy.position.set(ox, oy, oz);
      wheelDummy.rotation.set(0, 0, 0);
      wheelDummy.updateMatrix();
      const wheelWorldMatrix = new THREE.Matrix4().multiplyMatrices(
        dummy.matrix,
        wheelDummy.matrix,
      );
      wheels.setMatrixAt(i * 4 + wIdx, wheelWorldMatrix);
    });

    // Solid rotated collider matching visual car bounds exactly
    physics.addBox({
      id: `car-${i}`,
      cx: c.x,
      cz: c.z,
      widthX: 1.95,
      depthZ: 4.35,
      yaw: actualYaw,
      cornerRadius: 0.15,
      minY: 0,
      maxY: 1.8,
      material: "STEEL",
      walkableTop: true,
      stepUp: 0.3,
    });
  });

  bodies.instanceMatrix.needsUpdate = true;
  cabins.instanceMatrix.needsUpdate = true;
  wheels.instanceMatrix.needsUpdate = true;
  if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
  bodies.computeBoundingSphere();
  cabins.computeBoundingSphere();
  wheels.computeBoundingSphere();
  root.add(bodies, cabins, wheels);
  disposables.push(carBody, carCabin, wheelGeo, carMat, glassMat, wheelMat);

  // Street lamps with soft luminous lamp hoods
  const lampGeo = new THREE.CylinderGeometry(0.08, 0.12, 6, 8);
  lampGeo.translate(0, 3, 0);
  const lampHeadGeo = new THREE.BoxGeometry(0.55, 0.22, 0.95);
  lampHeadGeo.translate(0, 6, 0.35);
  const lampMat = new THREE.MeshStandardMaterial({
    color: "#2b2f33",
    roughness: 0.6,
    metalness: 0.6,
  });
  const lampHeadMat = new THREE.MeshStandardMaterial({
    color: "#ffe5ab",
    emissive: "#ffcf75",
    emissiveIntensity: 1.8,
    roughness: 0.3,
  });

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
    physics.addCylinder({
      id: `lamp-${i}`,
      cx: x,
      cz: z,
      radius: 0.18,
      minY: 0,
      maxY: 6.2,
      material: "STEEL",
    });
  });
  lamps.computeBoundingSphere();
  heads.computeBoundingSphere();
  root.add(lamps, heads);
  disposables.push(lampGeo, lampHeadGeo, lampMat, lampHeadMat);

  // Mature urban trees: trunk height raised to 3.6m and canopy to y = 4.8m
  // Leaves are well above player head (1.75m) and third-person camera, preventing clipping!
  const treeSpots: Array<[number, number]> = [];
  for (const blk of layout.blocks) {
    if (blk.kind === "PARK") {
      for (let k = 0; k < 18; k++) {
        const x = blk.cx + (rnd() - 0.5) * 32;
        const z = blk.cz + (rnd() - 0.5) * 32;
        if (Math.abs(x - blk.cx) < 2.5 || Math.abs(z - blk.cz) < 2.5) continue;
        treeSpots.push([x, z]);
      }
    } else if (blk.kind === "PLAZA") {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        treeSpots.push([blk.cx + Math.cos(a) * 15, blk.cz + Math.sin(a) * 15]);
      }
    }
  }

  const trunkGeo = new THREE.CylinderGeometry(0.24, 0.36, 3.6, 8);
  trunkGeo.translate(0, 1.8, 0);
  const crownGeo = new THREE.IcosahedronGeometry(2.1, 1);
  crownGeo.translate(0, 4.8, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: "#382c22", roughness: 0.94 });
  const crownMat = new THREE.MeshStandardMaterial({
    color: "#445230",
    roughness: 0.88,
    flatShading: true,
  });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeSpots.length);
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, treeSpots.length);
  crowns.castShadow = castShadows;

  treeSpots.forEach(([x, z], i) => {
    dummy.position.set(x, 0, z);
    dummy.rotation.set(0, i * 1.3, 0);
    dummy.scale.setScalar(0.92 + (i % 5) * 0.08);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    crowns.setMatrixAt(i, dummy.matrix);
    crowns.setColorAt(i, color.setHSL(0.23 + (i % 4) * 0.015, 0.28, 0.22 + (i % 3) * 0.03));
    // Solid cylinder collider extending up through the trunk base
    physics.addCylinder({
      id: `tree-${i}`,
      cx: x,
      cz: z,
      radius: 0.42,
      minY: 0,
      maxY: 3.6,
      material: "WOOD",
    });
  });

  trunks.computeBoundingSphere();
  crowns.computeBoundingSphere();
  root.add(trunks, crowns);
  disposables.push(trunkGeo, crownGeo, trunkMat, crownMat);

  // Plaza fountain & sandbags
  const plaza = layout.blocks.find((b) => b.kind === "PLAZA");
  if (plaza) {
    const stoneMat = new THREE.MeshStandardMaterial({ color: "#a59d8d", roughness: 0.85 });
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(4.1, 4.35, 0.9, 24), stoneMat);
    basin.position.set(plaza.cx, 0.45, plaza.cz);
    const statue = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.95, 4.6, 8), stoneMat);
    statue.position.set(plaza.cx, 2.75, plaza.cz);
    basin.castShadow = castShadows;
    statue.castShadow = castShadows;
    root.add(basin, statue);

    // Completely solid fountain basin collider matching 4.35m radius
    physics.addCylinder({
      id: "fountain",
      cx: plaza.cx,
      cz: plaza.cz,
      radius: 4.4,
      minY: 0,
      maxY: 0.95,
      material: "CONCRETE",
      walkableTop: true,
    });
    physics.addCylinder({
      id: "statue",
      cx: plaza.cx,
      cz: plaza.cz,
      radius: 0.95,
      minY: 0,
      maxY: 5.2,
      material: "CONCRETE",
    });

    const sandMat = new THREE.MeshStandardMaterial({ color: "#8a7a5c", roughness: 1 });
    const sandGeo = new THREE.BoxGeometry(3.2, 1.1, 0.95);
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
      physics.addBox({
        id: `sandbag-${k}`,
        cx: x,
        cz: z,
        widthX: 3.2,
        depthZ: 0.95,
        yaw: -a + Math.PI / 2,
        minY: 0,
        maxY: 1.15,
        material: "CONCRETE",
        walkableTop: true,
        stepUp: 0.25,
      });
    }
  }
}
