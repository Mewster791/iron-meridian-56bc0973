import * as THREE from 'three';

export type ColliderMaterial = 'CONCRETE' | 'STEEL' | 'ROCK' | 'WOOD';

export interface StaticCollider {
  id: string;
  cx: number;
  cz: number;
  halfX: number;
  halfZ: number;
  cornerRadius: number;
  cosYaw: number;
  sinYaw: number;
  minY: number;
  maxY: number;
  boundingRadius: number;
  material: ColliderMaterial;
  walkableTop: boolean;
  active: boolean;
}

export interface RaycastStaticHit {
  distance: number;
  pointX: number;
  pointY: number;
  pointZ: number;
  normalX: number;
  normalY: number;
  normalZ: number;
  material: ColliderMaterial;
  colliderId: string;
}

const CELL_SIZE = 16;
const HALF_WORLD = 176;
const GRID_DIM = Math.ceil((HALF_WORLD * 2) / CELL_SIZE); // 22x22 spatial hash grid

/**
 * Zero-GC Spatial-Hash 3D Static Collision & Ballistic Occlusion Engine.
 * Enforces non-phaseable solid physics for Players, NPCs, Vehicles, Camera Rays,
 * Ballistic Projectiles, and Melee Swings across all Trees, Rocks, Bridges, and Structures.
 */
export class StaticWorldPhysics {
  private colliders: StaticCollider[] = [];
  private grid: number[][] = Array.from({ length: GRID_DIM * GRID_DIM }, () => []);
  private visitStamps: Int32Array = new Int32Array(2048);
  private currentStamp: number = 1;

  private reusableHit: RaycastStaticHit = {
    distance: 0,
    pointX: 0,
    pointY: 0,
    pointZ: 0,
    normalX: 0,
    normalY: 1,
    normalZ: 0,
    material: 'CONCRETE',
    colliderId: '',
  };

  public clear(): void {
    this.colliders.length = 0;
    for (let i = 0; i < this.grid.length; i++) {
      this.grid[i].length = 0;
    }
  }

  private toCell(coord: number): number {
    const idx = Math.floor((coord + HALF_WORLD) / CELL_SIZE);
    return idx < 0 ? 0 : idx >= GRID_DIM ? GRID_DIM - 1 : idx;
  }

  private ensureStampCapacity(count: number): void {
    if (count > this.visitStamps.length) {
      this.visitStamps = new Int32Array(count * 2);
    }
  }

  private nextStamp(): number {
    this.currentStamp = (this.currentStamp + 1) | 0;
    if (this.currentStamp <= 0) {
      this.visitStamps.fill(0);
      this.currentStamp = 1;
    }
    return this.currentStamp;
  }

  public addBox(params: {
    id: string;
    cx: number;
    cz: number;
    widthX: number;
    depthZ: number;
    minY: number;
    maxY: number;
    yaw?: number;
    cornerRadius?: number;
    material?: ColliderMaterial;
    walkableTop?: boolean;
  }): StaticCollider {
    const cr = params.cornerRadius ?? 0;
    const hx = Math.max(0, params.widthX * 0.5 - cr);
    const hz = Math.max(0, params.depthZ * 0.5 - cr);
    const yaw = params.yaw ?? 0;
    const boundingRadius = Math.hypot(hx, hz) + cr;

    const col: StaticCollider = {
      id: params.id,
      cx: params.cx,
      cz: params.cz,
      halfX: hx,
      halfZ: hz,
      cornerRadius: cr,
      cosYaw: Math.cos(yaw),
      sinYaw: Math.sin(yaw),
      minY: params.minY,
      maxY: params.maxY,
      boundingRadius,
      material: params.material ?? 'CONCRETE',
      walkableTop: params.walkableTop ?? true,
      active: true,
    };

    return this.insertCollider(col);
  }

  public addCylinder(params: {
    id: string;
    cx: number;
    cz: number;
    radius: number;
    minY: number;
    maxY: number;
    material?: ColliderMaterial;
    walkableTop?: boolean;
  }): StaticCollider {
    const col: StaticCollider = {
      id: params.id,
      cx: params.cx,
      cz: params.cz,
      halfX: 0,
      halfZ: 0,
      cornerRadius: params.radius,
      cosYaw: 1,
      sinYaw: 0,
      minY: params.minY,
      maxY: params.maxY,
      boundingRadius: params.radius,
      material: params.material ?? 'WOOD',
      walkableTop: params.walkableTop ?? false,
      active: true,
    };

    return this.insertCollider(col);
  }

