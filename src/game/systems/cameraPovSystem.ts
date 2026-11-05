import * as THREE from 'three';
import {
  CameraRigConfig,
  CameraRigTelemetry,
  PerspectiveMode,
  ShoulderSide,
} from '../types/systems';
import { StaticWorldPhysics } from './staticCollisionSystem';

export const DEFAULT_CAMERA_RIG_CONFIG: CameraRigConfig = {
  firstPersonEyeOffset: { x: 0.0, y: 1.64, z: 0.08 },
  thirdPersonPivotOffset: { x: 0.0, y: 1.56, z: 0.0 },
  thirdPersonArmLength: 3.35,
  thirdPersonShoulderOffset: 0.62,
  adsArmLength: 1.72,
  adsShoulderOffset: 0.46,
  fovFirstPerson: 74,
  fovThirdPerson: 65,
  fovAds: 45,
  transitionSpeedLambda: 14.0,
  collisionProbeRadius: 0.28,
  collisionSnapInLambda: 34.0,
  collisionRecoverOutLambda: 8.0,
  minArmClamp: 0.42,
  minConvergenceDistance: 2.2,
  maxAimTraceDistance: 260.0,
};

// Pre-allocated math scratchpad to guarantee zero GC allocations per frame
const _pivotFp = new THREE.Vector3();
const _pivotTp = new THREE.Vector3();
const _activePivot = new THREE.Vector3();
const _camRotQuat = new THREE.Quaternion();
const _camEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const _rightVec = new THREE.Vector3();
const _upVec = new THREE.Vector3();
const _backVec = new THREE.Vector3();
const _desiredTpPos = new THREE.Vector3();
const _armDir = new THREE.Vector3();
const _whiskerOrigin = new THREE.Vector3();
const _whiskerTarget = new THREE.Vector3();
const _whiskerDir = new THREE.Vector3();
const _sightOrigin = new THREE.Vector3();
const _sightDir = new THREE.Vector3();
const _focalPoint = new THREE.Vector3();
const _muzzleDir = new THREE.Vector3();
const _projectedBlock = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();

const WHISKER_OFFSETS: ReadonlyArray<{ right: number; up: number }> = [
  { right: 0, up: 0 },
  { right: 1, up: 0 },
  { right: -1, up: 0 },
  { right: 0, up: 1 },
  { right: 0, up: -0.85 },
];

export class SeamlessCameraPovController {
  public config: CameraRigConfig;
  public targetMode: PerspectiveMode = PerspectiveMode.THIRD_PERSON;
  public shoulderSide: ShoulderSide = ShoulderSide.RIGHT;
  public isAimingDownSights: boolean = false;

  // 0.0 = pure First-Person, 1.0 = pure Third-Person
  public blendAlpha: number = 1.0;
  public currentArmLength: number;
  public currentShoulderOffset: number;
  public yawRad: number = 0;
  public pitchRad: number = -0.05;

  // Dynamic recoil & tactical camera shake spring state
  private recoilPitchOffset: number = 0;
  private recoilYawOffset: number = 0;
  private shakeIntensity: number = 0;
  private shakeClock: number = 0;
  private lastCollisionNormal = new THREE.Vector3(0, 1, 0);

  constructor(config: CameraRigConfig = DEFAULT_CAMERA_RIG_CONFIG) {
    this.config = { ...config };
    this.currentArmLength = config.thirdPersonArmLength;
    this.currentShoulderOffset = config.thirdPersonShoulderOffset;
  }

  public togglePerspectiveMode(): PerspectiveMode {
    this.targetMode =
      this.targetMode === PerspectiveMode.THIRD_PERSON
        ? PerspectiveMode.FIRST_PERSON
        : PerspectiveMode.THIRD_PERSON;
    return this.targetMode;
  }

  public swapShoulder(): ShoulderSide {
    this.shoulderSide =
      this.shoulderSide === ShoulderSide.RIGHT
        ? ShoulderSide.LEFT
        : ShoulderSide.RIGHT;
    return this.shoulderSide;
  }

  public applyLookDelta(deltaX: number, deltaY: number, sensitivity = 0.0022): void {
    const adsScale = this.isAimingDownSights ? 0.6 : 1.0;
    this.yawRad -= deltaX * sensitivity * adsScale;
    this.pitchRad = THREE.MathUtils.clamp(
      this.pitchRad - deltaY * sensitivity * adsScale,
      -Math.PI * 0.44,
      Math.PI * 0.44
    );
  }

