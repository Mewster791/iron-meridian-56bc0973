import React, { useMemo, useState } from 'react';
import {
  FactionId,
  ObjectiveArchetype,
  ObjectiveStatus,
  PlayerCombatState,
  RetrofitStage,
  RetrofitTechNode,
  SalvageInventory,
  TacticalUnitVehicleState,
  TerrainBiome,
  TheaterObjective,
} from '../types/systems';
import { canAdvanceRetrofitStage } from '../systems/scavengeRetrofitSystem';
import {
  FACTION_EMERGENCY_SWORDS,
  FACTION_PRIMARY_FIREARMS,
  STANDARD_MEDICAL_GEAR,
} from '../systems/loadoutHealthSystem';
import { BRIDGE_X_COORDS, THEATER_LANDMARKS } from '../systems/theaterMapGenerator';
import { TopographicalMapView } from './TopographicalMapCanvas';
import { Check, Copy, MapPin, RefreshCw, Shield, Wrench } from 'lucide-react';

// ============================================================================
// SECTION 1: SEAMLESS CAMERA & POV TOGGLE ARCHITECTURE VIEW
// ============================================================================

export const CameraPovArchitectureView: React.FC = () => {
  const [simBlendAlpha, setSimBlendAlpha] = useState<number>(1.0);
  const [simTargetDistance, setSimTargetDistance] = useState<number>(38);
  const [simWallDistance, setSimWallDistance] = useState<number>(3.35);
  const [simLowCoverBlock, setSimLowCoverBlock] = useState<boolean>(false);
  const [copiedBlock, setCopiedBlock] = useState<string | null>(null);

  // Live Interactive Dual-Ray Parallax Math Resolver
  const shoulderOffset = 0.62 * simBlendAlpha;
  const effectiveArm = Math.min(3.35, simWallDistance) * simBlendAlpha;
  const parallaxRad = Math.atan2(
    Math.hypot(shoulderOffset, effectiveArm * 0.18),
    Math.max(2.2, simTargetDistance)
  );
  const parallaxDeg = (parallaxRad * 180) / Math.PI;

  const copyCode = (id: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedBlock(id);
    setTimeout(() => setCopiedBlock(null), 1800);
  };

  const cameraArchitectureCode = `export class SeamlessCameraPovController {
  // blendAlpha: 0.0 = Pure 1st-Person Eye Socket, 1.0 = Pure 3rd-Person OTS Rig
  public targetMode: 'FIRST_PERSON' | 'THIRD_PERSON' = 'THIRD_PERSON';
  public blendAlpha: number = 1.0;
  public currentArmLength: number = 3.35;

  // 1. Non-blocking C1-continuous 'C' key toggle (supports mid-flight reversal)
  public onKeyC(event: KeyboardEvent): void {
    if (event.repeat) return;
    this.targetMode = this.targetMode === 'THIRD_PERSON' ? 'FIRST_PERSON' : 'THIRD_PERSON';
  }

  // 2. Asymmetric 5-Whisker Sphere-Cast Collision + Dual-Ray Reticle Convergence
  public stepCameraAndConvergence(
    dt: number,
    camera: THREE.PerspectiveCamera,
    eyeSocketWorld: THREE.Vector3,
    shoulderPivotWorld: THREE.Vector3,
    muzzleWorld: THREE.Vector3,
    colliders: THREE.Object3D[],
    raycaster: THREE.Raycaster
  ): THREE.Vector3 {
    const targetAlpha = this.targetMode === 'THIRD_PERSON' ? 1.0 : 0.0;
    this.blendAlpha = THREE.MathUtils.damp(this.blendAlpha, targetAlpha, 13.5, dt);
    const smoothAlpha = this.blendAlpha * this.blendAlpha * (3 - 2 * this.blendAlpha);

    // Swept 5-whisker pentagon probe (r = 0.28m) prevents near-clip wall penetration
    const idealArm = 3.35;
    const minHitFraction = this.castPentagonWhiskers(shoulderPivotWorld, camera.quaternion, idealArm, 0.28, colliders, raycaster);
    const safeSpan = Math.max(0.42, idealArm * minHitFraction);

    // Asymmetric damping: rapid snap-in (lambda = 32) on occlusion, smooth ease-out (lambda = 7.5)
    const armLambda = safeSpan < this.currentArmLength ? 32.0 : 7.5;
    this.currentArmLength = THREE.MathUtils.damp(this.currentArmLength, safeSpan, armLambda, dt);

    const collidedThirdPersonPos = this.computeShoulderArmWorld(shoulderPivotWorld, camera.quaternion, 0.62, this.currentArmLength);
    camera.position.lerpVectors(eyeSocketWorld, collidedThirdPersonPos, smoothAlpha);
    camera.fov = THREE.MathUtils.lerp(74, 66, smoothAlpha);
    camera.updateProjectionMatrix();

    // Dual-Ray Parallax Alignment: Cast Ray A along optical center (NDC 0,0) -> P_focal
    const opticalDir = camera.getWorldDirection(new THREE.Vector3());
    raycaster.set(camera.position, opticalDir);
    raycaster.near = 0.25;
    raycaster.far = 260.0;
    const sightHits = raycaster.intersectObjects(colliders, true);
    const focalDist = sightHits.length > 0 ? Math.max(2.2, sightHits[0].distance) : 260.0;

    const focalPointWorld = camera.position.clone().addScaledVector(opticalDir, focalDist);
    // Align ballistic muzzle vector directly from physical barrel to P_focal
    return focalPointWorld.sub(muzzleWorld).normalize();
  }
}`;

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-12">
      {/* Header */}
      <div className="space-y-3 border-b border-slate-800 pb-8">
        <div className="text-xs text-slate-400 font-mono">
          Section 01 · Camera Choreography & Ballistic Convergence · MGSV-Grade Spring-Arm Rig
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-white">
          01. The Seamless Camera & POV Toggle System
        </h1>
        <p className="text-slate-300 max-w-3xl leading-relaxed text-[15px]">
          Full architectural specification and interactive solver governing dynamic{' '}
          <code className="text-[#F59E0B] px-1">KeyC</code> transitions between First-Person true-eye
          optics and Third-Person Over-the-Shoulder tactical framing, swept multi-whisker collision
          damping, and exact dual-ray parallax reticle convergence.
        </p>
      </div>

      {/* Interactive Dual-Ray Parallax & Spring-Arm Simulator */}
      <section className="bg-[#11161F] border border-slate-800 rounded-xl p-6 space-y-6">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-white">
              Interactive Dual-Ray Convergence & Spring-Arm Occlusion Bench
            </h2>
            <p className="text-sm text-slate-400">
              Adjust POV blend α, wall occlusion distance, and target range to inspect real-time
              muzzle-to-reticle angular compensation.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSimBlendAlpha((prev) => (prev > 0.5 ? 0.0 : 1.0))}
              className="px-3.5 py-1.5 rounded-md bg-[#F59E0B] text-slate-950 text-xs font-semibold hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0"
            >
              Simulate &apos;C&apos; Key Toggle ({simBlendAlpha > 0.5 ? '3rd → 1st' : '1st → 3rd'})
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Top-Down SVG Geometric Vector Diagram */}
          <div className="lg:col-span-7 bg-[#0B0E13] border border-slate-800/90 rounded-lg p-4 flex flex-col justify-between">
            <svg viewBox="0 0 560 230" className="w-full h-56">
              {/* Subtle reference grid */}
              <line x1="20" y1="115" x2="540" y2="115" stroke="#1e293b" strokeDasharray="4 4" />
              {/* Operator Silhouette */}
              <circle cx="135" cy="115" r="14" fill="#1e293b" stroke="#94a3b8" strokeWidth="2" />
              <text x="112" y="92" fill="#cbd5e1" fontSize="11" fontFamily="monospace">
                Operator Eye
              </text>

              {/* Muzzle World Node */}
              <rect x="148" y="121" width="22" height="5" fill="#f59e0b" />
              <circle cx="172" cy="123.5" r="3.5" fill="#f59e0b" />

              {/* Collided 3rd-Person Camera Position */}
              {(() => {
                const camX = 135 - effectiveArm * 26;
                const camY = 115 + shoulderOffset * 58;
                const focalX = 175 + Math.min(345, simTargetDistance * 5.2);
                const focalY = 115;

                return (
                  <>
                    {/* Spring Arm */}
                    <line
                      x1="135"
                      y1="115"
                      x2={camX}
                      y2={camY}
                      stroke="#64748b"
                      strokeWidth="2"
                      strokeDasharray="3 3"
                    />
                    {/* Swept Probe Sphere Radius R=0.28m */}
                    <circle
                      cx={camX}
                      cy={camY}
                      r="11"
                      fill="rgba(56,189,248,0.14)"
                      stroke="#38bdf8"
                      strokeWidth="1.5"
                    />
                    <text x={Math.max(12, camX - 24)} y={camY + 26} fill="#38bdf8" fontSize="11" fontFamily="monospace">
                      Active Cam (α={simBlendAlpha.toFixed(2)})
                    </text>

                    {/* Ray A: Camera Center Optical Sight Ray */}
                    <line
                      x1={camX}
                      y1={camY}
                      x2={focalX}
                      y2={focalY}
                      stroke="#38bdf8"
                      strokeWidth="2"
                    />

                    {/* Optional Low Cover Obstacle in front of Muzzle */}
                    {simLowCoverBlock && (
                      <>
                        <rect x="245" y="114" width="12" height="24" fill="#ef4444" opacity="0.85" />
                        <text x="220" y="152" fill="#ef4444" fontSize="10" fontFamily="monospace">
                          Low Cover Block (×)
                        </text>
                      </>
                    )}

                    {/* Ray B: Convergent Muzzle Ballistic Vector */}
                    <line
                      x1="172"
                      y1="123.5"
                      x2={simLowCoverBlock ? 245 : focalX}
                      y2={simLowCoverBlock ? 121 : focalY}
                      stroke="#f59e0b"
                      strokeWidth="2.2"
                    />

                    {/* World Focal Convergence Point P_focal */}
                    <circle cx={focalX} cy={focalY} r="6" fill="none" stroke="#10b981" strokeWidth="2" />
                    <circle cx={focalX} cy={focalY} r="2" fill="#10b981" />
                    <text x={Math.min(455, focalX - 30)} y={focalY - 14} fill="#10b981" fontSize="11" fontFamily="monospace">
                      P_focal ({simTargetDistance}m)
                    </text>
                  </>
                );
              })()}
            </svg>

            <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-slate-400 pt-2 border-t border-slate-800/80 tabular-nums">
              <span>Cyan: Optical Sight Ray (Cam → Screen 0,0)</span>
              <span>·</span>
              <span>Amber: Convergent Muzzle Vector (Muzzle → P_focal)</span>
            </div>
          </div>

          {/* Controls & Live Equations */}
          <div className="lg:col-span-5 flex flex-col justify-between space-y-4 bg-[#0B0E13] border border-slate-800/90 rounded-lg p-5">
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">POV Blend Alpha (0.0 = 1st, 1.0 = 3rd)</span>
                  <span className="font-mono text-white tabular-nums">{simBlendAlpha.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={simBlendAlpha}
                  onChange={(e) => setSimBlendAlpha(Number(e.target.value))}
                  className="w-full accent-[#F59E0B]"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">Environment Wall Clearance Behind Operator</span>
                  <span className="font-mono text-white tabular-nums">{simWallDistance.toFixed(2)} m</span>
                </div>
                <input
                  type="range"
                  min={0.45}
                  max={3.35}
                  step={0.05}
                  value={simWallDistance}
                  onChange={(e) => setSimWallDistance(Number(e.target.value))}
                  className="w-full accent-[#38BDF8]"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">Reticle Focal Target Distance</span>
                  <span className="font-mono text-white tabular-nums">{simTargetDistance} m</span>
                </div>
                <input
                  type="range"
                  min={2.5}
                  max={65}
                  step={0.5}
                  value={simTargetDistance}
                  onChange={(e) => setSimTargetDistance(Number(e.target.value))}
                  className="w-full accent-emerald-400"
                />
              </div>

              <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={simLowCoverBlock}
                  onChange={(e) => setSimLowCoverBlock(e.target.checked)}
                  className="rounded accent-[#EF4444]"
                />
                <span>Simulate waist-high parapet obstructing physical barrel</span>
              </label>
            </div>

            <div className="pt-3 border-t border-slate-800 space-y-1.5 text-xs font-mono tabular-nums">
              <div className="flex justify-between">
                <span className="text-slate-400">Active Spring Arm:</span>
                <span className="text-white">{effectiveArm.toFixed(2)} m</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Lateral Shoulder Offset:</span>
                <span className="text-white">{shoulderOffset.toFixed(2)} m</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Interpolated Vertical FOV:</span>
                <span className="text-white">{(74 - 8 * simBlendAlpha).toFixed(1)}°</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Muzzle Convergence Angle θ:</span>
                <span className="text-[#F59E0B]">{parallaxDeg.toFixed(3)}°</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Deep Architectural Specification Prose */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#11161F] border border-slate-800 rounded-xl p-6 space-y-3">
          <h3 className="text-xl font-semibold text-white">
            1.1 Architectural Logic for &apos;C&apos; Key POV Transitions
          </h3>
          <p className="text-sm text-slate-300 leading-relaxed">
            Rather than swapping between two discrete <code className="text-slate-200">THREE.Camera</code>{' '}
            instances (which causes jarring frustum jumps, shadow-cascade pops, and view-vector
            discontinuity), a single master <code className="text-slate-200">PerspectiveCamera</code> is
            driven by a continuous scalar state variable <code className="text-[#F59E0B]">blendAlpha ∈ [0, 1]</code>.
          </p>
          <ul className="text-sm text-slate-400 space-y-2 leading-relaxed list-disc pl-4">
            <li>
              <strong className="text-slate-200">Input Debounce & Mid-Flight Reversal:</strong> Pressing{' '}
              <code className="text-slate-200">KeyC</code> (filtered via <code className="text-slate-200">!event.repeat</code>)
              flips <code className="text-slate-200">targetMode</code> without resetting{' '}
              <code className="text-slate-200">blendAlpha</code>. Rapidly double-tapping <code className="text-slate-200">C</code>{' '}
              reverses velocity smoothly mid-air via frame-rate-independent exponential damping (
              <code className="text-slate-200">λ = 13.5</code>, settling in ~180ms).
            </li>
            <li>
              <strong className="text-slate-200">Mesh Cross-Gating Threshold:</strong> At{' '}
              <code className="text-slate-200">blendAlpha = 0.26</code>, the renderer swaps visibility
              between the 3rd-person operator mesh (preventing camera clipping inside the helmet/head)
              and the camera-parented 1st-person firearm/sword rig while preserving identical world
              euler yaw/pitch.
            </li>
            <li>
              <strong className="text-slate-200">Optical FOV Coupling:</strong> Vertical FOV interpolates
              from <code className="text-slate-200">66°</code> (3rd-person tactical compression) to{' '}
              <code className="text-slate-200">74°</code> (1st-person peripheral awareness), narrowing to{' '}
              <code className="text-slate-200">46°</code> when Aiming Down Sights (ADS).
            </li>
          </ul>
        </div>

        <div className="bg-[#11161F] border border-slate-800 rounded-xl p-6 space-y-3">
          <h3 className="text-xl font-semibold text-white">
            1.2 Swept Multi-Whisker Camera Collision Resolution
          </h3>
          <p className="text-sm text-slate-300 leading-relaxed">
            A single raycast from pivot to camera fails at grazing wall angles because the camera&apos;s
            near-clip plane frustum still slices into geometry edges. To achieve MGSV-caliber
            smoothness without physics jitter:
          </p>
          <ul className="text-sm text-slate-400 space-y-2 leading-relaxed list-disc pl-4">
            <li>
              <strong className="text-slate-200">5-Ray Pentagon Sphere-Cast Approximation:</strong> Five
              parallel rays (center + right, left, top, bottom offsets at probe radius{' '}
              <code className="text-slate-200">R = 0.28m</code>) sweep from the shoulder pivot to the
              ideal Over-The-Shoulder anchor. The minimum hit fraction{' '}
              <code className="text-slate-200">f_min = min((d_hit - R) / L_arm)</code> governs safe arm
              contraction.
            </li>
            <li>
              <strong className="text-slate-200">Asymmetric Spring Damping:</strong> Occlusion contraction
              uses high-stiffness damping (<code className="text-slate-200">λ_in = 32.0</code>) so walls
              never clip for even a single frame, whereas post-obstacle recovery uses relaxed damping (
              <code className="text-slate-200">λ_out = 7.5</code>) so passing trees, pillars, or bunker
              HESCO blocks glides smoothly rather than snapping.
            </li>
            <li>
              <strong className="text-slate-200">Slope & Minimum Clamp Guard:</strong> Arm length clamps at{' '}
              <code className="text-slate-200">0.42m</code> (automatically triggering 1st-person mesh mask
              if backed tight into a bunker corner), while analytical terrain height sampling enforces{' '}
              <code className="text-slate-200">y_cam ≥ h_terrain(x, z) + R + 0.12m</code>.
            </li>
          </ul>
        </div>

        <div className="bg-[#11161F] border border-slate-800 rounded-xl p-6 space-y-3">
          <h3 className="text-xl font-semibold text-white">
            1.3 Dual-Ray Parallax Reticle Alignment Solver
          </h3>
          <p className="text-sm text-slate-300 leading-relaxed">
            In 3rd-person OTS, the camera sits <code className="text-slate-200">0.62m</code> laterally and{' '}
            <code className="text-slate-200">3.35m</code> behind the rifle muzzle. Firing parallel to the
            camera look vector would cause every shot to miss <code className="text-slate-200">0.62m</code>{' '}
            left/right of the crosshair.
          </p>
          <ul className="text-sm text-slate-400 space-y-2 leading-relaxed list-disc pl-4">
            <li>
              <strong className="text-slate-200">Stage 1 (Optical Sight Ray):</strong> Cast{' '}
              <code className="text-slate-200">Ray_sight</code> from{' '}
              <code className="text-slate-200">P_cam</code> through screen center{' '}
              <code className="text-slate-200">NDC(0, 0)</code> against world geometry & enemies to resolve{' '}
              <code className="text-[#38BDF8]">P_focal = P_cam + d_cam · max(2.2m, t_hit)</code>. The{' '}
              <code className="text-slate-200">2.2m</code> floor prevents backward-angled shots if debris
              passes directly in front of the lens.
            </li>
            <li>
              <strong className="text-slate-200">Stage 2 (Convergent Muzzle Vector):</strong> Compute{' '}
              <code className="text-[#F59E0B]">d_muzzle = normalize(P_focal - P_muzzle)</code>. Because the
              screen reticle remains locked at <code className="text-slate-200">NDC(0, 0)</code> across
              both 1st and 3rd person, pressing <code className="text-slate-200">C</code> mid-aim keeps
              bullets striking the exact same world coordinate <code className="text-slate-200">P_focal</code>.
            </li>
            <li>
              <strong className="text-slate-200">Stage 3 (Cover Obstruction Check):</strong> Secondary{' '}
              <code className="text-slate-200">Ray_barrel</code> tests{' '}
              <code className="text-slate-200">P_muzzle → P_focal</code>. If low cover intercepts the
              barrel while the camera sees over it, that world hit projects to screen space as a warning{' '}
              <code className="text-[#EF4444]">× MUZZLE COVER BLOCK</code> marker.
            </li>
          </ul>
        </div>
      </div>

      {/* Production Code Implementation Block */}
      <section className="bg-[#11161F] border border-slate-800 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-[#0D1219]">
          <span className="text-xs font-mono text-slate-300">
            Production Implementation · Camera Spring-Arm & Dual-Ray Convergence Solver
          </span>
          <button
            type="button"
            onClick={() => copyCode('cam', cameraArchitectureCode)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 text-xs text-slate-200 hover:bg-slate-700 transition-colors"
          >
            {copiedBlock === 'cam' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedBlock === 'cam' ? 'Copied' : 'Copy Code'}</span>
          </button>
        </div>
        <pre className="p-5 text-xs font-mono text-slate-300 overflow-x-auto leading-relaxed">
          <code>{cameraArchitectureCode}</code>
        </pre>
      </section>
    </div>
  );
};