  private insertCollider(col: StaticCollider): StaticCollider {
    const index = this.colliders.length;
    this.colliders.push(col);
    this.ensureStampCapacity(this.colliders.length);

    const minCellX = this.toCell(col.cx - col.boundingRadius);
    const maxCellX = this.toCell(col.cx + col.boundingRadius);
    const minCellZ = this.toCell(col.cz - col.boundingRadius);
    const maxCellZ = this.toCell(col.cz + col.boundingRadius);

    for (let cz = minCellZ; cz <= maxCellZ; cz++) {
      const rowOffset = cz * GRID_DIM;
      for (let cx = minCellX; cx <= maxCellX; cx++) {
        this.grid[rowOffset + cx].push(index);
      }
    }

    return col;
  }

  public setColliderActive(id: string, active: boolean): void {
    for (let i = 0; i < this.colliders.length; i++) {
      if (this.colliders[i].id === id) {
        this.colliders[i].active = active;
      }
    }
  }

  /**
   * Resolves horizontal solid non-penetration with smooth tangential wall-sliding.
   * Mutates `outPos.x` and `outPos.z` in-place (3 solver iterations prevent corner squeezing).
   */
  public resolveHorizontalBody(
    outPos: { x: number; z: number },
    actorBottomY: number,
    actorHeight: number,
    actorRadius: number
  ): boolean {
    let collided = false;
    const actorTopY = actorBottomY + actorHeight;

    for (let pass = 0; pass < 3; pass++) {
      const stamp = this.nextStamp();
      const minCellX = this.toCell(outPos.x - actorRadius - 1.0);
      const maxCellX = this.toCell(outPos.x + actorRadius + 1.0);
      const minCellZ = this.toCell(outPos.z - actorRadius - 1.0);
      const maxCellZ = this.toCell(outPos.z + actorRadius + 1.0);

      for (let cz = minCellZ; cz <= maxCellZ; cz++) {
        const rowOffset = cz * GRID_DIM;
        for (let cx = minCellX; cx <= maxCellX; cx++) {
          const bucket = this.grid[rowOffset + cx];
          for (let b = 0; b < bucket.length; b++) {
            const idx = bucket[b];
            if (this.visitStamps[idx] === stamp) continue;
            this.visitStamps[idx] = stamp;

            const col = this.colliders[idx];
            if (!col.active) continue;

            // Skip if actor is cleanly above top surface or completely below underside
            if (actorBottomY >= col.maxY - 0.12 || actorTopY <= col.minY + 0.05) {
              continue;
            }

            const dx = outPos.x - col.cx;
            const dz = outPos.z - col.cz;
            const maxR = col.boundingRadius + actorRadius;
            if (dx * dx + dz * dz >= maxR * maxR) continue;

            // Transform into collider local space (inverse +Y rotation)
            let lx = dx * col.cosYaw - dz * col.sinYaw;
            let lz = dx * col.sinYaw + dz * col.cosYaw;

            const qx = lx < -col.halfX ? -col.halfX : lx > col.halfX ? col.halfX : lx;
            const qz = lz < -col.halfZ ? -col.halfZ : lz > col.halfZ ? col.halfZ : lz;

            const ex = lx - qx;
            const ez = lz - qz;
            const distSq = ex * ex + ez * ez;
            const combinedR = col.cornerRadius + actorRadius;

            if (distSq >= combinedR * combinedR) continue;

            collided = true;
            if (distSq > 1e-8) {
              const dist = Math.sqrt(distSq);
              const push = (combinedR - dist) / dist;
              lx += ex * push;
              lz += ez * push;
            } else {
              // Deep penetration inside inner box: push out along minimum penetration axis
              const penX = col.halfX + combinedR - Math.abs(lx);
              const penZ = col.halfZ + combinedR - Math.abs(lz);
              if (penX < penZ) {
                lx = lx >= 0 ? col.halfX + combinedR : -(col.halfX + combinedR);
              } else {
                lz = lz >= 0 ? col.halfZ + combinedR : -(col.halfZ + combinedR);
              }
            }

            // Transform back to world space
            outPos.x = col.cx + lx * col.cosYaw + lz * col.sinYaw;
            outPos.z = col.cz - lx * col.sinYaw + lz * col.cosYaw;
          }
        }
      }
    }

    return collided;
  }