  public applyCombatImpulse(pitchKickRad: number, yawJitterRad: number, traumaShake = 0): void {
    this.recoilPitchOffset = Math.min(0.14, this.recoilPitchOffset + pitchKickRad);
    this.recoilYawOffset += yawJitterRad;
    this.shakeIntensity = Math.min(0.35, this.shakeIntensity + traumaShake);
  }

  /**
   * High-precision binary-refined analytical terrain ray intersection (sub-4cm accuracy)
   * so 3rd-person OTS ground and ridge shots converge cleanly without coarse step error.
   */
  private intersectTerrainRay(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    maxDist: number,
    sampleTerrain: (x: number, z: number) => number
  ): number {
    const coarseStep = 2.0;
    let prevT = 0.5;
    for (let t = 2.0; t <= maxDist; t += coarseStep) {
      const sx = origin.x + dir.x * t;
      const sy = origin.y + dir.y * t;
      const sz = origin.z + dir.z * t;
      if (sy <= sampleTerrain(sx, sz)) {
        // Binary refine between [prevT, t] in 6 iterations -> 2.0 / 64 = ~0.031m precision
        let lo = prevT;
        let hi = t;
        for (let iter = 0; iter < 6; iter++) {
          const mid = (lo + hi) * 0.5;
          const my = origin.y + dir.y * mid;
          const gh = sampleTerrain(origin.x + dir.x * mid, origin.z + dir.z * mid);
          if (my <= gh) hi = mid;
          else lo = mid;
        }
        return hi;
      }
      prevT = t;
    }
    return maxDist;
  }