// ============================================================================
// SECTION 2: SCAVENGE & RETROFIT TECH TREE VIEW
// ============================================================================

interface ScavengeRetrofitViewProps {
  faction: FactionId;
  techNodes: RetrofitTechNode[];
  salvageInventory: SalvageInventory;
  vehicleState: TacticalUnitVehicleState;
  onAdvanceNode: (nodeId: string) => void;
  onSimulateConvoyLoot: () => void;
}

export const ScavengeRetrofitArchitectureView: React.FC<ScavengeRetrofitViewProps> = ({
  faction,
  techNodes,
  salvageInventory,
  vehicleState,
  onAdvanceNode,
  onSimulateConvoyLoot,
}) => {
  const [copied, setCopied] = useState(false);

  const schemaCode = `export interface CrossFactionSalvageItem {
  salvageId: string;
  originFaction: 'EAST' | 'WEST';
  subsystemClass: 'ERA_CASSETTE' | 'AESA_APS_RADAR' | 'FLIR_OPTIC' | 'ATGM_POD' | 'EW_JAMMER';
  electricalStandard: 'MIL_STD_1275D_28V' | 'GOST_R_50030_24V';
  mountingInterface: 'NATO_STANAG_4694' | 'DOVETAIL_14MM_LUG' | 'TURRET_TRUNNION_RING';
  conditionIntegrity: number; // 0.0 - 1.0
}

export interface AdapterConversionRecipe {
  recipeId: string;
  hostChassisId: 'BTR_82A_EAST' | 'M1126_STRYKER_WEST';
  requiredSalvageId: string;
  scrapAlloyCost: number;
  encryptedChipCost: number;
  voltageStepConverterRequired: boolean;
  structuralMassPenaltyKg: number;
  resultingModifiers: {
    armorPlatingHpDelta: number;
    kineticMitigationDelta: number;
    shapedChargeMitigationDelta: number; // e.g., +0.52 from M19 ARAT-2 ERA
    hardKillApsCharges: number;
  };
}`;

  const copySchema = () => {
    navigator.clipboard?.writeText(schemaCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-12">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-6 border-b border-slate-800 pb-8">
        <div className="space-y-3">
          <div className="text-xs text-slate-400 font-mono">
            Section 02 · Asymmetrical Logistics Progression · {faction} Unit Capturing{' '}
            {faction === FactionId.EAST ? 'WEST (NATO)' : 'EAST'} Hardware
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-white">
            02. The &ldquo;Scavenge &amp; Retrofit&rdquo; Tech Tree
          </h1>
          <p className="text-slate-300 max-w-3xl leading-relaxed text-[15px]">
            During a 1–2 hour persistent regional run, your tactical unit operates behind contested
            lines without factory resupply. Upgrading your squad APC and riflemen relies on ambushing
            enemy supply convoys, reverse-engineering foreign bus/lug standards, and fabricating field
            adapters. Anything you retrofit below immediately updates your 3D Command APC in the Live
            Arena.
          </p>
        </div>

        <button
          type="button"
          onClick={onSimulateConvoyLoot}
          className="px-4 py-2.5 rounded-lg bg-[#F59E0B] text-slate-950 text-xs font-semibold hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0"
        >
          Simulate Convoy Ambush Loot Drop (+ERA &amp; Chips)
        </button>
      </div>

      {/* Live Unit Chassis & Salvage Stockpile Strip */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-5 bg-[#11161F] border border-slate-800 rounded-xl p-6 flex flex-col justify-between space-y-4">
          <div className="space-y-1">
            <div className="text-xs font-mono text-slate-400">
              Active Command Vehicle · {vehicleState.callsign}
            </div>
            <h2 className="text-2xl font-semibold text-white">{vehicleState.chassisDesignation}</h2>
          </div>

          <div className="space-y-2.5 text-sm font-mono tabular-nums">
            <div className="flex justify-between border-b border-slate-800/80 pb-1.5">
              <span className="text-slate-400">Composite/ERA Armor Pool:</span>
              <span className="text-white font-semibold">
                {vehicleState.armorPlatingHp} / {vehicleState.maxArmorPlatingHp} HP
              </span>
            </div>
            <div className="flex justify-between border-b border-slate-800/80 pb-1.5">
              <span className="text-slate-400">Kinetic AP Mitigation:</span>
              <span className="text-emerald-400 font-semibold">
                {Math.round(vehicleState.kineticMitigation * 100)}%
              </span>
            </div>
            <div className="flex justify-between border-b border-slate-800/80 pb-1.5">
              <span className="text-slate-400">Shaped-Charge (HEAT/ATGM) Mitigation:</span>
              <span className="text-[#F59E0B] font-semibold">
                {Math.round(vehicleState.shapedChargeMitigation * 100)}%
              </span>
            </div>
            <div className="flex justify-between border-b border-slate-800/80 pb-1.5">
              <span className="text-slate-400">Hard-Kill APS Intercept Charges:</span>
              <span className="text-sky-400 font-semibold">
                {vehicleState.apsCharges} / {vehicleState.maxApsCharges}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Combat Curb Mass:</span>
              <span className="text-slate-200">{vehicleState.massKg.toLocaleString()} kg</span>
            </div>
          </div>

          <div className="text-xs text-slate-400 pt-2 border-t border-slate-800">
            3D Hull Modules Active:{' '}
            <span className="text-slate-200">
              {[
                vehicleState.hasEraTiles ? 'ERA Reactive Bricks' : null,
                vehicleState.hasApsRadar ? 'Hard-Kill APS Radar' : null,
                vehicleState.hasThermalMast ? 'FLIR Hunter-Killer Mast' : null,
                vehicleState.hasRemoteTurret ? 'Twin ATGM Pod' : null,
              ]
                .filter(Boolean)
                .join(' · ') || 'Baseline Factory RHA Steel Hull'}
            </span>
          </div>
        </div>

        {/* Salvage Stockpile & 4-Stage Pipeline */}
        <div className="lg:col-span-7 bg-[#11161F] border border-slate-800 rounded-xl p-6 flex flex-col justify-between space-y-5">
          <div>
            <h3 className="text-xl font-semibold text-white mb-1">
              Captured Salvage &amp; Cross-Faction Conversion Inventory
            </h3>
            <p className="text-sm text-slate-400">
              Foreign military hardware cannot be bolted raw onto an incompatible bus. Every captured
              subsystem progresses through four deterministic engineering states:
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
            <div className="bg-[#0B0E13] border border-slate-800 rounded-lg p-3">
              <div className="text-slate-400">01. Salvage</div>
              <div className="text-white font-semibold mt-1">Raw Crate Loot</div>
            </div>
            <div className="bg-[#0B0E13] border border-slate-800 rounded-lg p-3">
              <div className="text-slate-400">02. Diagnostic</div>
              <div className="text-white font-semibold mt-1">Pinout Mapped</div>
            </div>
            <div className="bg-[#0B0E13] border border-slate-800 rounded-lg p-3">
              <div className="text-slate-400">03. Fabrication</div>
              <div className="text-white font-semibold mt-1">Bus/Lug Adapter</div>
            </div>
            <div className="bg-[#0B0E13] border border-slate-800 rounded-lg p-3">
              <div className="text-slate-400">04. Retrofit</div>
              <div className="text-[#F59E0B] font-semibold mt-1">Live 3D Mount</div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 pt-2 border-t border-slate-800 font-mono tabular-nums">
            <div>
              <div className="text-xs text-slate-400">Scrap Structural Alloy</div>
              <div className="text-xl font-semibold text-white">{salvageInventory.rawScrapAlloy}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">
                {faction === FactionId.EAST ? 'West M19 ERA Cassettes' : 'East 4S24 Relikt Cassettes'}
              </div>
              <div className="text-xl font-semibold text-[#F59E0B]">
                {faction === FactionId.EAST
                  ? salvageInventory.westernCompositePlates
                  : salvageInventory.easternEraBlocks}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Encrypted Fire-Control Chips</div>
              <div className="text-xl font-semibold text-sky-400">
                {salvageInventory.encryptedFireControlChips}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Cross-Faction Tech Tree Grid */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-white">
          Interactive Cross-Faction Retrofit Matrix ({faction} Squad Equipping Captured{' '}
          {faction === FactionId.EAST ? 'WEST' : 'EAST'} Tech)
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {techNodes.map((node) => {
            const statusCheck = canAdvanceRetrofitStage(node, techNodes, salvageInventory);
            const isInstalled = node.stage === RetrofitStage.FIELD_RETROFITTED;

            return (
              <div
                key={node.id}
                className={`bg-[#11161F] border rounded-xl p-5 flex flex-col justify-between space-y-4 ${
                  isInstalled ? 'border-emerald-500/60' : 'border-slate-800'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                    <span>
                      {node.code} · {node.category.replace('_', ' ')} · Origin: {node.originFaction}
                    </span>
                    <span className={isInstalled ? 'text-emerald-400 font-semibold' : 'text-[#F59E0B]'}>
                      {node.stage.replace('_', ' ')}
                    </span>
                  </div>

                  <h3 className="text-xl font-semibold text-white">{node.name}</h3>
                  <p className="text-sm text-slate-300 leading-relaxed">{node.sourceDescription}</p>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    <strong className="text-slate-200">Field Adapter Engineering:</strong>{' '}
                    {node.adapterEngineeringNote}
                  </p>
                </div>

                <div className="space-y-3 pt-3 border-t border-slate-800/90">
                  <div className="text-xs font-mono text-slate-300 tabular-nums">
                    Cost: {node.costScrapAlloy} Alloy · {node.costArmorUnits} ERA Cassettes ·{' '}
                    {node.costControlChips} Chips · ΔMass +{node.statModifiers.chassisMassDeltaKg}kg
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs text-slate-400 font-mono tabular-nums">
                      {node.statModifiers.vehicleMaxArmorBonus > 0 &&
                        `+${node.statModifiers.vehicleMaxArmorBonus} Armor · `}
                      {node.statModifiers.shapedChargeMitigationBonus > 0 &&
                        `+${Math.round(node.statModifiers.shapedChargeMitigationBonus * 100)}% HEAT Mit · `}
                      {node.statModifiers.apsInterceptCharges > 0 &&
                        `+${node.statModifiers.apsInterceptCharges} APS Intercepts`}
                      {node.statModifiers.squadFirepowerMultiplier > 1 &&
                        `×${node.statModifiers.squadFirepowerMultiplier.toFixed(2)} Squad DPS`}
                    </div>

                    <button
                      type="button"
                      disabled={!statusCheck.allowed}
                      onClick={() => onAdvanceNode(node.id)}
                      className={`px-3.5 py-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                        isInstalled
                          ? 'bg-emerald-950/70 text-emerald-300 cursor-default'
                          : statusCheck.allowed
                            ? 'bg-[#F59E0B] text-slate-950 hover:bg-amber-400'
                            : 'bg-slate-800/70 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      {isInstalled ? (
                        <>
                          <Shield className="w-3.5 h-3.5" />
                          <span>Retrofitted on APC</span>
                        </>
                      ) : (
                        <>
                          <Wrench className="w-3.5 h-3.5" />
                          <span>
                            {node.stage === RetrofitStage.SALVAGE_CAPTURED
                              ? 'Reverse-Engineer'
                              : node.stage === RetrofitStage.REVERSE_ENGINEERED
                                ? 'Fabricate Adapter'
                                : node.stage === RetrofitStage.ADAPTER_FABRICATED
                                  ? 'Bolt onto APC'
                                  : 'Locked (Loot Convoy)'}
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Concrete Worked Example: Convoy Interception -> Reactive Armor Upgrade */}
      <section className="bg-[#11161F] border border-slate-800 rounded-xl p-6 space-y-4">
        <h2 className="text-2xl font-semibold text-white">
          2.2 Worked Mechanical Walkthrough: Supply Convoy Interception → Reactive Armor Retrofit
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm text-slate-300 leading-relaxed">
          <div className="bg-[#0B0E13] border border-slate-800 rounded-lg p-4 space-y-2">
            <div className="text-xs font-mono text-[#F59E0B]">Phase 1 · Ambush &amp; Disable</div>
            <p className="text-xs text-slate-300 leading-relaxed">
              An East player commanding <code className="text-white">BURAN-4</code> (baseline BTR-82A with
              10mm rolled homogeneous steel, <code className="text-white">350 Armor HP</code>,{' '}
              <code className="text-white">14% HEAT mitigation</code>) sets an L-shaped squad ambush on
              the North Valley Highway and disables a Western logistics truck.
            </p>
          </div>
          <div className="bg-[#0B0E13] border border-slate-800 rounded-lg p-4 space-y-2">
            <div className="text-xs font-mono text-[#F59E0B]">Phase 2 · Physical Crate Extraction</div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Approaching the burning wreck spawns a physical 3D Salvage Crate containing{' '}
              <code className="text-white">3× NATO M19 ARAT-2 Reactive Armor Cassettes</code>,{' '}
              <code className="text-white">2× MIL-STD-1553 Fire-Control Chips</code>, and{' '}
              <code className="text-white">55 kg Scrap Structural Alloy</code>.
            </p>
          </div>
          <div className="bg-[#0B0E13] border border-slate-800 rounded-lg p-4 space-y-2">
            <div className="text-xs font-mono text-[#F59E0B]">Phase 3 · Standoff Bracket Fabrication</div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Bolting energetic Western ERA directly onto thin 10mm BTR steel would buckle the hull upon
              detonation. The squad engineer expends <code className="text-white">40 Alloy</code> +{' '}
              <code className="text-white">2 Cassettes</code> to weld 14mm shock-absorbing standoff lugs.
            </p>
          </div>
          <div className="bg-[#0B0E13] border border-slate-800 rounded-lg p-4 space-y-2">
            <div className="text-xs font-mono text-emerald-400">Phase 4 · Tangible Field Payoff</div>
            <p className="text-xs text-slate-300 leading-relaxed">
              21 tan M19 ERA bricks appear visibly across <code className="text-white">BURAN-4</code>&apos;s
              glacis and flanks. Vehicle armor jumps from <code className="text-white">350 → 770 HP</code>,
              HEAT/RPG mitigation surges from <code className="text-white">14% → 66%</code>, and curb mass
              rises by <code className="text-white">+1,180 kg</code>.
            </p>
          </div>
        </div>
      </section>

      {/* Schema Code */}
      <section className="bg-[#11161F] border border-slate-800 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-[#0D1219]">
          <span className="text-xs font-mono text-slate-300">
            Production Data Schema · Cross-Faction Salvage &amp; Adapter Conversion Pipeline
          </span>
          <button
            type="button"
            onClick={copySchema}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 text-xs text-slate-200 hover:bg-slate-700 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy Schema'}</span>
          </button>
        </div>
        <pre className="p-5 text-xs font-mono text-slate-300 overflow-x-auto leading-relaxed">
          <code>{schemaCode}</code>
        </pre>
      </section>
    </div>
  );
};

// ============================================================================
// SECTION 3: PLAYER LOADOUT & STANDARDIZED HP HEALTH FSM VIEW
// ============================================================================

export const LoadoutHealthArchitectureView: React.FC<{
  faction: FactionId;
  playerState: PlayerCombatState;
}> = ({ faction, playerState }) => {
  const gun = FACTION_PRIMARY_FIREARMS[faction];
  const sword = FACTION_EMERGENCY_SWORDS[faction];

  const [simIncomingDmg, setSimIncomingDmg] = useState<number>(36);
  const [simPlatePct, setSimPlatePct] = useState<number>(100);
  const [simApFactor, setSimApFactor] = useState<number>(0.35);

  const effectiveMit = simPlatePct > 5 ? (1 - simApFactor) * 0.55 : 0;
  const absorbedPlate = simIncomingDmg * effectiveMit;
  const netHpLoss = Math.max(1, Math.round(simIncomingDmg - absorbedPlate));

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-12">
      <div className="space-y-3 border-b border-slate-800 pb-8">
        <div className="text-xs text-slate-400 font-mono">
          Section 03 · Hierarchical Combat State Machine · Zero Survival Bloat (No Hunger/Thirst/Stamina)
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-white">
          03. The Player Loadout &amp; Standardized HP Component
        </h1>
        <p className="text-slate-300 max-w-3xl leading-relaxed text-[15px]">
          Survival relies purely on tactical positioning, ballistic plate integrity, medical kit
          timing, and seamless transition between a high-tier primary rifle and an unbreakable,
          high-durability close-quarters sword when ammunition runs dry.
        </p>
      </div>

      {/* Initial Loadout Spec Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#11161F] border border-slate-800 rounded-xl p-6 space-y-3">
          <div className="text-xs font-mono text-[#F59E0B]">Slot 01 · High-Tier Primary Firearm</div>
          <h2 className="text-xl font-semibold text-white">{gun.designation}</h2>
          <p className="text-xs text-slate-400 font-mono">{gun.caliber}</p>
          <div className="space-y-1.5 pt-2 border-t border-slate-800 text-xs font-mono tabular-nums">
            <div className="flex justify-between">
              <span className="text-slate-400">Initial Loadout Reserves:</span>
              <span className="text-white">
                {gun.magazineCapacity} + {gun.initialReserveAmmo} rds (9 Mags)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Cyclic Rate / Muzzle Vel:</span>
              <span className="text-white">
                {gun.roundsPerMinute} RPM · {gun.muzzleVelocityMps} m/s
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Tactical vs Dry Reload:</span>
              <span className="text-white">
                {gun.tacticalReloadSec}s / {gun.dryReloadSec}s
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Live Arena State:</span>
              <span className="text-[#F59E0B]">{playerState.firearmState}</span>
            </div>
          </div>
        </div>

        <div className="bg-[#11161F] border border-slate-800 rounded-xl p-6 space-y-3">
          <div className="text-xs font-mono text-sky-400">Slot 02 · Zero-Ammo Emergency Sword</div>
          <h2 className="text-xl font-semibold text-white">{sword.designation}</h2>
          <p className="text-xs text-slate-400 font-mono">{sword.steelGrade}</p>
          <div className="space-y-1.5 pt-2 border-t border-slate-800 text-xs font-mono tabular-nums">
            <div className="flex justify-between">
              <span className="text-slate-400">Structural Durability:</span>
              <span className="text-white">
                {playerState.swordDurability}/{sword.maxDurability} (−{sword.durabilityLossPerHit}/hit, Never Breaks)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">3-Combo Damage Profile:</span>
              <span className="text-white">
                {sword.slash1Damage} / {sword.slash2Damage} / {sword.thrust3Damage} HP
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Frame Windows (Start/Act/Rec):</span>
              <span className="text-white">
                {Math.round(sword.startupWindowSec * 1000)}ms / {Math.round(sword.activeCollisionWindowSec * 1000)}ms /{' '}
                {Math.round(sword.recoveryWindowSec * 1000)}ms
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Zero-Ammo Reflex Draw:</span>
              <span className="text-emerald-400">{Math.round(sword.emergencyAutoDrawSec * 1000)}ms Auto-Unsheathe</span>
            </div>
          </div>
        </div>

        <div className="bg-[#11161F] border border-slate-800 rounded-xl p-6 space-y-3">
          <div className="text-xs font-mono text-emerald-400">Slot 03 · Standardized HP &amp; Trauma Gear</div>
          <h2 className="text-xl font-semibold text-white">{STANDARD_MEDICAL_GEAR.designation}</h2>
          <p className="text-xs text-slate-400 font-mono">Pure Tactical HP Pool · Zero Hunger/Thirst/Stamina</p>
          <div className="space-y-1.5 pt-2 border-t border-slate-800 text-xs font-mono tabular-nums">
            <div className="flex justify-between">
              <span className="text-slate-400">Standardized Health Pool:</span>
              <span className="text-white">100 HP + 100 Ballistic Plate</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Initial IFAK Charges:</span>
              <span className="text-white">
                {STANDARD_MEDICAL_GEAR.initialCharges} Kits (Max {STANDARD_MEDICAL_GEAR.maxCharges})
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Restore Yield:</span>
              <span className="text-white">
                +{STANDARD_MEDICAL_GEAR.instantHealHp} Instant + {STANDARD_MEDICAL_GEAR.regenOverTimeHp} HoT (5s)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Injector Cast Time:</span>
              <span className="text-white">{STANDARD_MEDICAL_GEAR.applicationTimeSec}s (65% Move Speed)</span>
            </div>
          </div>
        </div>
      </div>

      {/* State Machine Transition Matrix & Damage Scaling Calculator */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-[#11161F] border border-slate-800 rounded-xl p-6 space-y-4">
          <h3 className="text-xl font-semibold text-white">
            3.1 Deterministic State Machine Transition Rules
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono tabular-nums">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2 pr-3">Current State</th>
                  <th className="py-2 pr-3">Trigger / Guard Condition</th>
                  <th className="py-2 pr-3">Next State</th>
                  <th className="py-2">Timing / Side-Effect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-slate-300">
                <tr>
                  <td className="py-2.5 pr-3 text-white">FIREARM.IDLE</td>
                  <td className="py-2.5 pr-3">LMB &amp; mag &gt; 0</td>
                  <td className="py-2.5 pr-3 text-[#F59E0B]">FIREARM.FIRING</td>
                  <td className="py-2.5">mag -= 1, spawn convergent tracer</td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-3 text-white">FIREARM.IDLE</td>
                  <td className="py-2.5 pr-3">KeyR &amp; 0 &lt; mag &lt; cap</td>
                  <td className="py-2.5 pr-3 text-sky-400">RELOAD_TACTICAL</td>
                  <td className="py-2.5">1.85s (retains chambered round)</td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-3 text-white">FIREARM.DRY_EMPTY</td>
                  <td className="py-2.5 pr-3">LMB/KeyR &amp; reserve &gt; 0</td>
                  <td className="py-2.5 pr-3 text-sky-400">RELOAD_DRY</td>
                  <td className="py-2.5">2.45s (includes bolt-release rack)</td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-3 text-white">FIREARM.FIRING</td>
                  <td className="py-2.5 pr-3">mag == 0 &amp; reserve == 0</td>
                  <td className="py-2.5 pr-3 text-emerald-400">SWORD.EMERGENCY_DRAW</td>
                  <td className="py-2.5">0.22s automatic reflex unsheathe</td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-3 text-white">SWORD.READY</td>
                  <td className="py-2.5 pr-3">LMB pressed</td>
                  <td className="py-2.5 pr-3 text-[#F59E0B]">SLASH_1 (Start→Act→Rec)</td>
                  <td className="py-2.5">105° horizontal arc hurtbox (3.1m)</td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-3 text-white">SLASH_1_ACTIVE</td>
                  <td className="py-2.5 pr-3">LMB buffered in grace window</td>
                  <td className="py-2.5 pr-3 text-[#F59E0B]">SLASH_2 → THRUST_3</td>
                  <td className="py-2.5">Chains into 92-dmg armor-piercing lunge</td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-3 text-white">HP.DAMAGED</td>
                  <td className="py-2.5 pr-3">Key4 &amp; medkits &gt; 0</td>
                  <td className="py-2.5 pr-3 text-emerald-400">APPLYING_MEDKIT</td>
                  <td className="py-2.5">1.6s cast → +45 HP + 25 HP HoT</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Interactive Ballistic Plate & HP Damage Scaling Bench */}
        <div className="lg:col-span-5 bg-[#11161F] border border-slate-800 rounded-xl p-6 flex flex-col justify-between space-y-4">
          <div>
            <h3 className="text-xl font-semibold text-white">
              3.2 Interactive HP &amp; Armor Scaling Solver
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Verify exact HP reduction as ceramic plate integrity degrades against AP rounds.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300">Incoming Projectile Raw Damage</span>
                <span className="font-mono text-white tabular-nums">{simIncomingDmg}</span>
              </div>
              <input
                type="range"
                min={10}
                max={90}
                value={simIncomingDmg}
                onChange={(e) => setSimIncomingDmg(Number(e.target.value))}
                className="w-full accent-[#EF4444]"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300">Current Ballistic Plate Integrity</span>
                <span className="font-mono text-white tabular-nums">{simPlatePct}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={simPlatePct}
                onChange={(e) => setSimPlatePct(Number(e.target.value))}
                className="w-full accent-sky-400"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300">Enemy Ammo Armor-Piercing Factor</span>
                <span className="font-mono text-white tabular-nums">{simApFactor.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0.1}
                max={0.9}
                step={0.05}
                value={simApFactor}
                onChange={(e) => setSimApFactor(Number(e.target.value))}
                className="w-full accent-[#F59E0B]"
              />
            </div>
          </div>

          <div className="bg-[#0B0E13] border border-slate-800 rounded-lg p-4 space-y-1.5 text-xs font-mono tabular-nums">
            <div className="flex justify-between">
              <span className="text-slate-400">Plate Mitigation Applied:</span>
              <span className="text-sky-400">{Math.round(effectiveMit * 100)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Absorbed by Ceramic Insert:</span>
              <span className="text-slate-200">{absorbedPlate.toFixed(1)} dmg</span>
            </div>
            <div className="flex justify-between pt-1 border-t border-slate-800">
              <span className="text-slate-300 font-semibold">Net Operator HP Deducted:</span>
              <span className="text-[#EF4444] font-semibold">−{netHpLoss} HP</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// SECTION 4: MEDIUM MULTI-BIOME MAP & 50-OF-500 OBJECTIVE ENGINE VIEW
// ============================================================================

interface TheaterMapViewProps {
  runSeed: number;
  masterPool500: TheaterObjective[];
  activeRun50: TheaterObjective[];
  pinnedObjectiveUid: string | null;
  playerCoords: { x: number; z: number; yaw: number };
  vehicleCoords: { x: number; z: number };
  convoyCoords: { x: number; z: number; intact: boolean };
  onPinObjective: (uid: string | null) => void;
  onRerollRunSeed: () => void;
  onCompleteObjective: (uid: string) => void;
}

export const TheaterMapArchitectureView: React.FC<TheaterMapViewProps> = ({
  runSeed,
  masterPool500,
  activeRun50,
  pinnedObjectiveUid,
  playerCoords,
  vehicleCoords,
  convoyCoords,
  onPinObjective,
  onRerollRunSeed,
  onCompleteObjective,
}) => {
  const [viewMode, setViewMode] = useState<'ACTIVE_50' | 'POOL_500'>('ACTIVE_50');
  const [selectedBiome, setSelectedBiome] = useState<string>('ALL');
  const [selectedObjUid, setSelectedObjUid] = useState<string | null>(activeRun50[0]?.uid ?? null);

  const displayedObjectives = useMemo(() => {
    const base = viewMode === 'ACTIVE_50' ? activeRun50 : masterPool500;
    if (selectedBiome === 'ALL') return base;
    return base.filter((o) => o.biome === selectedBiome);
  }, [viewMode, activeRun50, masterPool500, selectedBiome]);

  const selectedObj = useMemo(() => {
    if (selectedObjUid) {
      const fromActive = activeRun50.find((o) => o.uid === selectedObjUid);
      if (fromActive) return fromActive;
      const fromMaster = masterPool500.find((o) => o.uid === selectedObjUid);
      if (fromMaster) return fromMaster;
    }
    return displayedObjectives[0] ?? activeRun50[0] ?? null;
  }, [selectedObjUid, activeRun50, masterPool500, displayedObjectives]);

  const biomeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const o of activeRun50) {
      counts[o.biome] = (counts[o.biome] || 0) + 1;
    }
    return counts;
  }, [activeRun50]);

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-6 border-b border-slate-800 pb-8">
        <div className="space-y-3">
          <div className="text-xs text-slate-400 font-mono">
            Section 04 · 3.2km × 3.2km Tactical Regional Sector · Seed #{runSeed} · Press [M] Anytime
            for Interactive Command Map
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-white">
            04. Multi-Biome Theater &amp; 50-of-500 Objective Engine
          </h1>
          <p className="text-slate-300 max-w-3xl leading-relaxed text-[15px]">
            Balanced medium-scale operational sector engineered for 1–2 hour persistent runs: compact
            enough for relentless tactical contact via 8x8 APC or foot, yet topographically rich with
            Northern/Southern Alpine Cordilleras, Forested Ridges, a Central Floodplain Valley, a
            Meandering River with {BRIDGE_X_COORDS.length} Reinforced Bridges, Named Tactical Complexes
            (SAM Battery, Logistics Depot, Korsakovo Village, Highway Checkpoints), and an East–West
            Convoy Highway. Each run samples{' '}
            <strong className="text-white">50 spatially de-conflicted objectives</strong> from a{' '}
            <strong className="text-white">500-objective master procedural catalog</strong>.
          </p>
        </div>

        <button
          type="button"
          onClick={onRerollRunSeed}
          className="px-4 py-2.5 rounded-lg bg-[#F59E0B] text-slate-950 text-xs font-semibold hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Roll New 50-Objective Run Seed</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-[#11161F] border border-slate-800 rounded-lg">
          <button
            type="button"
            onClick={() => setViewMode('ACTIVE_50')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              viewMode === 'ACTIVE_50'
                ? 'bg-[#F59E0B] text-slate-950 font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Active Regional Run (50 Objectives)
          </button>
          <button
            type="button"
            onClick={() => setViewMode('POOL_500')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              viewMode === 'POOL_500'
                ? 'bg-[#F59E0B] text-slate-950 font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Master Procedural Pool (All 500 Candidate Nodes)
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-[#11161F] border border-slate-800 rounded-lg">
          {(['ALL', ...Object.values(TerrainBiome)] as string[]).map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setSelectedBiome(b)}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors whitespace-nowrap shrink-0 ${
                selectedBiome === b
                  ? 'bg-slate-700 text-white font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {b === 'ALL' ? 'All Terrains' : b.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Interactive 2D Hillshaded Topographical Command Map + Objective Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-7 bg-[#11161F] border border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400 tabular-nums">
            <span>Hillshaded Topographical Relief &amp; Contours (Grid A1–E5 · 3.2 km × 3.2 km)</span>
            <span>Showing {displayedObjectives.length} Objectives (Click any pin)</span>
          </div>

          <div className="aspect-square w-full max-h-[520px] mx-auto bg-[#0B0E13] border border-slate-800 rounded-lg overflow-hidden">
            <TopographicalMapView
              objectives={displayedObjectives}
              selectedObjectiveUid={selectedObj?.uid ?? null}
              pinnedObjectiveUid={pinnedObjectiveUid}
              playerCoords={playerCoords}
              vehicleCoords={vehicleCoords}
              convoyCoords={convoyCoords}
              densePoolMode={viewMode === 'POOL_500'}
              onSelectObjective={(obj) => setSelectedObjUid(obj.uid)}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 font-mono">
            <span>4m/12m Contour Lines · {THEATER_LANDMARKS.length} Named Sector Complexes</span>
            <span>·</span>
            <span>3 River Bridges ({BRIDGE_X_COORDS.join('m, ')}m) · Live Convoy &amp; Operator Telemetry</span>
          </div>
        </div>

        {/* Right Column: Selected Objective Details + Scrollable Active 50 Manifest */}
        <div className="lg:col-span-5 flex flex-col justify-between space-y-5">
          {selectedObj && (
            <div className="bg-[#11161F] border border-slate-800 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between text-xs font-mono text-slate-400 tabular-nums">
                <span>
                  {selectedObj.uid} · Pool #{selectedObj.poolIndex}/500
                  {selectedObj.runOrderIndex > 0 ? ` · Run #${selectedObj.runOrderIndex}/50` : ''}
                </span>
                <span>Tier {selectedObj.threatTier}</span>
              </div>
              <h3 className="text-xl font-semibold text-white">{selectedObj.title}</h3>
              <div className="text-xs text-slate-300 font-mono tabular-nums">
                Biome: {selectedObj.biome.replace('_', ' ')} · Coords ({selectedObj.worldX}m,{' '}
                {selectedObj.worldY}m elev, {selectedObj.worldZ}m)
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                <strong className="text-slate-200">Tactical Salvage Yield:</strong>{' '}
                {selectedObj.unlocksTechHint} (+{selectedObj.rewardScrap} Alloy, +
                {selectedObj.rewardArmorUnits} ERA Cassettes, +{selectedObj.rewardChips} Chips)
              </p>

              {selectedObj.runOrderIndex > 0 && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      onPinObjective(pinnedObjectiveUid === selectedObj.uid ? null : selectedObj.uid)
                    }
                    className={`py-2 px-2.5 rounded-md text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                      pinnedObjectiveUid === selectedObj.uid
                        ? 'bg-sky-500 text-slate-950'
                        : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                    }`}
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    <span>
                      {pinnedObjectiveUid === selectedObj.uid ? 'Pinned in 3D HUD' : 'Pin 3D Waypoint'}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={selectedObj.status === ObjectiveStatus.COMPLETED}
                    onClick={() => onCompleteObjective(selectedObj.uid)}
                    className={`py-2 px-2.5 rounded-md text-xs font-semibold transition-colors ${
                      selectedObj.status === ObjectiveStatus.COMPLETED
                        ? 'bg-emerald-950/70 text-emerald-300 cursor-default'
                        : 'bg-emerald-600 text-white hover:bg-emerald-500'
                    }`}
                  >
                    {selectedObj.status === ObjectiveStatus.COMPLETED
                      ? 'Completed'
                      : 'Complete & Salvage'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Active Run Biome Distribution + Manifest */}
          <div className="bg-[#11161F] border border-slate-800 rounded-xl p-5 flex-1 flex flex-col space-y-3 max-h-[340px]">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">
                Active Run 50-Objective Manifest
              </h3>
              <span className="text-xs font-mono text-slate-400 tabular-nums">
                Mountain {biomeCounts[TerrainBiome.ALPINE_PEAK] ?? 0} · Valley{' '}
                {biomeCounts[TerrainBiome.CENTRAL_VALLEY] ?? 0} · River{' '}
                {biomeCounts[TerrainBiome.RIVER_CHANNEL] ?? 0}
              </span>
            </div>

            <div className="overflow-y-auto space-y-1.5 pr-1 text-xs font-mono tabular-nums">
              {activeRun50.map((obj) => (
                <button
                  key={obj.uid}
                  type="button"
                  onClick={() => setSelectedObjUid(obj.uid)}
                  className={`w-full text-left px-3 py-2 rounded-md flex items-center justify-between gap-2 transition-colors ${
                    selectedObj?.uid === obj.uid
                      ? 'bg-slate-800 text-white'
                      : 'bg-[#0B0E13] text-slate-300 hover:bg-slate-800/60'
                  }`}
                >
                  <span className="truncate">
                    {String(obj.runOrderIndex).padStart(2, '0')}. {obj.title}
                  </span>
                  <span
                    className={`shrink-0 ${
                      obj.status === ObjectiveStatus.COMPLETED
                        ? 'text-emerald-400'
                        : 'text-slate-500'
                    }`}
                  >
                    {obj.status === ObjectiveStatus.COMPLETED ? 'DONE' : obj.biome.split('_')[0]}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