  /**
   * Computes vertical support (standing on rocks, HESCO walls, crates, pads) and overhead ceiling clamp.
   */
  public resolveVerticalBounds(
    x: number,
    z: number,
    prevBottomY: number,
    currentBottomY: number,
    actorHeight: number,
    footRadius: number,
    baseGroundY: number
  ): { groundY: number; clampedY: number; hitCeiling: boolean } {
    let supportY = baseGroundY;
    let clampedY = currentBottomY;
    let hitCeiling = false;

    const stamp = this.nextStamp();
    const minCellX = this.toCell(x - footRadius);
    const maxCellX = this.toCell(x + footRadius);
    const minCellZ = this.toCell(z - footRadius);
    const maxCellZ = this.toCell(z + footRadius);

    for (let cz = minCellZ; cz <= maxCellZ; cz++) {
      const rowOffset = cz * GRID_DIM;
      for (let cx = minCellX; cx <= maxCellX; cx++) {
        const bucket = this.grid[rowOffset + cx];
        for (let b = 0; b < bucket.length; b++) {
          const idx = bucket[b];
          if (this.visitStamps[idx] === stamp) continue;
          this.visitStamps[idx] = stamp;

          const col = this.colliders[idx];
          if (!col.active) continue;

          const dx = x - col.cx;
          const dz = z - col.cz;
          const maxR = col.boundingRadius + footRadius;
          if (dx * dx + dz * dz >= maxR * maxR) continue;

          const lx = dx * col.cosYaw - dz * col.sinYaw;
          const lz = dx * col.sinYaw + dz * col.cosYaw;
          const qx = lx < -col.halfX ? -col.halfX : lx > col.halfX ? col.halfX : lx;
          const qz = lz < -col.halfZ ? -col.halfZ : lz > col.halfZ ? col.halfZ : lz;
          const ex = lx - qx;
          const ez = lz - qz;
          const combinedR = col.cornerRadius + footRadius * 0.8;
          if (ex * ex + ez * ez >= combinedR * combinedR) continue;

          // Support from top face if actor was above top face (or low step <= 0.38m)
          if (col.walkableTop) {
            const isLowStep = col.maxY - baseGroundY <= 0.38;
            if ((prevBottomY >= col.maxY - 0.28 || isLowStep) && col.maxY > supportY) {
              supportY = col.maxY;
            }
          }

          // Overhead ceiling block (e.g. under river bridges)
          if (
            prevBottomY + actorHeight <= col.minY + 0.25 &&
            clampedY + actorHeight > col.minY
          ) {
            clampedY = col.minY - actorHeight;
            hitCeiling = true;
          }
        }
      }
    }

    if (clampedY < supportY) {
      clampedY = supportY;
    }

    return { groundY: supportY, clampedY, hitCeiling };
  }