  public update(
    dt: number,
    camera: THREE.PerspectiveCamera,
    playerWorldPos: THREE.Vector3,
    muzzleWorldPos: THREE.Vector3,
    collidableMeshes: THREE.Object3D[],
    sampleTerrainHeight: (x: number, z: number) => number,
    staticPhysics?: StaticWorldPhysics
  ): CameraRigTelemetry {
    const targetAlpha = this.targetMode === PerspectiveMode.THIRD_PERSON ? 1.0 : 0.0;
    this.blendAlpha = THREE.MathUtils.damp(
      this.blendAlpha,
      targetAlpha,
      this.config.transitionSpeedLambda,
      dt
    );

    // Recover recoil & trauma shake smoothly
    this.recoilPitchOffset = THREE.MathUtils.damp(this.recoilPitchOffset, 0, 16.0, dt);
    this.recoilYawOffset = THREE.MathUtils.damp(this.recoilYawOffset, 0, 16.0, dt);
    this.shakeIntensity = THREE.MathUtils.damp(this.shakeIntensity, 0, 6.5, dt);
    this.shakeClock += dt * 38.0;

    const smoothAlpha =
      this.blendAlpha * this.blendAlpha * (3 - 2 * this.blendAlpha);

    const shakePitch = Math.sin(this.shakeClock * 1.3) * this.shakeIntensity * 0.025;
    const shakeRoll = Math.cos(this.shakeClock * 1.7) * this.shakeIntensity * 0.03;

    const effectivePitch = THREE.MathUtils.clamp(
      this.pitchRad + this.recoilPitchOffset + shakePitch,
      -Math.PI * 0.46,
      Math.PI * 0.46
    );
    const effectiveYaw = this.yawRad + this.recoilYawOffset;

    _camEuler.set(effectivePitch, effectiveYaw, shakeRoll, 'YXZ');
    _camRotQuat.setFromEuler(_camEuler);

    _rightVec.set(1, 0, 0).applyQuaternion(_camRotQuat);
    _upVec.set(0, 1, 0).applyQuaternion(_camRotQuat);
    _backVec.set(0, 0, 1).applyQuaternion(_camRotQuat);

    // 1. First-Person Eye Anchor
    const sinYaw = Math.sin(effectiveYaw);
    const cosYaw = Math.cos(effectiveYaw);
    _pivotFp.set(
      playerWorldPos.x - sinYaw * this.config.firstPersonEyeOffset.z,
      playerWorldPos.y + this.config.firstPersonEyeOffset.y,
      playerWorldPos.z - cosYaw * this.config.firstPersonEyeOffset.z
    );

    // 2. Smoothly damped Shoulder Swap & ADS Offset
    const idealArm = this.isAimingDownSights
      ? this.config.adsArmLength
      : this.config.thirdPersonArmLength;
    const targetShoulder =
      (this.isAimingDownSights
        ? this.config.adsShoulderOffset
        : this.config.thirdPersonShoulderOffset) * this.shoulderSide;

    this.currentShoulderOffset = THREE.MathUtils.damp(
      this.currentShoulderOffset,
      targetShoulder,
      14.5,
      dt
    );

    _pivotTp.set(
      playerWorldPos.x,
      playerWorldPos.y + this.config.thirdPersonPivotOffset.y,
      playerWorldPos.z
    );

    _desiredTpPos
      .copy(_pivotTp)
      .addScaledVector(_rightVec, this.currentShoulderOffset)
      .addScaledVector(_backVec, idealArm);

    // 3. Multi-Whisker Sphere-Cast Approximation Against Environment Geometry
    _armDir.subVectors(_desiredTpPos, _pivotTp);
    const fullSpanDist = _armDir.length();
    if (fullSpanDist > 0.0001) {
      _armDir.divideScalar(fullSpanDist);
    }

    let minSafeFraction = 1.0;
    let collisionDetected = false;
    const probeR = this.config.collisionProbeRadius;

    if (smoothAlpha > 0.01 && (collidableMeshes.length > 0 || staticPhysics)) {
      for (let i = 0; i < WHISKER_OFFSETS.length; i++) {
        const w = WHISKER_OFFSETS[i];
        _whiskerOrigin
          .copy(_pivotTp)
          .addScaledVector(_rightVec, w.right * probeR * 0.65)
          .addScaledVector(_upVec, w.up * probeR * 0.65);

        _whiskerTarget
          .copy(_desiredTpPos)
          .addScaledVector(_rightVec, w.right * probeR)
          .addScaledVector(_upVec, w.up * probeR);

        _whiskerDir.subVectors(_whiskerTarget, _whiskerOrigin);
        const rayLen = _whiskerDir.length();
        if (rayLen <= 0.001) continue;
        _whiskerDir.divideScalar(rayLen);

        let closestDist = Infinity;

        if (staticPhysics) {
          const sHit = staticPhysics.raycast(_whiskerOrigin, _whiskerDir, rayLen);
          if (sHit && sHit.distance < closestDist) {
            closestDist = sHit.distance;
            this.lastCollisionNormal.set(sHit.normalX, sHit.normalY, sHit.normalZ);
          }
        }

        if (collidableMeshes.length > 0) {
          _raycaster.set(_whiskerOrigin, _whiskerDir);
          _raycaster.near = 0.05;
          _raycaster.far = Math.min(rayLen, closestDist);

          const hits = _raycaster.intersectObjects(collidableMeshes, true);
          if (hits.length > 0 && hits[0].distance < closestDist) {
            closestDist = hits[0].distance;
            if (hits[0].face) {
              this.lastCollisionNormal.copy(hits[0].face.normal);
            }
          }
        }

        if (closestDist < Infinity) {
          const hitDist = Math.max(0, closestDist - probeR);
          const frac = THREE.MathUtils.clamp(hitDist / rayLen, 0, 1);
          if (frac < minSafeFraction) {
            minSafeFraction = frac;
            collisionDetected = true;
          }
        }
      }
    }

    const safeTargetSpan = Math.max(
      this.config.minArmClamp,
      fullSpanDist * minSafeFraction
    );
    const armLambda =
      safeTargetSpan < this.currentArmLength
        ? this.config.collisionSnapInLambda
        : this.config.collisionRecoverOutLambda;

    this.currentArmLength = THREE.MathUtils.damp(
      this.currentArmLength,
      safeTargetSpan,
      armLambda,
      dt
    );

    _desiredTpPos
      .copy(_pivotTp)
      .addScaledVector(_armDir, this.currentArmLength);

    const groundAtCam = sampleTerrainHeight(_desiredTpPos.x, _desiredTpPos.z);
    if (_desiredTpPos.y < groundAtCam + probeR + 0.14) {
      _desiredTpPos.y = groundAtCam + probeR + 0.14;
      collisionDetected = true;
    }

    // 4. Blend Seamlessly Between 1st-Person Eye Socket and 3rd-Person Collided Rig
    _activePivot.lerpVectors(_pivotFp, _desiredTpPos, smoothAlpha);
    camera.position.copy(_activePivot);
    camera.quaternion.copy(_camRotQuat);

    const baseFov = THREE.MathUtils.lerp(
      this.config.fovFirstPerson,
      this.config.fovThirdPerson,
      smoothAlpha
    );
    const targetFov = this.isAimingDownSights ? this.config.fovAds : baseFov;
    if (Math.abs(camera.fov - targetFov) > 0.02) {
      camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 15.0, dt);
      camera.updateProjectionMatrix();
    }

    // 5. High-Precision Dual-Ray Parallax Reticle Convergence Solver
    _sightOrigin.copy(camera.position);
    camera.getWorldDirection(_sightDir);