  /**
   * Exact 3D Raycast against all static colliders (OBBs, Rounded Boulders, Cylinders).
   * Returns closest hit within [0, maxDist] or null. Zero heap allocations.
   */
  public raycast(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    maxDist: number
  ): RaycastStaticHit | null {
    if (maxDist <= 0) return null;

    const endX = origin.x + dir.x * maxDist;
    const endZ = origin.z + dir.z * maxDist;

    const minCellX = this.toCell(Math.min(origin.x, endX) - 1.0);
    const maxCellX = this.toCell(Math.max(origin.x, endX) + 1.0);
    const minCellZ = this.toCell(Math.min(origin.z, endZ) - 1.0);
    const maxCellZ = this.toCell(Math.max(origin.z, endZ) + 1.0);

    const stamp = this.nextStamp();
    let bestT = maxDist + 1;
    let bestCol: StaticCollider | null = null;
    let bestLocalNx = 0;
    let bestLocalNy = 1;
    let bestLocalNz = 0;

    for (let cz = minCellZ; cz <= maxCellZ; cz++) {
      const rowOffset = cz * GRID_DIM;
      for (let cx = minCellX; cx <= maxCellX; cx++) {
        const bucket = this.grid[rowOffset + cx];
        for (let b = 0; b < bucket.length; b++) {
          const idx = bucket[b];
          if (this.visitStamps[idx] === stamp) continue;
          this.visitStamps[idx] = stamp;

          const col = this.colliders[idx];
          if (!col.active) continue;

          // Quick 2D point-to-ray perpendicular distance broadphase in XZ
          const relX = col.cx - origin.x;
          const relZ = col.cz - origin.z;
          const horizLenSq = dir.x * dir.x + dir.z * dir.z;
          if (horizLenSq > 1e-6) {
            const proj = (relX * dir.x + relZ * dir.z) / horizLenSq;
            const clampedProj = proj < 0 ? 0 : proj > maxDist ? maxDist : proj;
            const perpX = relX - dir.x * clampedProj;
            const perpZ = relZ - dir.z * clampedProj;
            const rPad = col.boundingRadius + 0.25;
            if (perpX * perpX + perpZ * perpZ > rPad * rPad) continue;
          } else {
            if (relX * relX + relZ * relZ > (col.boundingRadius + 0.1) ** 2) continue;
          }

          // Transform ray to collider local coordinates
          const ox = -relX * col.cosYaw + relZ * col.sinYaw;
          const oz = -relX * col.sinYaw - relZ * col.cosYaw;
          const oy = origin.y;

          const dx = dir.x * col.cosYaw - dir.z * col.sinYaw;
          const dz = dir.x * col.sinYaw + dir.z * col.cosYaw;
          const dy = dir.y;

          if (col.halfX === 0 && col.halfZ === 0) {
            // Exact 3D Finite Cylinder Intersection
            const hit = this.intersectCylinder(
              ox,
              oy,
              oz,
              dx,
              dy,
              dz,
              col.cornerRadius,
              col.minY,
              col.maxY,
              Math.min(maxDist, bestT)
            );
            if (hit && hit.t < bestT) {
              bestT = hit.t;
              bestCol = col;
              bestLocalNx = hit.nx;
              bestLocalNy = hit.ny;
              bestLocalNz = hit.nz;
            }
          } else {
            // Exact 3D Rounded OBB Intersection
            const hit = this.intersectRoundedBox(
              ox,
              oy,
              oz,
              dx,
              dy,
              dz,
              col.halfX,
              col.halfZ,
              col.cornerRadius,
              col.minY,
              col.maxY,
              Math.min(maxDist, bestT)
            );
            if (hit && hit.t < bestT) {
              bestT = hit.t;
              bestCol = col;
              bestLocalNx = hit.nx;
              bestLocalNy = hit.ny;
              bestLocalNz = hit.nz;
            }
          }
        }
      }
    }

    if (!bestCol || bestT > maxDist) return null;

    // Rotate local normal back to world space
    const wnx = bestLocalNx * bestCol.cosYaw + bestLocalNz * bestCol.sinYaw;
    const wnz = -bestLocalNx * bestCol.sinYaw + bestLocalNz * bestCol.cosYaw;

    this.reusableHit.distance = bestT;
    this.reusableHit.pointX = origin.x + dir.x * bestT;
    this.reusableHit.pointY = origin.y + dir.y * bestT;
    this.reusableHit.pointZ = origin.z + dir.z * bestT;
    this.reusableHit.normalX = wnx;
    this.reusableHit.normalY = bestLocalNy;
    this.reusableHit.normalZ = wnz;
    this.reusableHit.material = bestCol.material;
    this.reusableHit.colliderId = bestCol.id;

    return this.reusableHit;
  }

  /**
   * Returns true if unobstructed line-of-sight exists between `from` and `to` (checking both static objects & terrain).
   */
  public hasLineOfSight(
    from: THREE.Vector3,
    to: THREE.Vector3,
    sampleTerrain?: (x: number, z: number) => number
  ): boolean {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist <= 0.05) return true;

    _losDir.set(dx / dist, dy / dist, dz / dist);
    const staticHit = this.raycast(from, _losDir, dist - 0.15);
    if (staticHit) return false;

    if (sampleTerrain && dist > 1.5) {
      const steps = Math.min(24, Math.ceil(dist / 2.5));
      for (let s = 1; s < steps; s++) {
        const frac = s / steps;
        const sx = from.x + dx * frac;
        const sy = from.y + dy * frac;
        const sz = from.z + dz * frac;
        if (sy < sampleTerrain(sx, sz) - 0.05) {
          return false;
        }
      }
    }

    return true;
  }

  private intersectCylinder(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    r: number,
    minY: number,
    maxY: number,
    limitT: number
  ): { t: number; nx: number; ny: number; nz: number } | null {
    // Check if ray origin is already inside cylinder
    if (oy >= minY && oy <= maxY && ox * ox + oz * oz <= r * r) {
      const len = Math.hypot(ox, oz) || 1;
      return { t: 0, nx: ox / len, ny: 0, nz: oz / len };
    }

    let bestT = limitT + 1;
    let nx = 0;
    let ny = 0;
    let nz = 0;

    // Lateral curved wall
    const a = dx * dx + dz * dz;
    if (a > 1e-8) {
      const b = 2 * (ox * dx + oz * dz);
      const c = ox * ox + oz * oz - r * r;
      const disc = b * b - 4 * a * c;
      if (disc >= 0) {
        const t = (-b - Math.sqrt(disc)) / (2 * a);
        if (t >= 0 && t <= limitT) {
          const hitY = oy + dy * t;
          if (hitY >= minY && hitY <= maxY) {
            bestT = t;
            nx = (ox + dx * t) / r;
            ny = 0;
            nz = (oz + dz * t) / r;
          }
        }
      }
    }

    // Top & Bottom caps
    if (Math.abs(dy) > 1e-8) {
      const tTop = (maxY - oy) / dy;
      if (tTop >= 0 && tTop < bestT && tTop <= limitT) {
        const hx = ox + dx * tTop;
        const hz = oz + dz * tTop;
        if (hx * hx + hz * hz <= r * r) {
          bestT = tTop;
          nx = 0;
          ny = 1;
          nz = 0;
        }
      }
      const tBot = (minY - oy) / dy;
      if (tBot >= 0 && tBot < bestT && tBot <= limitT) {
        const hx = ox + dx * tBot;
        const hz = oz + dz * tBot;
        if (hx * hx + hz * hz <= r * r) {
          bestT = tBot;
          nx = 0;
          ny = -1;
          nz = 0;
        }
      }
    }

    return bestT <= limitT ? { t: bestT, nx, ny, nz } : null;
  }

  private intersectRoundedBox(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    halfX: number,
    halfZ: number,
    cornerR: number,
    minY: number,
    maxY: number,
    limitT: number
  ): { t: number; nx: number; ny: number; nz: number } | null {
    const extX = halfX + cornerR;
    const extZ = halfZ + cornerR;

    // Check if origin is already inside rounded box
    if (oy >= minY && oy <= maxY && Math.abs(ox) <= extX && Math.abs(oz) <= extZ) {
      const qx = ox < -halfX ? -halfX : ox > halfX ? halfX : ox;
      const qz = oz < -halfZ ? -halfZ : oz > halfZ ? halfZ : oz;
      if ((ox - qx) * (ox - qx) + (oz - qz) * (oz - qz) <= cornerR * cornerR + 1e-5) {
        return { t: 0, nx: -dx, ny: -dy, nz: -dz };
      }
    }

    // Outer AABB slab test
    let tMin = 0;
    let tMax = limitT;
    let hitNx = 0;
    let hitNy = 0;
    let hitNz = 0;

    // X slab
    if (Math.abs(dx) < 1e-8) {
      if (ox < -extX || ox > extX) return null;
    } else {
      const inv = 1 / dx;
      let t1 = (-extX - ox) * inv;
      let t2 = (extX - ox) * inv;
      let s = -1;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
        s = 1;
      }
      if (t1 > tMin) {
        tMin = t1;
        hitNx = s;
        hitNy = 0;
        hitNz = 0;
      }
      if (t2 < tMax) tMax = t2;
      if (tMin > tMax) return null;
    }

    // Y slab
    if (Math.abs(dy) < 1e-8) {
      if (oy < minY || oy > maxY) return null;
    } else {
      const inv = 1 / dy;
      let t1 = (minY - oy) * inv;
      let t2 = (maxY - oy) * inv;
      let s = -1;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
        s = 1;
      }
      if (t1 > tMin) {
        tMin = t1;
        hitNx = 0;
        hitNy = s;
        hitNz = 0;
      }
      if (t2 < tMax) tMax = t2;
      if (tMin > tMax) return null;
    }

    // Z slab
    if (Math.abs(dz) < 1e-8) {
      if (oz < -extZ || oz > extZ) return null;
    } else {
      const inv = 1 / dz;
      let t1 = (-extZ - oz) * inv;
      let t2 = (extZ - oz) * inv;
      let s = -1;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
        s = 1;
      }
      if (t1 > tMin) {
        tMin = t1;
        hitNx = 0;
        hitNy = 0;
        hitNz = s;
      }
      if (t2 < tMax) tMax = t2;
      if (tMin > tMax) return null;
    }

    if (cornerR <= 0.02) {
      return { t: tMin, nx: hitNx, ny: hitNy, nz: hitNz };
    }

    // Rounded corner refinement (for boulders): march along [tMin, tMax] in 6 steps
    const span = tMax - tMin;
    const steps = 6;
    for (let s = 0; s <= steps; s++) {
      const t = tMin + (span * s) / steps;
      const px = ox + dx * t;
      const py = oy + dy * t;
      const pz = oz + dz * t;
      if (py < minY - 0.01 || py > maxY + 0.01) continue;

      const qx = px < -halfX ? -halfX : px > halfX ? halfX : px;
      const qz = pz < -halfZ ? -halfZ : pz > halfZ ? halfZ : pz;
      const ex = px - qx;
      const ez = pz - qz;
      const dSq = ex * ex + ez * ez;
      if (dSq <= cornerR * cornerR + 0.002) {
        if (Math.abs(py - maxY) < 0.04 && dy < 0) {
          return { t, nx: 0, ny: 1, nz: 0 };
        }
        const d = Math.sqrt(dSq) || 1;
        return { t, nx: ex / d, ny: 0, nz: ez / d };
      }
    }

    return null;
  }
}