    _raycaster.set(_sightOrigin, _sightDir);
    _raycaster.near = 0.25;
    _raycaster.far = this.config.maxAimTraceDistance;

    let focalDistance = this.config.maxAimTraceDistance;
    if (staticPhysics) {
      const staticSightHit = staticPhysics.raycast(
        _sightOrigin,
        _sightDir,
        focalDistance
      );
      if (staticSightHit && staticSightHit.distance >= 0.25) {
        focalDistance = Math.max(
          this.config.minConvergenceDistance,
          staticSightHit.distance
        );
      }
    }

    if (collidableMeshes.length > 0) {
      _raycaster.set(_sightOrigin, _sightDir);
      _raycaster.near = 0.25;
      _raycaster.far = focalDistance;
      const sightHits = _raycaster.intersectObjects(collidableMeshes, true);
      if (sightHits.length > 0) {
        focalDistance = Math.max(
          this.config.minConvergenceDistance,
          sightHits[0].distance
        );
      }
    }

    const terrainHitDist = this.intersectTerrainRay(
      _sightOrigin,
      _sightDir,
      focalDistance,
      sampleTerrainHeight
    );
    focalDistance = Math.max(
      this.config.minConvergenceDistance,
      Math.min(focalDistance, terrainHitDist)
    );

    _focalPoint
      .copy(_sightOrigin)
      .addScaledVector(_sightDir, focalDistance);

    _muzzleDir.subVectors(_focalPoint, muzzleWorldPos).normalize();

    const cosAngle = THREE.MathUtils.clamp(_sightDir.dot(_muzzleDir), -1, 1);
    const parallaxAngleDeg = THREE.MathUtils.radToDeg(Math.acos(cosAngle));

    let muzzleBlockedByCover = false;
    let blockedNdcX = 0;
    let blockedNdcY = 0;

    const muzzleToFocalDist = muzzleWorldPos.distanceTo(_focalPoint);
    if (smoothAlpha > 0.15 && muzzleToFocalDist > 0.6) {
      const traceLimit = muzzleToFocalDist - 0.35;
      if (staticPhysics) {
        const sBlock = staticPhysics.raycast(muzzleWorldPos, _muzzleDir, traceLimit);
        if (sBlock) {
          muzzleBlockedByCover = true;
          _projectedBlock
            .set(sBlock.pointX, sBlock.pointY, sBlock.pointZ)
            .project(camera);
          blockedNdcX = THREE.MathUtils.clamp(_projectedBlock.x, -0.9, 0.9);
          blockedNdcY = THREE.MathUtils.clamp(_projectedBlock.y, -0.9, 0.9);
        }
      }

      if (!muzzleBlockedByCover && collidableMeshes.length > 0) {
        _raycaster.set(muzzleWorldPos, _muzzleDir);
        _raycaster.near = 0.1;
        _raycaster.far = traceLimit;
        const barrelObstructions = _raycaster.intersectObjects(collidableMeshes, true);
        if (barrelObstructions.length > 0) {
          muzzleBlockedByCover = true;
          _projectedBlock.copy(barrelObstructions[0].point).project(camera);
          blockedNdcX = THREE.MathUtils.clamp(_projectedBlock.x, -0.9, 0.9);
          blockedNdcY = THREE.MathUtils.clamp(_projectedBlock.y, -0.9, 0.9);
        }
      }
    }

    return {
      targetMode: this.targetMode,
      blendAlpha: this.blendAlpha,
      shoulderSide: this.shoulderSide,
      isAimingDownSights: this.isAimingDownSights,
      desiredArmLength: fullSpanDist,
      occludedArmLength: this.currentArmLength,
      collisionActive: collisionDetected,
      collisionNormal: {
        x: this.lastCollisionNormal.x,
        y: this.lastCollisionNormal.y,
        z: this.lastCollisionNormal.z,
      },
      focalPointWorld: {
        x: _focalPoint.x,
        y: _focalPoint.y,
        z: _focalPoint.z,
      },
      focalDistance,
      muzzleOriginWorld: {
        x: muzzleWorldPos.x,
        y: muzzleWorldPos.y,
        z: muzzleWorldPos.z,
      },
      convergentMuzzleDir: {
        x: _muzzleDir.x,
        y: _muzzleDir.y,
        z: _muzzleDir.z,
      },
      parallaxAngleDeg,
      muzzleBlockedByCover,
      blockedImpactScreenNdc: { x: blockedNdcX, y: blockedNdcY },
    };
  }
}