const _losDir = new THREE.Vector3();

/**
 * Helper to resolve horizontal collision between an actor circle and a dynamic oriented vehicle box
 * (such as the Squad 8x8 APC or Enemy Convoy Trucks/Escorts).
 */
export function resolveDynamicBoxCollision(
  outPos: { x: number; z: number },
  actorBottomY: number,
  actorRadius: number,
  boxCenterX: number,
  boxBottomY: number,
  boxCenterZ: number,
  boxHalfX: number,
  boxHeight: number,
  boxHalfZ: number,
  boxYaw: number
): boolean {
  if (actorBottomY >= boxBottomY + boxHeight - 0.1 || actorBottomY + 1.8 <= boxBottomY) {
    return false;
  }
  const dx = outPos.x - boxCenterX;
  const dz = outPos.z - boxCenterZ;
  const boundR = Math.hypot(boxHalfX, boxHalfZ) + actorRadius;
  if (dx * dx + dz * dz >= boundR * boundR) return false;

  const cosY = Math.cos(boxYaw);
  const sinY = Math.sin(boxYaw);
  let lx = dx * cosY - dz * sinY;
  let lz = dx * sinY + dz * cosY;

  const qx = lx < -boxHalfX ? -boxHalfX : lx > boxHalfX ? boxHalfX : lx;
  const qz = lz < -boxHalfZ ? -boxHalfZ : lz > boxHalfZ ? boxHalfZ : lz;
  const ex = lx - qx;
  const ez = lz - qz;
  const distSq = ex * ex + ez * ez;
  if (distSq >= actorRadius * actorRadius) return false;

  if (distSq > 1e-8) {
    const dist = Math.sqrt(distSq);
    const push = (actorRadius - dist) / dist;
    lx += ex * push;
    lz += ez * push;
  } else {
    const penX = boxHalfX + actorRadius - Math.abs(lx);
    const penZ = boxHalfZ + actorRadius - Math.abs(lz);
    if (penX < penZ) lx = lx >= 0 ? boxHalfX + actorRadius : -(boxHalfX + actorRadius);
    else lz = lz >= 0 ? boxHalfZ + actorRadius : -(boxHalfZ + actorRadius);
  }

  outPos.x = boxCenterX + lx * cosY + lz * sinY;
  outPos.z = boxCenterZ - lx * sinY + lz * cosY;
  return true;
}
