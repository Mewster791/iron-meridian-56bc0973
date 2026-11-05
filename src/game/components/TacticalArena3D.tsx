import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  CameraRigTelemetry,
  FactionId,
  FirearmState,
  HealthStatus,
  PerspectiveMode,
  PlayerCombatState,
  RetrofitStage,
  RetrofitTechNode,
  SalvageInventory,
  ShoulderSide,
  SquadOrder,
  SwordState,
  TacticalUnitVehicleState,
  WeaponSlot,
} from '../types/systems';
import {
  DEFAULT_CAMERA_RIG_CONFIG,
  SeamlessCameraPovController,
} from '../systems/cameraPovSystem';
import {
  applyIncomingPlayerDamage,
  computeSwordSwingDamage,
  FACTION_EMERGENCY_SWORDS,
  FACTION_PRIMARY_FIREARMS,
  STANDARD_MEDICAL_GEAR,
  stepPlayerCombatStateMachine,
} from '../systems/loadoutHealthSystem';
import {
  AVENUE_Z,
  Building,
  BLOCKS_PER_SIDE,
  blockCenter,
  findBuildingAt,
  floorY,
  getBuildingEntrance,
  getCityLayout,
  getFloorAt,
  getFloorPosts,
  isBlockedByStairs,
  PLAYABLE_HALF_EXTENT,
  Rect,
  sampleCitySupport,
} from '../city/cityLayout';
import { buildCityScene } from '../city/cityBuilder';
import { MISSIONS, MissionStep } from '../campaign/campaignData';
import {
  CampaignProgress,
  canDetonate,
  canResupplyAtApc,
  canStartHoldAction,
  ENEMY_DAMAGE_BY_ACT,
  ENEMY_HP_BY_ACT,
  getActionSpot,
  getCurrentMission,
  getCurrentStep,
  getStepBuilding,
  getStepWaypoint,
  isFloorCleared,
  LootReward,
  rollLootReward,
  stepDefendTimer,
  stepHoldProgress,
  APC_RESUPPLY_COOLDOWN_SEC,
} from '../campaign/campaignRules';
import {
  resolveDynamicBoxCollision,
  StaticWorldPhysics,
} from '../systems/staticCollisionSystem';
import {
  buildConvoySupplyTruck,
  buildFirstPersonViewmodel,
  buildOperatorModel,
  buildSalvageTechCrate,
  buildSquadCommandVehicle,
  CommandVehicleRefs,
  FirstPersonViewmodelRefs,
  OperatorRigRefs,
} from '../three/proceduralModels';
import {
  ATMOSPHERE_CONFIGS,
  AtmospherePreset,
  createProceduralMaterialLibrary,
  createProceduralSkyDome,
} from '../three/proceduralTextures';
import { canAdvanceRetrofitStage } from '../systems/scavengeRetrofitSystem';
import { CityMapView } from './CityMapView';
import { audioEngine } from '../systems/audioEngine';
import {
  Building2,
  ChevronDown,
  ChevronUp,
  HeartPulse,
  Map as MapIcon,
  Shield,
  Sword,
  Target,
  Volume2,
  VolumeX,
  Wrench,
} from 'lucide-react';

/** The city streets are flat; floors and stairs come from sampleCitySupport. */
const sampleWalkableHeight = (_x: number, _z: number): number => 0;
const CONVOY_LANE_Z = AVENUE_Z + 2.6;
const getHighwayCenterZ = (_x: number): number => CONVOY_LANE_Z;
const THEATER_HALF_EXTENT = PLAYABLE_HALF_EXTENT + 10;

export interface MissionHudState {
  missionLabel: string;
  stepText: string;
  detail: string;
  progress: number | null;
  locationLabel: string;
}

interface TacticalArena3DProps {
  isRoundActive: boolean;
  isMenuOpen: boolean;
  onToggleMenu: () => void;
  faction: FactionId;
  atmosphere: AtmospherePreset;
  playerState: PlayerCombatState;
  setPlayerState: React.Dispatch<React.SetStateAction<PlayerCombatState>>;
  vehicleState: TacticalUnitVehicleState;
  setVehicleState: React.Dispatch<React.SetStateAction<TacticalUnitVehicleState>>;
  techNodes: RetrofitTechNode[];
  salvageInventory: SalvageInventory;
  campaign: CampaignProgress;
  squadTargetCoords: { x: number; z: number } | null;
  deployRequest: { x: number; z: number; y: number; nonce: number } | null;
  onSyncLiveCoords: (
    player: { x: number; z: number; y: number; yaw: number },
    vehicle: { x: number; z: number },
    convoy: { x: number; z: number; intact: boolean }
  ) => void;
  onLootConvoyCrate: () => void;
  onQuickRetrofitNextNode: (resupplied: boolean) => void;
  onStepComplete: () => void;
  onFloorCleared: (floor: number) => void;
  onLoot: (lootId: string, reward: LootReward) => void;
  onBuildingDestroyed: (buildingId: string) => void;
  onPlayerDown: () => void;
  onToast: (msg: string) => void;
}

type EnemyKind = 'STREET' | 'FLOOR' | 'GUARD' | 'HVT' | 'WAVE';

interface EnemyActor {
  kind: EnemyKind;
  floorY: number;
  bounds: Rect | null;
  floor: number;
  damage: number;
  chase: boolean;
  id: string;
  rig: OperatorRigRefs;
  hp: number;
  maxHp: number;
  fireTimer: number;
  patrolOrigin: THREE.Vector3;
  patrolPhase: number;
  alive: boolean;
  respawnTimer: number;
  losTimer: number;
  hasLos: boolean;
}

interface TracerBolt {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  isFriendly: boolean;
  damage: number;
}

interface ImpactBurst {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  scaleRate: number;
}

interface DroppedCrate {
  id: string;
  mesh: THREE.Group;
  collected: boolean;
}

// Module-scope reusable scratchpad vectors (Zero GC allocations per frame)
const _playerPos = new THREE.Vector3(0, 2, -10);
const _moveInput = new THREE.Vector3();
const _forwardFlat = new THREE.Vector3();
const _rightFlat = new THREE.Vector3();
const _muzzleWorld = new THREE.Vector3();
const _enemyDelta = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();
const _bulletRay = new THREE.Raycaster();
const _velDir = new THREE.Vector3();
const _tmpVecA = new THREE.Vector3();
const _tmpVecB = new THREE.Vector3();
const _tmpVecC = new THREE.Vector3();
const _tmpVecD = new THREE.Vector3();
const _projPin = new THREE.Vector3();
const _sightLinePts = [new THREE.Vector3(), new THREE.Vector3()];
const _muzzleLinePts = [new THREE.Vector3(), new THREE.Vector3()];

export const TacticalArena3D: React.FC<TacticalArena3DProps> = ({
  isRoundActive,
  isMenuOpen,
  onToggleMenu,
  faction,
  atmosphere,
  playerState,
  setPlayerState,
  vehicleState,
  setVehicleState,
  techNodes,
  salvageInventory,
  campaign,
  squadTargetCoords,
  deployRequest,
  onSyncLiveCoords,
  onLootConvoyCrate,
  onQuickRetrofitNextNode,
  onStepComplete,
  onFloorCleared,
  onLoot,
  onBuildingDestroyed,
  onPlayerDown,
  onToast,
}) => {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);

  const combatRef = useRef<PlayerCombatState>(playerState);
  const vehicleRef = useRef<TacticalUnitVehicleState>(vehicleState);
  const factionRef = useRef<FactionId>(faction);
  const atmosphereRef = useRef<AtmospherePreset>(atmosphere);
  const campaignRef = useRef<CampaignProgress>(campaign);
  const squadTargetRef = useRef<{ x: number; z: number } | null>(squadTargetCoords);
  const deployReqRef = useRef<{ x: number; z: number; y: number; nonce: number } | null>(deployRequest);
  const simPausedRef = useRef<boolean>(!isRoundActive || isMenuOpen);

  const callbacksRef = useRef({
    onLootConvoyCrate,
    onQuickRetrofitNextNode,
    onSyncLiveCoords,
    onStepComplete,
    onFloorCleared,
    onLoot,
    onBuildingDestroyed,
    onPlayerDown,
    onToast,
  });

  useEffect(() => {
    combatRef.current = { ...playerState };
  }, [playerState]);

  useEffect(() => {
    vehicleRef.current = { ...vehicleState };
  }, [vehicleState]);

  useEffect(() => {
    factionRef.current = faction;
  }, [faction]);

  useEffect(() => {
    atmosphereRef.current = atmosphere;
  }, [atmosphere]);

  useEffect(() => {
    campaignRef.current = campaign;
  }, [campaign]);

  useEffect(() => {
    squadTargetRef.current = squadTargetCoords;
  }, [squadTargetCoords]);

  useEffect(() => {
    deployReqRef.current = deployRequest;
  }, [deployRequest]);

  useEffect(() => {
    simPausedRef.current = !isRoundActive || isMenuOpen;
    if ((!isRoundActive || isMenuOpen) && document.pointerLockElement) {
      document.exitPointerLock?.();
    }
  }, [isRoundActive, isMenuOpen]);

  useEffect(() => {
    callbacksRef.current.onLootConvoyCrate = onLootConvoyCrate;
    callbacksRef.current.onQuickRetrofitNextNode = onQuickRetrofitNextNode;
    callbacksRef.current.onSyncLiveCoords = onSyncLiveCoords;
    callbacksRef.current.onStepComplete = onStepComplete;
    callbacksRef.current.onFloorCleared = onFloorCleared;
    callbacksRef.current.onLoot = onLoot;
    callbacksRef.current.onBuildingDestroyed = onBuildingDestroyed;
    callbacksRef.current.onPlayerDown = onPlayerDown;
    callbacksRef.current.onToast = onToast;
  }, [onLootConvoyCrate, onQuickRetrofitNextNode, onSyncLiveCoords, onStepComplete, onFloorCleared, onLoot, onBuildingDestroyed, onPlayerDown, onToast]);

  const camControllerRef = useRef<SeamlessCameraPovController>(
    new SeamlessCameraPovController(DEFAULT_CAMERA_RIG_CONFIG)
  );
  const showBallisticRaysRef = useRef<boolean>(false);

  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [muted, setMuted] = useState(false);
  const [nearbyPrompt, setNearbyPrompt] = useState<string | null>(null);
  const [convoyStatusText, setConvoyStatusText] = useState<string>(
    'Consortium convoy patrolling Grand Avenue'
  );
  const [missionHud, setMissionHud] = useState<MissionHudState>({
    missionLabel: '',
    stepText: '',
    detail: '',
    progress: null,
    locationLabel: 'Streets of Varos-Meridian',
  });
  const [mapWaypoint, setMapWaypoint] = useState<{ x: number; z: number } | null>(null);
  const [pinnedHudProj, setPinnedHudProj] = useState<{
    visible: boolean;
    xPct: number;
    yPct: number;
    distMeters: number;
    title: string;
  }>({ visible: false, xPct: 50, yPct: 30, distMeters: 0, title: '' });

  const [camTelemetry, setCamTelemetry] = useState<CameraRigTelemetry>({
    targetMode: PerspectiveMode.THIRD_PERSON,
    blendAlpha: 1,
    shoulderSide: ShoulderSide.RIGHT,
    isAimingDownSights: false,
    desiredArmLength: 3.35,
    occludedArmLength: 3.35,
    collisionActive: false,
    collisionNormal: { x: 0, y: 1, z: 0 },
    focalPointWorld: { x: 0, y: 2, z: -40 },
    focalDistance: 40,
    muzzleOriginWorld: { x: 0, y: 1.5, z: -8 },
    convergentMuzzleDir: { x: 0, y: 0, z: -1 },
    parallaxAngleDeg: 1.2,
    muzzleBlockedByCover: false,
    blockedImpactScreenNdc: { x: 0, y: 0 },
  });

  const [minimapState, setMinimapState] = useState<{
    player: { x: number; z: number; y: number; yaw: number };
    vehicle: { x: number; z: number };
    convoy: { x: number; z: number; intact: boolean };
  }>({
    player: { x: 0, z: 0, y: 0, yaw: 0 },
    vehicle: { x: 0, z: 0 },
    convoy: { x: -55, z: CONVOY_LANE_Z, intact: true },
  });

  const handleCycleSquadOrder = () => {
    const orderCycle: SquadOrder[] = [
      SquadOrder.FOLLOW_WEDGE,
      SquadOrder.HOLD_OVERWATCH,
      SquadOrder.ASSAULT_CONVOY,
      SquadOrder.SUPPRESS_SECTOR,
    ];
    const idx = orderCycle.indexOf(vehicleRef.current.currentOrder);
    const nextOrder = orderCycle[(idx + 1) % orderCycle.length];
    const updated = { ...vehicleRef.current, currentOrder: nextOrder };
    vehicleRef.current = updated;
    setVehicleState(updated);
  };

  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    // 1. Software-WebGL Detection & High-Fidelity Renderer Initialization
    const isSoftwareGl = (() => {
      const probeCanvas = document.createElement('canvas');
      const gl = probeCanvas.getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(
      container.clientWidth || window.innerWidth,
      container.clientHeight || window.innerHeight
    );
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const handleContextLost = (e: Event) => e.preventDefault();
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);

    const scene = new THREE.Scene();
    const fog = new THREE.FogExp2('#95adc2', 0.0036);
    scene.fog = fog;

    // Studio Reflection Environment + Procedural Sky Dome
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    const skyDome = createProceduralSkyDome();
    scene.add(skyDome.mesh);

    const matLib = createProceduralMaterialLibrary(
      renderer.capabilities.getMaxAnisotropy()
    );

    const camera = new THREE.PerspectiveCamera(
      DEFAULT_CAMERA_RIG_CONFIG.fovThirdPerson,
      (container.clientWidth || window.innerWidth) /
        (container.clientHeight || window.innerHeight),
      0.08,
      500
    );
    scene.add(camera);

    // 2. Dynamic Atmospheric Lighting Rig + Muzzle Flash PointLight
    const hemiLight = new THREE.HemisphereLight('#b9d6f2', '#3a4635', 0.88);
    hemiLight.position.set(0, 90, 0);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight('#fff3db', 2.35);
    sunLight.position.set(75, 105, 48);
    sunLight.castShadow = !isSoftwareGl;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    const shadowBound = 95;
    sunLight.shadow.camera.left = -shadowBound;
    sunLight.shadow.camera.right = shadowBound;
    sunLight.shadow.camera.top = shadowBound;
    sunLight.shadow.camera.bottom = -shadowBound;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 250;
    sunLight.shadow.bias = -0.0004;
    sunLight.shadow.normalBias = 0.025;
    scene.add(sunLight);
    scene.add(sunLight.target);

    const rimLight = new THREE.DirectionalLight('#93c5fd', 0.52);
    rimLight.position.set(-75, 50, -65);
    scene.add(rimLight);

    const muzzlePointLight = new THREE.PointLight('#fbbf24', 0, 14, 2);
    scene.add(muzzlePointLight);

    let appliedAtmosphere: AtmospherePreset | null = null;
    const syncAtmospherePreset = (preset: AtmospherePreset) => {
      if (appliedAtmosphere === preset) return;
      appliedAtmosphere = preset;
      const cfg = ATMOSPHERE_CONFIGS[preset];
      skyDome.uniforms.uZenithColor.value.set(cfg.skyZenith);
      skyDome.uniforms.uHorizonColor.value.set(cfg.skyHorizon);
      skyDome.uniforms.uSunColor.value.set(cfg.sunColor);
      skyDome.uniforms.uSunDir.value
        .set(cfg.sunPosition[0], cfg.sunPosition[1], cfg.sunPosition[2])
        .normalize();

      sunLight.color.set(cfg.sunColor);
      sunLight.intensity = cfg.sunIntensity;
      hemiLight.color.set(cfg.hemiSky);
      hemiLight.groundColor.set(cfg.hemiGround);
      hemiLight.intensity = cfg.hemiIntensity;
      fog.color.set(cfg.fogColor);
      fog.density = cfg.fogDensity;
      renderer.toneMappingExposure = cfg.exposure;
    };
    syncAtmospherePreset(atmosphereRef.current);

    // 3. The free city of Varos-Meridian: streets, enterable buildings, floors, stairs and loot
    const cityLayout = getCityLayout();
    const staticPhysics = new StaticWorldPhysics();
    const collidableEnvironment: THREE.Object3D[] = [];
    const appliedLooted = new Set<string>(campaignRef.current.lootedIds);
    const appliedDestroyed = new Set<string>(campaignRef.current.destroyedBuildingIds);
    const city = buildCityScene(cityLayout, staticPhysics, {
      castShadows: !isSoftwareGl,
      concreteBump: matLib.concreteBump,
      lootedIds: appliedLooted,
      destroyedIds: appliedDestroyed,
    });
    scene.add(city.root);

    // 4. Mission markers: waypoint beam, action ring, planted charge
    const beaconGeo = new THREE.CylinderGeometry(0.14, 0.14, 26, 8);
    beaconGeo.translate(0, 13, 0);
    const beaconMat = new THREE.MeshBasicMaterial({
      color: '#f59e0b',
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    });
    const waypointBeam = new THREE.Mesh(beaconGeo, beaconMat);
    waypointBeam.visible = false;
    scene.add(waypointBeam);

    const ringGeo = new THREE.RingGeometry(1.2, 1.5, 28);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: '#38bdf8', side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
    const actionRing = new THREE.Mesh(ringGeo, ringMat);
    actionRing.visible = false;
    scene.add(actionRing);

    const bombGroup = new THREE.Group();
    const bombBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.45, 0.45),
      new THREE.MeshStandardMaterial({ color: '#3b3f2e', roughness: 0.8 })
    );
    bombBody.position.y = 0.23;
    const bombLight = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 8, 8),
      new THREE.MeshBasicMaterial({ color: '#ef4444' })
    );
    bombLight.position.set(0.2, 0.5, 0);
    bombGroup.add(bombBody, bombLight);
    bombGroup.visible = false;
    scene.add(bombGroup);

    // 5. Build All Faction-Dependent Actors (Player, 1st-Person Rig, Squad APC, Squad Riflemen, Enemy Convoy Column & Patrols)
    let currentBuiltFaction = factionRef.current;
    let playerRig: OperatorRigRefs = buildOperatorModel(currentBuiltFaction, false);
    const safehouse = cityLayout.byId.get('safehouse')!;
    const safeEntrance = getBuildingEntrance(safehouse);
    const safeRespawn = {
      x: (safehouse.rooms[0].minX + safehouse.rooms[0].maxX) / 2,
      z: (safehouse.rooms[0].minZ + safehouse.rooms[0].maxZ) / 2,
    };
    _playerPos.set(safeEntrance.x, 0, safeEntrance.z + (safehouse.doorSide === 'N' ? -2 : 2));
    playerRig.root.position.copy(_playerPos);
    scene.add(playerRig.root);

    let fpViewmodel: FirstPersonViewmodelRefs = buildFirstPersonViewmodel(currentBuiltFaction);
    camera.add(fpViewmodel.root);

    const shadowDisc = new THREE.Mesh(
      new THREE.CircleGeometry(0.62, 18),
      new THREE.MeshBasicMaterial({
        color: '#000000',
        transparent: true,
        opacity: 0.36,
        depthWrite: false,
      })
    );
    shadowDisc.rotation.x = -Math.PI / 2;
    scene.add(shadowDisc);

    let squadVehicle: CommandVehicleRefs = buildSquadCommandVehicle(currentBuiltFaction, matLib);
    const vehPos = new THREE.Vector3(safeEntrance.x + 6, 0, safeEntrance.z + (safehouse.doorSide === 'N' ? -6 : 6));
    staticPhysics.resolveHorizontalBody(vehPos, vehPos.y, 2.8, 1.85);
    vehPos.y = sampleWalkableHeight(vehPos.x, vehPos.z);
    squadVehicle.root.position.copy(vehPos);
    scene.add(squadVehicle.root);
    collidableEnvironment.push(squadVehicle.root);

    let squadRiflemen: OperatorRigRefs[] = [];
    const buildSquadRiflemen = (fac: FactionId) => {
      squadRiflemen.forEach((op) => scene.remove(op.root));
      squadRiflemen = [];
      for (let s = 0; s < 3; s++) {
        const op = buildOperatorModel(fac, false);
        const sPos = { x: vehPos.x - 3 + s * 3, z: vehPos.z - 2.6 };
        const sy = sampleWalkableHeight(sPos.x, sPos.z);
        staticPhysics.resolveHorizontalBody(sPos, sy, 1.75, 0.48);
        op.root.position.set(sPos.x, sampleWalkableHeight(sPos.x, sPos.z), sPos.z);
        scene.add(op.root);
        squadRiflemen.push(op);
      }
    };
    buildSquadRiflemen(currentBuiltFaction);

    // 3-Vehicle Armored Enemy Supply Convoy Column (Lead Escort APC + Cargo Truck + Rear Escort APC)
    let enemyFaction = currentBuiltFaction === FactionId.EAST ? FactionId.WEST : FactionId.EAST;
    let convoyLeadEscort: CommandVehicleRefs = buildSquadCommandVehicle(enemyFaction, matLib);
    let convoyTruckMesh: THREE.Group = buildConvoySupplyTruck(enemyFaction);
    let convoyRearEscort: CommandVehicleRefs = buildSquadCommandVehicle(enemyFaction, matLib);

    scene.add(convoyLeadEscort.root, convoyTruckMesh, convoyRearEscort.root);
    collidableEnvironment.push(convoyLeadEscort.root, convoyTruckMesh, convoyRearEscort.root);

    const CONVOY_MAX_HP = 520;
    let simTime = 0;
    let lastResupplyAt = -APC_RESUPPLY_COOLDOWN_SEC;
    let convoyX = -120;
    let convoyHp = CONVOY_MAX_HP;
    let convoyDestroyedCooldown = 0;
    let convoyKilledThisFrame = false;

    // ---- Enemy actors (street patrols, building garrisons, guards, high-value targets, assault waves) ----
    const enemies: EnemyActor[] = [];
    let enemySerial = 0;
    const currentAct = () => (getCurrentMission(campaignRef.current)?.act ?? 3) as 1 | 2 | 3;

    const spawnEnemy = (spec: {
      kind: EnemyKind;
      x: number;
      z: number;
      y: number;
      bounds: Rect | null;
      floor: number;
      hp?: number;
      damage?: number;
      chase?: boolean;
      scale?: number;
    }): EnemyActor => {
      const act = currentAct();
      const rig = buildOperatorModel(enemyFaction, true);
      if (spec.scale) rig.root.scale.setScalar(spec.scale);
      const pos = { x: spec.x, z: spec.z };
      staticPhysics.resolveHorizontalBody(pos, spec.y, 1.75, 0.45);
      rig.root.position.set(pos.x, spec.y, pos.z);
      scene.add(rig.root);
      const hp = spec.hp ?? ENEMY_HP_BY_ACT[act];
      const e: EnemyActor = {
        kind: spec.kind,
        floorY: spec.y,
        bounds: spec.bounds,
        floor: spec.floor,
        damage: spec.damage ?? ENEMY_DAMAGE_BY_ACT[act],
        chase: spec.chase ?? false,
        id: `enemy-${enemySerial++}`,
        rig,
        hp,
        maxHp: hp,
        fireTimer: 1.0 + Math.random() * 1.6,
        patrolOrigin: new THREE.Vector3(pos.x, spec.y, pos.z),
        patrolPhase: Math.random() * 6,
        alive: true,
        respawnTimer: 0,
        losTimer: Math.random() * 0.3,
        hasLos: false,
      };
      enemies.push(e);
      return e;
    };

    const disposeRig = (root: THREE.Object3D) => {
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry?.dispose();
          const mat = m.material as THREE.Material | THREE.Material[];
          if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
          else mat?.dispose();
        }
      });
    };

    const despawnEnemy = (e: EnemyActor) => {
      scene.remove(e.rig.root);
      disposeRig(e.rig.root);
      const idx = enemies.indexOf(e);
      if (idx !== -1) enemies.splice(idx, 1);
    };

    // Street patrols hold intersections and respawn slowly once you are out of sight.
    const streetSlots: Array<{ x: number; z: number; enemy: EnemyActor | null; respawn: number }> = [];
    for (let i = 1; i < BLOCKS_PER_SIDE; i += 2) {
      for (let j = 0; j < BLOCKS_PER_SIDE; j++) {
        const x = blockCenter(i) - 26;
        const z = blockCenter(j) + 8;
        if (Math.hypot(x - safeEntrance.x, z - safeEntrance.z) < 55) continue;
        streetSlots.push({ x, z, enemy: null, respawn: 0 });
      }
    }
    const streetSlotOf = new Map<EnemyActor, number>();

    // ---- Mission director: turns the current campaign step into enemies, prompts and completion ----
    interface FloorRuntime {
      remaining: number;
      visited: boolean;
      cleared: boolean;
      actors: EnemyActor[];
    }
    const d = {
      key: '',
      step: null as MissionStep | null,
      building: null as Building | null,
      floors: [] as FloorRuntime[],
      guardsRemaining: 0,
      guardActors: [] as EnemyActor[],
      guardsSpawned: false,
      hvt: null as EnemyActor | null,
      hvtDown: false,
      hold: 0,
      defendElapsed: 0,
      waveTimer: 0,
      completeSent: false,
      deathNonce: 0,
      tookDamage: false,
      escortsSpawned: false,
    };

    const despawnMissionEnemies = () => {
      for (let i = enemies.length - 1; i >= 0; i--) {
        if (enemies[i].kind !== 'STREET') despawnEnemy(enemies[i]);
      }
    };

    const setupStep = () => {
      despawnMissionEnemies();
      const p = campaignRef.current;
      const step = getCurrentStep(p);
      d.step = step;
      d.building = getStepBuilding(step);
      d.floors = [];
      d.guardsRemaining = step?.guards ?? 0;
      d.guardActors = [];
      d.guardsSpawned = false;
      d.hvt = null;
      d.hvtDown = false;
      d.hold = 0;
      d.defendElapsed = 0;
      d.waveTimer = 4;
      d.completeSent = false;
      d.escortsSpawned = false;
      bombGroup.visible = false;
      if (!step) return;
      const b = d.building;
      if (step.type === 'CLEAR_BUILDING' && b) {
        for (let f = 0; f < b.floors; f++) {
          const cleared = p.clearedFloors.includes(f);
          d.floors.push({
            remaining: cleared ? 0 : (step.enemiesPerFloor ?? 3) + (f === b.floors - 1 ? 1 : 0),
            visited: cleared,
            cleared,
            actors: [],
          });
        }
      }
      if (step.type === 'DETONATE' && b) {
        const mission = getCurrentMission(p);
        const plantStep = mission?.steps[p.stepIndex - 1];
        const spot = getActionSpot(b);
        bombGroup.position.set(spot.x, floorY(plantStep?.floor ?? 0), spot.z);
        bombGroup.visible = true;
      }
      if (step.type === 'DESTROY_CONVOY') {
        convoyHp = CONVOY_MAX_HP;
        convoyX = -130;
        convoyDestroyedCooldown = 0;
      }
    };

    const completeStep = () => {
      if (d.completeSent) return;
      d.completeSent = true;
      audioEngine.playRetrofitInstall();
      callbacksRef.current.onStepComplete();
    };

    const onEnemyKilled = (e: EnemyActor) => {
      if (e.kind === 'FLOOR') {
        const fr = d.floors[e.floor];
        if (fr) {
          fr.remaining = Math.max(0, fr.remaining - 1);
          fr.actors = fr.actors.filter((a) => a !== e);
        }
      } else if (e.kind === 'GUARD') {
        d.guardsRemaining = Math.max(0, d.guardsRemaining - 1);
        d.guardActors = d.guardActors.filter((a) => a !== e);
      } else if (e.kind === 'HVT') {
        d.hvtDown = true;
        d.hvt = null;
        callbacksRef.current.onToast(`${d.step?.targetName ?? 'Target'} eliminated`);
      } else if (e.kind === 'STREET') {
        const slot = streetSlotOf.get(e);
        if (slot !== undefined) {
          streetSlots[slot].enemy = null;
          streetSlots[slot].respawn = 120;
        }
        streetSlotOf.delete(e);
      }
    };

    const killEnemy = (e: EnemyActor) => {
      if (!e.alive) return;
      e.alive = false;
      e.rig.root.visible = false;
      onEnemyKilled(e);
    };

    const handlePlayerDown = () => {
      combatRef.current.hp = 70;
      combatRef.current.armorIntegrity = 50;
      combatRef.current.healthStatus = HealthStatus.DAMAGED;
      _playerPos.set(safeRespawn.x, 0, safeRespawn.z);
      verticalVel = 0;
      d.deathNonce++;
      callbacksRef.current.onPlayerDown();
    };

    const wavePoints = (cx: number, cz: number): Array<{ x: number; z: number }> => {
      const pts: Array<{ x: number; z: number }> = [];
      for (const t of [-48, -24, 24, 48]) {
        pts.push({ x: cx - 27, z: cz + t }, { x: cx + 27, z: cz + t }, { x: cx + t, z: cz - 27 }, { x: cx + t, z: cz + 27 });
      }
      return pts;
    };

    const LOOT_LABEL: Record<string, string> = {
      AMMO: 'the ammo crate',
      MEDKIT: 'the medical case',
      SALVAGE: 'the salvage box',
      ARMOR: 'the armor locker',
      DOSSIER: 'the document case',
    };

    let directorPrompt: string | null = null;
    let directorWaypoint: { x: number; y: number; z: number } | null = null;
    const directorHud: MissionHudState = {
      missionLabel: '',
      stepText: '',
      detail: '',
      progress: null,
      locationLabel: '',
    };

    const updateDirector = (
      dt: number,
      playerBuilding: Building | null,
      playerFloor: number,
      interactHeld: boolean,
      detonatePressed: boolean
    ) => {
      const p = campaignRef.current;
      const key = `${p.missionIndex}:${p.stepIndex}:${d.deathNonce}:${enemyFaction}`;
      if (key !== d.key) {
        d.key = key;
        setupStep();
      }
      directorPrompt = null;
      directorWaypoint = null;
      actionRing.visible = false;
      const mission = getCurrentMission(p);
      const step = d.step;
      directorHud.missionLabel = mission ? `Mission ${mission.number} · ${mission.title}` : 'Campaign complete';
      directorHud.stepText = step ? step.text : 'Varos-Meridian is free. Explore and loot at will.';
      directorHud.detail = '';
      directorHud.progress = null;
      if (!step || d.completeSent) {
        d.tookDamage = false;
        return;
      }
      const b = d.building;
      const px = _playerPos.x;
      const pz = _playerPos.z;
      const bCenter = b
        ? { x: (b.footprint.minX + b.footprint.maxX) / 2, z: (b.footprint.minZ + b.footprint.maxZ) / 2 }
        : null;
      const distToB = bCenter ? Math.hypot(bCenter.x - px, bCenter.z - pz) : Infinity;
      const inB = !!b && playerBuilding === b;

      switch (step.type) {
        case 'TRAVEL':
        case 'RETURN_SAFEHOUSE': {
          const wp = getStepWaypoint(step);
          if (wp) {
            directorWaypoint = wp;
            const dist = Math.hypot(wp.x - px, wp.z - pz);
            directorHud.detail = `${Math.round(dist)} m away`;
            const reached = step.zone ? dist < step.zone.radius : inB || dist < 7;
            if (reached) completeStep();
          }
          break;
        }
        case 'CLEAR_BUILDING': {
          if (!b) break;
          const near = distToB < 75;
          const active = new Set<number>();
          if (near) {
            if (inB) {
              active.add(playerFloor - 1);
              active.add(playerFloor);
              active.add(playerFloor + 1);
            } else {
              active.add(0);
              active.add(1);
            }
          }
          d.floors.forEach((fr, f) => {
            if (active.has(f) && fr.actors.length === 0 && fr.remaining > 0) {
              const posts = getFloorPosts(b, f, fr.remaining);
              for (const post of posts) {
                fr.actors.push(spawnEnemy({ kind: 'FLOOR', x: post.x, z: post.z, y: floorY(f), bounds: post.room, floor: f }));
              }
            } else if (!active.has(f) && fr.actors.length > 0) {
              fr.actors.forEach((a) => despawnEnemy(a));
              fr.actors = [];
            }
          });
          if (inB && d.floors[playerFloor]) d.floors[playerFloor].visited = true;
          let clearedCount = 0;
          d.floors.forEach((fr, f) => {
            if (!fr.cleared && isFloorCleared(fr.remaining, fr.visited)) {
              fr.cleared = true;
              callbacksRef.current.onFloorCleared(f);
              const n = d.floors.filter((x) => x.cleared).length;
              callbacksRef.current.onToast(`Floor ${f + 1} clear — ${n}/${d.floors.length} floors secured`);
            }
            if (fr.cleared) clearedCount++;
          });
          directorHud.progress = clearedCount / Math.max(1, d.floors.length);
          const here = inB ? d.floors[playerFloor] : null;
          directorHud.detail =
            `Floors cleared ${clearedCount}/${d.floors.length}` +
            (here ? ` · This floor: ${here.remaining > 0 ? `${here.remaining} hostiles` : 'clear'}` : '');
          if (clearedCount >= d.floors.length) {
            callbacksRef.current.onToast(`${b.name} taken`);
            completeStep();
            break;
          }
          const nextFloor = d.floors.findIndex((fr) => !fr.cleared);
          if (inB) {
            directorWaypoint = bCenter ? { x: bCenter.x, z: bCenter.z, y: floorY(Math.max(0, nextFloor)) } : null;
          } else {
            const e = getBuildingEntrance(b);
            directorWaypoint = { x: e.x, z: e.z, y: 0 };
          }
          break;
        }
        case 'PLANT_BOMB':
        case 'RETRIEVE':
        case 'ELIMINATE': {
          if (!b) break;
          const F = step.floor ?? 0;
          if (distToB < 75 && !d.guardsSpawned && d.guardsRemaining > 0) {
            d.guardsSpawned = true;
            const posts = getFloorPosts(b, F, d.guardsRemaining);
            d.guardActors = posts.map((post) =>
              spawnEnemy({ kind: 'GUARD', x: post.x, z: post.z, y: floorY(F), bounds: post.room, floor: F })
            );
          } else if (distToB > 115 && d.guardsSpawned) {
            d.guardActors.forEach((a) => despawnEnemy(a));
            d.guardActors = [];
            d.guardsSpawned = false;
          }
          if (step.type === 'ELIMINATE') {
            if (distToB < 75 && !d.hvt && !d.hvtDown) {
              const room = b.rooms[b.rooms.length - 1];
              d.hvt = spawnEnemy({
                kind: 'HVT',
                x: (room.minX + room.maxX) / 2,
                z: (room.minZ + room.maxZ) / 2,
                y: floorY(F),
                bounds: room,
                floor: F,
                hp: step.targetHp ?? 400,
                damage: ENEMY_DAMAGE_BY_ACT[currentAct()] + 6,
                scale: 1.12,
              });
            } else if (distToB > 115 && d.hvt) {
              despawnEnemy(d.hvt);
              d.hvt = null;
            }
            if (d.hvtDown) {
              completeStep();
              break;
            }
            const hpPct = d.hvt ? Math.round((d.hvt.hp / d.hvt.maxHp) * 100) : 100;
            directorHud.detail = `${step.targetName ?? 'Target'} · Floor ${F + 1} · ${hpPct}% health${d.guardsRemaining > 0 ? ` · ${d.guardsRemaining} bodyguards` : ''}`;
            directorWaypoint = d.hvt
              ? { x: d.hvt.rig.root.position.x, y: d.hvt.rig.root.position.y, z: d.hvt.rig.root.position.z }
              : bCenter
                ? { x: bCenter.x, z: bCenter.z, y: floorY(F) }
                : null;
            break;
          }
          const spot = getActionSpot(b);
          actionRing.visible = true;
          actionRing.position.set(spot.x, floorY(F) + 0.04, spot.z);
          directorWaypoint = inB ? { x: spot.x, y: floorY(F), z: spot.z } : { ...getBuildingEntrance(b), y: 0 };
          const onFloor = inB && playerFloor === F;
          const distSpot = Math.hypot(spot.x - px, spot.z - pz);
          const holdSec = step.holdSec ?? 8;
          const verb = step.type === 'PLANT_BOMB' ? 'plant the charge' : 'work';
          if (onFloor && distSpot < 2.4) {
            if (!canStartHoldAction(d.guardsRemaining)) {
              directorPrompt = `Clear the ${d.guardsRemaining} guard${d.guardsRemaining === 1 ? '' : 's'} on this floor first`;
            } else {
              d.hold = stepHoldProgress(d.hold, dt, interactHeld, d.tookDamage);
              directorPrompt = `Hold [E] to ${verb} — ${Math.min(100, Math.round((d.hold / holdSec) * 100))}%`;
              if (d.hold >= holdSec) {
                if (step.type === 'PLANT_BOMB') {
                  bombGroup.position.set(spot.x, floorY(F), spot.z);
                  bombGroup.visible = true;
                  callbacksRef.current.onToast('Charge planted. Get clear!');
                }
                completeStep();
              }
            }
          } else {
            d.hold = stepHoldProgress(d.hold, dt, false, d.tookDamage);
          }
          directorHud.progress = d.hold > 0 ? Math.min(1, d.hold / holdSec) : null;
          directorHud.detail = `Floor ${F + 1}${d.guardsRemaining > 0 ? ` · ${d.guardsRemaining} guards remain` : ' · guards down'}${
            !onFloor && inB ? ` · you are on floor ${playerFloor + 1}` : ''
          }`;
          break;
        }
        case 'DETONATE': {
          if (!b) break;
          const dist = Math.hypot(bombGroup.position.x - px, bombGroup.position.z - pz);
          const safe = step.safeDistance ?? 50;
          directorWaypoint = { x: bombGroup.position.x, y: bombGroup.position.y, z: bombGroup.position.z };
          bombLight.visible = Math.floor(simTime * 3) % 2 === 0;
          if (canDetonate(dist, safe)) {
            directorPrompt = 'Press [G] to detonate';
            directorHud.detail = `${Math.round(dist)} m from the charge — safe`;
            if (detonatePressed) {
              audioEngine.playExplosion();
              window.setTimeout(() => audioEngine.playExplosion(), 260);
              camControllerRef.current.applyCombatImpulse(0.06, 0, 0.5);
              const fp = b.footprint;
              for (let k = 0; k < 9; k++) {
                _tmpVecC.set(
                  fp.minX + Math.random() * (fp.maxX - fp.minX),
                  Math.random() * floorY(b.floors),
                  fp.minZ + Math.random() * (fp.maxZ - fp.minZ)
                );
                spawnImpactSparks(_tmpVecC, 14, true);
              }
              bombGroup.visible = false;
              city.setBuildingDestroyed(b);
              appliedDestroyed.add(b.id);
              callbacksRef.current.onBuildingDestroyed(b.id);
              completeStep();
            }
          } else {
            directorHud.detail = `Too close: ${Math.round(dist)} / ${safe} m`;
            directorHud.progress = dist / safe;
          }
          break;
        }
        case 'DEFEND': {
          const z = step.zone;
          if (!z) break;
          const dist = Math.hypot(z.x - px, z.z - pz);
          const inside = dist < z.radius;
          d.defendElapsed = stepDefendTimer(d.defendElapsed, dt, inside);
          d.waveTimer -= dt;
          const waveAlive = enemies.filter((e) => e.kind === 'WAVE' && e.alive).length;
          if (d.waveTimer <= 0) {
            d.waveTimer = 13;
            if (waveAlive < 10) {
              const pts = wavePoints(z.x, z.z).filter((pt) => Math.hypot(pt.x - px, pt.z - pz) > 26);
              for (let k = 0; k < 3 && pts.length > 0; k++) {
                const pt = pts.splice(Math.floor(Math.random() * pts.length), 1)[0];
                spawnEnemy({ kind: 'WAVE', x: pt.x, z: pt.z, y: 0, bounds: null, floor: 0, chase: true });
              }
            }
          }
          const total = step.durationSec ?? 120;
          directorHud.progress = Math.min(1, d.defendElapsed / total);
          directorHud.detail = `Hold for ${Math.max(0, Math.ceil(total - d.defendElapsed))} s${inside ? '' : ' · back inside the plaza — clock paused'}`;
          directorWaypoint = { x: z.x, y: 0, z: z.z };
          if (d.defendElapsed >= total) {
            for (let i = enemies.length - 1; i >= 0; i--) {
              if (enemies[i].kind === 'WAVE') despawnEnemy(enemies[i]);
            }
            completeStep();
          }
          break;
        }
        case 'DESTROY_CONVOY': {
          const cz = getHighwayCenterZ(convoyX);
          if (!d.escortsSpawned && convoyHp > 0 && Math.hypot(convoyX - px, cz - pz) < 70) {
            d.escortsSpawned = true;
            for (let k = 0; k < 4; k++) {
              spawnEnemy({ kind: 'WAVE', x: convoyX - 8 + k * 5, z: cz - 6.5, y: 0, bounds: null, floor: 0, chase: true });
            }
          }
          if (convoyKilledThisFrame) {
            completeStep();
            break;
          }
          directorHud.progress = convoyHp > 0 ? 1 - convoyHp / CONVOY_MAX_HP : null;
          directorHud.detail = convoyHp > 0 ? `Convoy armor ${Math.round((convoyHp / CONVOY_MAX_HP) * 100)}%` : 'Convoy regrouping…';
          directorWaypoint = { x: convoyX, y: 0, z: cz };
          break;
        }
      }
      d.tookDamage = false;
    };

    const droppedCrates: DroppedCrate[] = [];
    const registerCrateCollider = (id: string, cx: number, cy: number, cz: number) => {
      staticPhysics.addBox({
        id,
        cx,
        cz,
        widthX: 1.44,
        depthZ: 1.05,
        minY: cy - 0.5,
        maxY: cy + 0.92,
        material: 'STEEL',
        walkableTop: true,
      });
    };


    // 6. Dual-Ray Ballistic Convergence Visualizer Lines & Impact Particle Pool
    const sightRayGeo = new THREE.BufferGeometry().setFromPoints(_sightLinePts);
    const sightRayLine = new THREE.Line(
      sightRayGeo,
      new THREE.LineBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.85 })
    );
    sightRayLine.frustumCulled = false;
    sightRayLine.visible = false;

    const muzzleRayGeo = new THREE.BufferGeometry().setFromPoints(_muzzleLinePts);
    const muzzleRayLine = new THREE.Line(
      muzzleRayGeo,
      new THREE.LineBasicMaterial({ color: '#f59e0b', transparent: true, opacity: 0.95 })
    );
    muzzleRayLine.frustumCulled = false;
    muzzleRayLine.visible = false;

    const focalSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 12, 12),
      new THREE.MeshBasicMaterial({ color: '#ef4444' })
    );
    focalSphere.visible = false;
    scene.add(sightRayLine, muzzleRayLine, focalSphere);

    const tracers: TracerBolt[] = [];
    const tracerGeo = new THREE.CylinderGeometry(0.026, 0.026, 1.45, 6);
    tracerGeo.rotateX(Math.PI / 2);
    const friendlyTracerMat = new THREE.MeshBasicMaterial({ color: '#fde047' });
    const enemyTracerMat = new THREE.MeshBasicMaterial({ color: '#f87171' });

    const impactBursts: ImpactBurst[] = [];
    const sparkGeo = new THREE.SphereGeometry(0.14, 8, 8);
    const sparkMat = new THREE.MeshBasicMaterial({
      color: '#fbbf24',
      transparent: true,
      opacity: 0.9,
    });
    const fireballMat = new THREE.MeshBasicMaterial({
      color: '#f97316',
      transparent: true,
      opacity: 0.88,
    });
    const smokeMat = new THREE.MeshBasicMaterial({
      color: '#334155',
      transparent: true,
      opacity: 0.65,
    });

    const spawnImpactSparks = (pos: THREE.Vector3, count: number, isExplosion = false) => {
      for (let i = 0; i < count; i++) {
        const mat = isExplosion ? (i % 2 === 0 ? fireballMat : smokeMat) : sparkMat;
        const m = new THREE.Mesh(sparkGeo, mat);
        m.position.copy(pos);
        if (isExplosion) m.scale.setScalar(2.4);
        scene.add(m);
        impactBursts.push({
          mesh: m,
          velocity: new THREE.Vector3(
            (Math.random() - 0.5) * (isExplosion ? 16 : 9),
            Math.random() * (isExplosion ? 14 : 6) + 1.5,
            (Math.random() - 0.5) * (isExplosion ? 16 : 9)
          ),
          life: isExplosion ? 0.95 : 0.24,
          maxLife: isExplosion ? 0.95 : 0.24,
          scaleRate: isExplosion ? 4.8 : -0.4,
        });
      }
    };

    const spawnTracer = (
      origin: THREE.Vector3,
      dir: THREE.Vector3,
      isFriendly: boolean,
      damage: number
    ) => {
      const mesh = new THREE.Mesh(tracerGeo, isFriendly ? friendlyTracerMat : enemyTracerMat);
      mesh.position.copy(origin);
      _lookTarget.copy(origin).add(dir);
      mesh.lookAt(_lookTarget);
      scene.add(mesh);
      tracers.push({
        mesh,
        velocity: dir.clone().multiplyScalar(isFriendly ? 140 : 84),
        life: 1.4,
        isFriendly,
        damage,
      });
    };

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // 7. Input Listeners (Guarded cleanly when M Menu or Architecture Tabs are open)
    const keysDown: Record<string, boolean> = {};
    let triggerHeld = false;
    let triggerJustPressed = false;
    let reloadJustPressed = false;
    let switchSlotJustPressed = false;
    let quickMeleeJustPressed = false;
    let healJustPressed = false;
    let interactJustPressed = false;
    let detonateJustPressed = false;
    let verticalVel = 0;
    let playerGrounded = true;
    let isDraggingLook = false;
    let lastPointerX = 0;
    let lastPointerY = 0;
    let processedDeployNonce = deployReqRef.current?.nonce ?? 0;

    const onKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement &&
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)
      ) {
        return;
      }
      if (simPausedRef.current) return;

      keysDown[e.code] = true;

      if (!e.repeat) {
        if (e.code === 'KeyC') {
          const nextMode = camControllerRef.current.togglePerspectiveMode();
          audioEngine.playPovToggle(nextMode === PerspectiveMode.THIRD_PERSON);
        } else if (e.code === 'KeyQ') {
          camControllerRef.current.swapShoulder();
        } else if (e.code === 'KeyR') {
          reloadJustPressed = true;
        } else if (e.code === 'Digit2' || e.code === 'Digit1') {
          switchSlotJustPressed = true;
        } else if (e.code === 'KeyV') {
          quickMeleeJustPressed = true;
        } else if (e.code === 'Digit4') {
          healJustPressed = true;
        } else if (e.code === 'KeyE') {
          interactJustPressed = true;
        } else if (e.code === 'KeyG') {
          detonateJustPressed = true;
        } else if (e.code === 'KeyF') {
          handleCycleSquadOrder();
        } else if (e.code === 'KeyH') {
          setDockCollapsed((prev) => !prev);
        } else if (e.code === 'KeyZ') {
          camControllerRef.current.isAimingDownSights =
            !camControllerRef.current.isAimingDownSights;
        } else if (e.code === 'KeyJ') {
          triggerHeld = true;
          triggerJustPressed = true;
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysDown[e.code] = false;
      if (e.code === 'KeyJ') triggerHeld = false;
    };

    const onMouseDown = (e: MouseEvent) => {
      if (simPausedRef.current || e.target !== renderer.domElement) return;

      if (e.button === 0) {
        if (document.pointerLockElement === renderer.domElement) {
          triggerHeld = true;
          triggerJustPressed = true;
        } else {
          isDraggingLook = true;
          lastPointerX = e.clientX;
          lastPointerY = e.clientY;
          triggerHeld = true;
          triggerJustPressed = true;
          renderer.domElement.requestPointerLock?.();
        }
      } else if (e.button === 2) {
        camControllerRef.current.isAimingDownSights = true;
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) {
        triggerHeld = false;
        isDraggingLook = false;
      } else if (e.button === 2) {
        camControllerRef.current.isAimingDownSights = false;
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (simPausedRef.current) return;
      if (document.pointerLockElement === renderer.domElement) {
        camControllerRef.current.applyLookDelta(e.movementX, e.movementY);
      } else if (isDraggingLook) {
        const dx = e.clientX - lastPointerX;
        const dy = e.clientY - lastPointerY;
        lastPointerX = e.clientX;
        lastPointerY = e.clientY;
        camControllerRef.current.applyLookDelta(dx * 1.4, dy * 1.4);
      }
    };

    const onContextMenu = (e: MouseEvent) => {
      if (e.target === renderer.domElement) e.preventDefault();
    };

    const onPointerLockChange = () => {
      if (document.pointerLockElement !== renderer.domElement) {
        triggerHeld = false;
      }
    };

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      if (w > 0 && h > 0) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    window.addEventListener('resize', onResize);

    // 8. Main Deterministic Game Loop
    const clock = new THREE.Clock();
    let frameId = 0;
    let uiSyncAccum = 0;
    let muzzleFlashTimer = 0;
    let squadFireAccum = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      gl.flush();
      const poll = () => {
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (sync && state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      const rawDt = clock.getDelta();
      const dt = simPausedRef.current ? 0 : Math.min(rawDt, 0.05);
      const elapsed = clock.getElapsedTime();

      syncAtmospherePreset(atmosphereRef.current);
      skyDome.uniforms.uTime.value = elapsed;
      skyDome.mesh.position.copy(camera.position);
      simTime += dt;
      convoyKilledThisFrame = false;

      // Apply loot / demolitions restored from a loaded or cloud save.
      const prog = campaignRef.current;
      if (prog.lootedIds.length !== appliedLooted.size) {
        for (const id of prog.lootedIds) {
          if (!appliedLooted.has(id)) {
            appliedLooted.add(id);
            city.hideLoot(id);
          }
        }
      }
      if (prog.destroyedBuildingIds.length !== appliedDestroyed.size) {
        for (const id of prog.destroyedBuildingIds) {
          const bld = cityLayout.byId.get(id);
          if (bld && !appliedDestroyed.has(id)) {
            appliedDestroyed.add(id);
            city.setBuildingDestroyed(bld);
          }
        }
      }

      // Handle Fast-Deploy Request from M Tactical Map Menu (with solid obstacle push-out)
      if (deployReqRef.current && deployReqRef.current.nonce !== processedDeployNonce) {
        processedDeployNonce = deployReqRef.current.nonce;
        const pDep = {
          x: THREE.MathUtils.clamp(deployReqRef.current.x, -PLAYABLE_HALF_EXTENT, PLAYABLE_HALF_EXTENT),
          z: THREE.MathUtils.clamp(deployReqRef.current.z, -PLAYABLE_HALF_EXTENT, PLAYABLE_HALF_EXTENT),
        };
        const depY = sampleCitySupport(pDep.x, pDep.z, deployReqRef.current.y ?? 0);
        staticPhysics.resolveHorizontalBody(pDep, depY, 1.75, 0.55);
        _playerPos.set(pDep.x, depY, pDep.z);
        verticalVel = 0;

        const vDep = { x: pDep.x - 7, z: pDep.z - 5 };
        staticPhysics.resolveHorizontalBody(
          vDep,
          sampleWalkableHeight(vDep.x, vDep.z),
          2.8,
          1.9
        );
        squadVehicle.root.position.set(vDep.x, sampleWalkableHeight(vDep.x, vDep.z), vDep.z);
      }

      // Rebuild all friendly & enemy faction meshes cleanly if player switched East <-> West
      if (currentBuiltFaction !== factionRef.current) {
        currentBuiltFaction = factionRef.current;
        enemyFaction = currentBuiltFaction === FactionId.EAST ? FactionId.WEST : FactionId.EAST;

        scene.remove(playerRig.root);
        camera.remove(fpViewmodel.root);
        [squadVehicle.root, convoyLeadEscort.root, convoyTruckMesh, convoyRearEscort.root].forEach(
          (m) => {
            const idx = collidableEnvironment.indexOf(m);
            if (idx !== -1) collidableEnvironment.splice(idx, 1);
            scene.remove(m);
          }
        );

        playerRig = buildOperatorModel(currentBuiltFaction, false);
        playerRig.root.position.copy(_playerPos);
        scene.add(playerRig.root);

        fpViewmodel = buildFirstPersonViewmodel(currentBuiltFaction);
        camera.add(fpViewmodel.root);

        const oldVehCoords = squadVehicle.root.position.clone();
        squadVehicle = buildSquadCommandVehicle(currentBuiltFaction, matLib);
        squadVehicle.root.position.copy(oldVehCoords);
        scene.add(squadVehicle.root);
        collidableEnvironment.push(squadVehicle.root);

        buildSquadRiflemen(currentBuiltFaction);
        for (let i = enemies.length - 1; i >= 0; i--) despawnEnemy(enemies[i]);
        streetSlots.forEach((slot) => {
          slot.enemy = null;
          slot.respawn = 0;
        });
        streetSlotOf.clear();
        d.key = '';

        convoyLeadEscort = buildSquadCommandVehicle(enemyFaction, matLib);
        convoyTruckMesh = buildConvoySupplyTruck(enemyFaction);
        convoyRearEscort = buildSquadCommandVehicle(enemyFaction, matLib);
        scene.add(convoyLeadEscort.root, convoyTruckMesh, convoyRearEscort.root);
        collidableEnvironment.push(
          convoyLeadEscort.root,
          convoyTruckMesh,
          convoyRearEscort.root
        );
      }

      // Sync Squad Command Vehicle visual retrofit modules
      squadVehicle.eraGroup.visible = vehicleRef.current.hasEraTiles;
      squadVehicle.apsGroup.visible = vehicleRef.current.hasApsRadar;
      squadVehicle.mastGroup.visible = vehicleRef.current.hasThermalMast;
      squadVehicle.atgmGroup.visible = vehicleRef.current.hasRemoteTurret;

      if (!simPausedRef.current) {
        if (keysDown['ArrowLeft']) camControllerRef.current.applyLookDelta(-18 * dt * 60, 0, 0.0016);
        if (keysDown['ArrowRight']) camControllerRef.current.applyLookDelta(18 * dt * 60, 0, 0.0016);
        if (keysDown['ArrowUp']) camControllerRef.current.applyLookDelta(0, -14 * dt * 60, 0.0016);
        if (keysDown['ArrowDown']) camControllerRef.current.applyLookDelta(0, 14 * dt * 60, 0.0016);
      }

      // A. Player Locomotion + Full 3D Solid Non-Phaseable Obstacle & Vehicle Collision
      const prevPlayerY = _playerPos.y;
      const prevPlayerX = _playerPos.x;
      const prevPlayerZ = _playerPos.z;
      const yaw = camControllerRef.current.yawRad;
      _forwardFlat.set(-Math.sin(yaw), 0, -Math.cos(yaw)).normalize();
      _rightFlat.set(Math.cos(yaw), 0, -Math.sin(yaw)).normalize();

      _moveInput.set(0, 0, 0);
      if (!simPausedRef.current) {
        if (keysDown['KeyW']) _moveInput.add(_forwardFlat);
        if (keysDown['KeyS']) _moveInput.sub(_forwardFlat);
        if (keysDown['KeyD']) _moveInput.add(_rightFlat);
        if (keysDown['KeyA']) _moveInput.sub(_rightFlat);
      }

      const isMoving = _moveInput.lengthSq() > 0.001;
      if (isMoving && dt > 0) {
        _moveInput.normalize();
        const sprintBoost = keysDown['ShiftLeft'] || keysDown['ShiftRight'] ? 1.38 : 1.0;
        const medkitSlow =
          combatRef.current.healthStatus === 'APPLYING_MEDKIT'
            ? STANDARD_MEDICAL_GEAR.moveSpeedMultiplierWhileApplying
            : 1.0;
        const moveSpeed = 8.5 * sprintBoost * medkitSlow;
        _playerPos.x = THREE.MathUtils.clamp(
          _playerPos.x + _moveInput.x * moveSpeed * dt,
          -THEATER_HALF_EXTENT + 10,
          THEATER_HALF_EXTENT - 10
        );
        _playerPos.z = THREE.MathUtils.clamp(
          _playerPos.z + _moveInput.z * moveSpeed * dt,
          -THEATER_HALF_EXTENT + 10,
          THEATER_HALF_EXTENT - 10
        );
      }

      // Resolve horizontal push-out against all static structures, bridges, rocks, trees & crates
      staticPhysics.resolveHorizontalBody(_playerPos, _playerPos.y, 1.75, 0.44);

      // Resolve dynamic vehicle hull collisions (Squad 8x8 APC + Enemy Armored Convoy)
      resolveDynamicBoxCollision(
        _playerPos,
        _playerPos.y,
        0.44,
        squadVehicle.root.position.x,
        squadVehicle.root.position.y,
        squadVehicle.root.position.z,
        1.52,
        2.8,
        3.28,
        squadVehicle.root.rotation.y
      );
      if (convoyHp > 0) {
        for (const cv of [convoyLeadEscort.root, convoyTruckMesh, convoyRearEscort.root]) {
          resolveDynamicBoxCollision(
            _playerPos,
            _playerPos.y,
            0.44,
            cv.position.x,
            cv.position.y,
            cv.position.z,
            1.48,
            2.8,
            3.28,
            cv.rotation.y
          );
        }
      }
      // Final static pass ensures a moving vehicle can never push the operator inside a wall or rock
      staticPhysics.resolveHorizontalBody(_playerPos, _playerPos.y, 1.75, 0.44);

      // Stairs: you can't walk through the low end of a staircase from underneath.
      if (isBlockedByStairs(_playerPos.x, _playerPos.z, _playerPos.y)) {
        if (!isBlockedByStairs(_playerPos.x, prevPlayerZ, _playerPos.y)) _playerPos.z = prevPlayerZ;
        else if (!isBlockedByStairs(prevPlayerX, _playerPos.z, _playerPos.y)) _playerPos.x = prevPlayerX;
        else {
          _playerPos.x = prevPlayerX;
          _playerPos.z = prevPlayerZ;
        }
      }

      const baseGroundY = sampleCitySupport(_playerPos.x, _playerPos.z, prevPlayerY);
      // Stick to stairs when walking down instead of floating off each step.
      const dropToGround = prevPlayerY - baseGroundY;
      if (playerGrounded && verticalVel <= 0 && dropToGround > 0 && dropToGround < 0.7) {
        _playerPos.y = baseGroundY;
      }

      if (!simPausedRef.current && keysDown['Space'] && playerGrounded) {
        verticalVel = 6.9;
        playerGrounded = false;
      }
      verticalVel -= 18.5 * dt;
      const candidateY = _playerPos.y + verticalVel * dt;
      const vBounds = staticPhysics.resolveVerticalBounds(
        _playerPos.x,
        _playerPos.z,
        Math.max(prevPlayerY, baseGroundY),
        candidateY,
        1.75,
        0.4,
        baseGroundY
      );
      _playerPos.y = vBounds.clampedY;
      if (vBounds.hitCeiling && verticalVel > 0) {
        verticalVel = 0;
      }
      if (_playerPos.y <= vBounds.groundY + 0.002 && verticalVel <= 0) {
        _playerPos.y = vBounds.groundY;
        verticalVel = 0;
        playerGrounded = true;
      } else if (_playerPos.y > vBounds.groundY + 0.12) {
        playerGrounded = false;
      }

      playerRig.root.position.copy(_playerPos);
      playerRig.root.rotation.y = yaw;
      shadowDisc.position.set(_playerPos.x, vBounds.groundY + 0.03, _playerPos.z);

      const sunCfg = ATMOSPHERE_CONFIGS[atmosphereRef.current].sunPosition;
      sunLight.position.set(
        _playerPos.x + sunCfg[0] * 0.75,
        _playerPos.y + sunCfg[1] * 0.85,
        _playerPos.z + sunCfg[2] * 0.75
      );
      sunLight.target.position.copy(_playerPos);

      const walkSwing = isMoving ? Math.sin(elapsed * 10.5) * 0.48 : 0;
      playerRig.leftLegPivot.rotation.x = walkSwing;
      playerRig.rightLegPivot.rotation.x = -walkSwing;

      const usingSword = combatRef.current.equippedSlot === WeaponSlot.EMERGENCY_SWORD;
      playerRig.rifleGroup.visible = !usingSword;
      playerRig.swordHeldGroup.visible = usingSword;
      playerRig.swordSheathedGroup.visible = !usingSword;

      // B. Update Camera POV + Dual-Ray Convergence (with StaticWorldPhysics occlusion)
      playerRig.root.updateMatrixWorld(true);
      if (camControllerRef.current.blendAlpha < 0.25) {
        camera.updateMatrixWorld(true);
        fpViewmodel.muzzleNode.getWorldPosition(_muzzleWorld);
      } else {
        playerRig.muzzleNode.getWorldPosition(_muzzleWorld);
      }

      const telemetry = camControllerRef.current.update(
        Math.max(dt, 0.016),
        camera,
        _playerPos,
        _muzzleWorld,
        collidableEnvironment,
        sampleWalkableHeight,
        staticPhysics
      );

      const isFirstPersonVisual = telemetry.blendAlpha < 0.26;
      playerRig.root.visible = !isFirstPersonVisual;
      shadowDisc.visible = !isFirstPersonVisual;
      fpViewmodel.root.visible = isFirstPersonVisual;

      // C. Step Player Combat State Machine
      const fsmEvents = stepPlayerCombatStateMachine(
        combatRef.current,
        factionRef.current,
        dt,
        {
          triggerHeld: !simPausedRef.current && triggerHeld,
          triggerJustPressed: !simPausedRef.current && triggerJustPressed,
          reloadJustPressed: !simPausedRef.current && reloadJustPressed,
          switchSlotJustPressed: !simPausedRef.current && switchSlotJustPressed,
          quickMeleeJustPressed: !simPausedRef.current && quickMeleeJustPressed,
          healJustPressed: !simPausedRef.current && healJustPressed,
        }
      );

      triggerJustPressed = false;
      reloadJustPressed = false;
      switchSlotJustPressed = false;
      quickMeleeJustPressed = false;
      healJustPressed = false;

      if (fsmEvents.firedShot) {
        audioEngine.playRifleShot(factionRef.current === FactionId.WEST);
        muzzleFlashTimer = 0.05;
        camControllerRef.current.applyCombatImpulse(
          0.014,
          (Math.random() - 0.5) * 0.008,
          0.04
        );
        const gunSpec = FACTION_PRIMARY_FIREARMS[factionRef.current];

        // Anti-wallbang guard: verify gun barrel between operator shoulder & muzzle isn't poking into a wall/rock/tree
        _tmpVecC.set(_playerPos.x, _playerPos.y + 1.42, _playerPos.z);
        _tmpVecD.subVectors(_muzzleWorld, _tmpVecC);
        const barrelLen = _tmpVecD.length();
        const barrelBlock =
          barrelLen > 0.02
            ? staticPhysics.raycast(_tmpVecC, _tmpVecD.divideScalar(barrelLen), barrelLen + 0.06)
            : null;

        if (barrelBlock) {
          _tmpVecB.set(barrelBlock.pointX, barrelBlock.pointY, barrelBlock.pointZ);
          spawnImpactSparks(_tmpVecB, 5, false);
        } else {
          _tmpVecA.set(
            telemetry.convergentMuzzleDir.x,
            telemetry.convergentMuzzleDir.y,
            telemetry.convergentMuzzleDir.z
          );
          spawnTracer(_muzzleWorld, _tmpVecA, true, gunSpec.baseDamage);
        }
      }

      if (fsmEvents.dryClicked) audioEngine.playDryClick();
      if (fsmEvents.startedReload) audioEngine.playReloadClick();
      if (fsmEvents.swordSlashTriggered > 0) {
        audioEngine.playSwordSlash(fsmEvents.swordSlashTriggered as 1 | 2 | 3);
        camControllerRef.current.applyCombatImpulse(-0.01, 0, 0.05);

        // Tactile spark feedback when slashing directly into a solid tree, rock, or wall
        const swordSpec = FACTION_EMERGENCY_SWORDS[factionRef.current];
        _tmpVecC.set(_playerPos.x, _playerPos.y + 1.32, _playerPos.z);
        camera.getWorldDirection(_tmpVecD);
        const bladeWallHit = staticPhysics.raycast(_tmpVecC, _tmpVecD, swordSpec.reachMeters * 0.85);
        if (bladeWallHit) {
          _tmpVecB.set(bladeWallHit.pointX, bladeWallHit.pointY, bladeWallHit.pointZ);
          spawnImpactSparks(_tmpVecB, 5, false);
        }
      }
      if (fsmEvents.medkitStarted) audioEngine.playMedkitApply();

      // Sword Cleave Arc Trail + Non-Phaseable Line-of-Sight Hit Detection
      playerRig.swordTrailMesh.visible = fsmEvents.swordCollisionWindowOpen && !isFirstPersonVisual;
      fpViewmodel.swordTrailMesh.visible = fsmEvents.swordCollisionWindowOpen && isFirstPersonVisual;

      if (fsmEvents.swordCollisionWindowOpen) {
        const swordSpec = FACTION_EMERGENCY_SWORDS[factionRef.current];
        const swingDmg = computeSwordSwingDamage(combatRef.current, factionRef.current);
        const halfArcCos = Math.cos(THREE.MathUtils.degToRad(swordSpec.cleaveArcDeg * 0.5));
        _tmpVecC.set(_playerPos.x, _playerPos.y + 1.15, _playerPos.z);

        enemies.forEach((enemy) => {
          if (!enemy.alive) return;
          if (combatRef.current.activeHitEntitiesThisSwing.includes(enemy.id)) return;

          _enemyDelta.subVectors(enemy.rig.root.position, _playerPos);
          const dist = _enemyDelta.length();
          if (dist <= swordSpec.reachMeters) {
            _enemyDelta.y = 0;
            if (_enemyDelta.lengthSq() > 0.0001) _enemyDelta.normalize();
            const forwardDot = _enemyDelta.dot(_forwardFlat);
            if (forwardDot >= halfArcCos || dist < 1.4) {
              _tmpVecD.set(
                enemy.rig.root.position.x,
                enemy.rig.root.position.y + 1.15,
                enemy.rig.root.position.z
              );
              // Block melee strike if any wall, boulder, tree trunk, or structure separates player & target
              if (!staticPhysics.hasLineOfSight(_tmpVecC, _tmpVecD, sampleWalkableHeight)) {
                return;
              }

              combatRef.current.activeHitEntitiesThisSwing.push(enemy.id);
              combatRef.current.swordDurability = Math.max(
                10,
                Number((combatRef.current.swordDurability - swordSpec.durabilityLossPerHit).toFixed(2))
              );
              enemy.hp -= swingDmg;
              _tmpVecB.copy(enemy.rig.root.position).setY(enemy.rig.root.position.y + 1.15);
              spawnImpactSparks(_tmpVecB, 7, false);
              if (enemy.hp <= 0) killEnemy(enemy);
            }
          }
        });
      }

      // Dynamic Muzzle Flash PointLight & Viewmodel Recoil
      muzzleFlashTimer = Math.max(0, muzzleFlashTimer - dt);
      fpViewmodel.muzzleFlashMesh.visible = muzzleFlashTimer > 0 && !usingSword;
      muzzlePointLight.intensity = muzzleFlashTimer > 0 && !usingSword ? 3.5 : 0;
      if (muzzleFlashTimer > 0) muzzlePointLight.position.copy(_muzzleWorld);

      fpViewmodel.rifleRig.visible = !usingSword;
      fpViewmodel.swordRig.visible = usingSword;

      if (!usingSword) {
        const recoilKick = muzzleFlashTimer > 0 ? 0.038 : 0;
        const adsX = camControllerRef.current.isAimingDownSights ? 0.0 : 0.24;
        const adsY = camControllerRef.current.isAimingDownSights ? -0.155 : -0.22;
        fpViewmodel.rifleRig.position.x = THREE.MathUtils.damp(
          fpViewmodel.rifleRig.position.x,
          adsX,
          18,
          Math.max(dt, 0.016)
        );
        fpViewmodel.rifleRig.position.y = THREE.MathUtils.damp(
          fpViewmodel.rifleRig.position.y,
          adsY + (isMoving ? Math.sin(elapsed * 11) * 0.008 : 0),
          18,
          Math.max(dt, 0.016)
        );
        fpViewmodel.rifleRig.position.z = -0.44 + recoilKick;

        const isReloading =
          combatRef.current.firearmState === FirearmState.RELOAD_TACTICAL ||
          combatRef.current.firearmState === FirearmState.RELOAD_DRY;
        fpViewmodel.rifleRig.rotation.z = isReloading ? 0.42 : 0;
        fpViewmodel.magazineMesh.position.y = isReloading
          ? -0.14 -
            Math.sin(
              (combatRef.current.reloadTimerSec /
                Math.max(0.1, combatRef.current.reloadDurationSec)) *
                Math.PI
            ) *
              0.18
          : -0.14;
        playerRig.rightArmPivot.rotation.x =
          Math.PI * 0.42 - camControllerRef.current.pitchRad * 0.7;
      } else {
        const st = combatRef.current.swordState;
        let slashYaw = -0.35;
        let slashPitch = 0.25;
        let slashZ = -0.48;
        if (st === SwordState.SLASH_1_ACTIVE || st === SwordState.SLASH_1_RECOVERY) {
          slashYaw = 0.85;
          slashPitch = -0.35;
        } else if (st === SwordState.SLASH_2_ACTIVE || st === SwordState.SLASH_2_RECOVERY) {
          slashYaw = -0.95;
          slashPitch = -0.25;
        } else if (st === SwordState.THRUST_3_ACTIVE) {
          slashYaw = 0.0;
          slashPitch = -0.85;
          slashZ = -0.82;
        }
        fpViewmodel.swordRig.rotation.y = THREE.MathUtils.damp(
          fpViewmodel.swordRig.rotation.y,
          slashYaw,
          24,
          Math.max(dt, 0.016)
        );
        fpViewmodel.swordRig.rotation.x = THREE.MathUtils.damp(
          fpViewmodel.swordRig.rotation.x,
          slashPitch,
          24,
          Math.max(dt, 0.016)
        );
        fpViewmodel.swordRig.position.z = THREE.MathUtils.damp(
          fpViewmodel.swordRig.position.z,
          slashZ,
          24,
          Math.max(dt, 0.016)
        );
        playerRig.rightArmPivot.rotation.x = Math.PI * 0.55 + slashPitch * 0.8;
        playerRig.rightArmPivot.rotation.y = slashYaw * 0.6;
      }

      // D. Update 3D Dual-Ray Ballistic Convergence Lines
      const showRays = showBallisticRaysRef.current;
      sightRayLine.visible = showRays;
      muzzleRayLine.visible = showRays;
      focalSphere.visible = showRays;
      if (showRays) {
        const sPos = sightRayGeo.attributes.position as THREE.BufferAttribute;
        sPos.setXYZ(0, camera.position.x, camera.position.y - 0.04, camera.position.z);
        sPos.setXYZ(
          1,
          telemetry.focalPointWorld.x,
          telemetry.focalPointWorld.y,
          telemetry.focalPointWorld.z
        );
        sPos.needsUpdate = true;

        const mPos = muzzleRayGeo.attributes.position as THREE.BufferAttribute;
        mPos.setXYZ(0, _muzzleWorld.x, _muzzleWorld.y, _muzzleWorld.z);
        mPos.setXYZ(
          1,
          telemetry.focalPointWorld.x,
          telemetry.focalPointWorld.y,
          telemetry.focalPointWorld.z
        );
        mPos.needsUpdate = true;

        focalSphere.position.set(
          telemetry.focalPointWorld.x,
          telemetry.focalPointWorld.y,
          telemetry.focalPointWorld.z
        );
      }

      // E. Update 3-Vehicle Consortium Convoy along Grand Avenue
      const positionHighwayVehicle = (obj3d: THREE.Object3D, hx: number) => {
        const hz = getHighwayCenterZ(hx);
        const nextHz = getHighwayCenterZ(hx + 1.8);
        const hy = sampleWalkableHeight(hx, hz);
        obj3d.position.set(hx, hy, hz);
        obj3d.rotation.y = Math.atan2(1.8, nextHz - hz) + Math.PI;
      };

      if (convoyHp > 0) {
        convoyX += 5.0 * dt;
        if (convoyX > PLAYABLE_HALF_EXTENT) convoyX = -PLAYABLE_HALF_EXTENT;

        positionHighwayVehicle(convoyLeadEscort.root, convoyX + 11.5);
        positionHighwayVehicle(convoyTruckMesh, convoyX);
        positionHighwayVehicle(convoyRearEscort.root, convoyX - 11.5);

        convoyLeadEscort.root.visible = true;
        convoyTruckMesh.visible = true;
        convoyRearEscort.root.visible = true;

        const wheelSpin = 5.0 * dt * 1.4;
        convoyLeadEscort.wheels.forEach((w) => (w.rotation.x -= wheelSpin));
        convoyRearEscort.wheels.forEach((w) => (w.rotation.x -= wheelSpin));
      } else {
        convoyDestroyedCooldown -= dt;
        if (convoyDestroyedCooldown <= 0) {
          convoyHp = CONVOY_MAX_HP;
          convoyX = -PLAYABLE_HALF_EXTENT;
          convoyLeadEscort.root.visible = true;
          convoyTruckMesh.visible = true;
          convoyRearEscort.root.visible = true;
          setConvoyStatusText('A fresh Consortium convoy entered Grand Avenue');
        }
      }

      // F. Update Squad Command Vehicle & Riflemen Formation (Supports Map-Clicked Coordinates!)
      const order = vehicleRef.current.currentOrder;
      let desiredVehX = _playerPos.x - 7.5;
      let desiredVehZ = _playerPos.z - 6.5;

      if (squadTargetRef.current && order === SquadOrder.SUPPRESS_SECTOR) {
        desiredVehX = squadTargetRef.current.x;
        desiredVehZ = squadTargetRef.current.z;
      } else if (order === SquadOrder.HOLD_OVERWATCH) {
        desiredVehX = squadVehicle.root.position.x;
        desiredVehZ = squadVehicle.root.position.z;
      } else if (order === SquadOrder.ASSAULT_CONVOY && convoyHp > 0) {
        desiredVehX = convoyX - 15;
        desiredVehZ = getHighwayCenterZ(desiredVehX) + 9.5;
      } else if (squadTargetRef.current) {
        desiredVehX = squadTargetRef.current.x;
        desiredVehZ = squadTargetRef.current.z;
      }

      const vdx = desiredVehX - squadVehicle.root.position.x;
      const vdz = desiredVehZ - squadVehicle.root.position.z;
      const vDist = Math.hypot(vdx, vdz);
      if (vDist > 3.2 && order !== SquadOrder.HOLD_OVERWATCH && dt > 0) {
        const prevVx = squadVehicle.root.position.x;
        const prevVz = squadVehicle.root.position.z;
        const step = Math.min(vDist, 6.8 * dt);
        squadVehicle.root.position.x += (vdx / vDist) * step;
        squadVehicle.root.position.z += (vdz / vDist) * step;

        staticPhysics.resolveHorizontalBody(
          squadVehicle.root.position,
          squadVehicle.root.position.y,
          2.8,
          1.85
        );

        squadVehicle.root.position.y = sampleWalkableHeight(
          squadVehicle.root.position.x,
          squadVehicle.root.position.z
        );
        const moveDx = squadVehicle.root.position.x - prevVx;
        const moveDz = squadVehicle.root.position.z - prevVz;
        const actualStep = Math.hypot(moveDx, moveDz);
        if (actualStep > 0.002) {
          squadVehicle.root.rotation.y = THREE.MathUtils.damp(
            squadVehicle.root.rotation.y,
            Math.atan2(-moveDx, -moveDz),
            4.5,
            dt
          );
          squadVehicle.wheels.forEach((w) => {
            w.rotation.x -= actualStep * 1.4;
          });
        }
      }

      squadRiflemen.forEach((op, idx) => {
        const anchorX =
          order === SquadOrder.HOLD_OVERWATCH || squadTargetRef.current
            ? squadVehicle.root.position.x + (idx - 1) * 3.8
            : _playerPos.x + (idx - 1) * 3.4 - _forwardFlat.x * 4.5;
        const anchorZ =
          order === SquadOrder.HOLD_OVERWATCH || squadTargetRef.current
            ? squadVehicle.root.position.z + 4.2
            : _playerPos.z + (idx - 1) * 1.8 - _forwardFlat.z * 4.5;
        const odx = anchorX - op.root.position.x;
        const odz = anchorZ - op.root.position.z;
        const odist = Math.hypot(odx, odz);
        if (odist > 1.2 && dt > 0) {
          const prevOx = op.root.position.x;
          const prevOz = op.root.position.z;
          const ostep = Math.min(odist, 6.6 * dt);
          op.root.position.x += (odx / odist) * ostep;
          op.root.position.z += (odz / odist) * ostep;

          staticPhysics.resolveHorizontalBody(op.root.position, op.root.position.y, 1.75, 0.45);
          resolveDynamicBoxCollision(
            op.root.position,
            op.root.position.y,
            0.45,
            squadVehicle.root.position.x,
            squadVehicle.root.position.y,
            squadVehicle.root.position.z,
            1.52,
            2.8,
            3.28,
            squadVehicle.root.rotation.y
          );
          staticPhysics.resolveHorizontalBody(op.root.position, op.root.position.y, 1.75, 0.45);

          op.root.position.y = sampleCitySupport(op.root.position.x, op.root.position.z, op.root.position.y);
          const actualMove = Math.hypot(op.root.position.x - prevOx, op.root.position.z - prevOz);
          if (actualMove > 0.002) {
            op.root.rotation.y = Math.atan2(
              -(op.root.position.x - prevOx),
              -(op.root.position.z - prevOz)
            );
            op.leftLegPivot.rotation.x = Math.sin(elapsed * 9 + idx) * 0.4;
            op.rightLegPivot.rotation.x = -Math.sin(elapsed * 9 + idx) * 0.4;
          } else {
            op.leftLegPivot.rotation.x = 0;
            op.rightLegPivot.rotation.x = 0;
          }
        } else {
          op.leftLegPivot.rotation.x = 0;
          op.rightLegPivot.rotation.x = 0;
        }
      });

      // Friendly APC 30mm Autocannon Fire (Requires Clear Non-Occluded Line-of-Sight)
      squadFireAccum += dt;
      if (squadFireAccum >= 0.72 && dt > 0) {
        squadFireAccum = 0;
        squadVehicle.turretGroup.getWorldPosition(_tmpVecA);
        const liveEnemy = enemies.find((e) => {
          if (!e.alive || (e.kind !== 'STREET' && e.kind !== 'WAVE')) return false;
          if (e.rig.root.position.distanceTo(squadVehicle.root.position) >= 64) return false;
          _tmpVecD.set(
            e.rig.root.position.x,
            e.rig.root.position.y + 1.15,
            e.rig.root.position.z
          );
          return staticPhysics.hasLineOfSight(_tmpVecA, _tmpVecD, sampleWalkableHeight);
        });
        if (liveEnemy) {
          _tmpVecB
            .subVectors(liveEnemy.rig.root.position, _tmpVecA)
            .setY(liveEnemy.rig.root.position.y + 1.1 - _tmpVecA.y)
            .normalize();
          squadVehicle.turretGroup.rotation.y =
            Math.atan2(-_tmpVecB.x, -_tmpVecB.z) - squadVehicle.root.rotation.y;
          _tmpVecC.copy(_tmpVecA).addScaledVector(_tmpVecB, 1.85);
          spawnTracer(_tmpVecC, _tmpVecB, true, 18);
        }
      }

      // G. Mission director + enemy AI (street patrols, floor garrisons, guards, targets, assault waves)
      const playerBuilding = findBuildingAt(_playerPos.x, _playerPos.z, 0.1);
      const playerFloor = playerBuilding ? getFloorAt(playerBuilding, _playerPos.y) : -1;
      if (!simPausedRef.current) {
        updateDirector(dt, playerBuilding, playerFloor, !!keysDown['KeyE'], detonateJustPressed);
      }
      detonateJustPressed = false;

      if (dt > 0) {
        streetSlots.forEach((slot, idx) => {
          const dist = Math.hypot(slot.x - _playerPos.x, slot.z - _playerPos.z);
          if (!slot.enemy) {
            slot.respawn -= dt;
            if (slot.respawn <= 0 && dist > 50 && dist < 105) {
              slot.enemy = spawnEnemy({ kind: 'STREET', x: slot.x, z: slot.z, y: 0, bounds: null, floor: 0 });
              streetSlotOf.set(slot.enemy, idx);
            }
          } else if (dist > 135) {
            streetSlotOf.delete(slot.enemy);
            despawnEnemy(slot.enemy);
            slot.enemy = null;
            slot.respawn = 0;
          }
        });
      }

      const playerIndoors = playerBuilding !== null;
      enemies.forEach((enemy, idx) => {
        if (!enemy.alive || dt <= 0) return;
        const pos = enemy.rig.root.position;
        const distToPlayer = pos.distanceTo(_playerPos);
        if (distToPlayer > 125) return;

        const outdoorKind = enemy.kind === 'STREET' || enemy.kind === 'WAVE';
        const engageRange = outdoorKind && !playerIndoors ? 55 : 34;
        enemy.losTimer -= dt;
        if (enemy.losTimer <= 0) {
          enemy.losTimer = 0.25;
          if (distToPlayer < engageRange) {
            _tmpVecA.set(pos.x, pos.y + 1.45, pos.z);
            _tmpVecD.set(_playerPos.x, _playerPos.y + 1.3, _playerPos.z);
            enemy.hasLos = staticPhysics.hasLineOfSight(_tmpVecA, _tmpVecD, sampleWalkableHeight);
          } else {
            enemy.hasLos = false;
          }
        }

        // Movement
        let tx = pos.x;
        let tz = pos.z;
        let speed = 1.6;
        if (enemy.chase) {
          if (distToPlayer > 13) {
            tx = _playerPos.x;
            tz = _playerPos.z;
            speed = 3.6;
          }
        } else if (enemy.hasLos && distToPlayer < 22 && enemy.kind !== 'STREET') {
          if (distToPlayer > 6) {
            tx = _playerPos.x;
            tz = _playerPos.z;
            speed = 2.6;
          }
        } else {
          enemy.patrolPhase += dt * 0.6;
          tx = enemy.patrolOrigin.x + Math.sin(enemy.patrolPhase + idx * 1.7) * 3.2;
          tz = enemy.patrolOrigin.z + Math.cos(enemy.patrolPhase * 0.85 + idx * 2.1) * 2.6;
        }
        if (enemy.bounds) {
          tx = THREE.MathUtils.clamp(tx, enemy.bounds.minX, enemy.bounds.maxX);
          tz = THREE.MathUtils.clamp(tz, enemy.bounds.minZ, enemy.bounds.maxZ);
        }
        const mdx = tx - pos.x;
        const mdz = tz - pos.z;
        const mDist = Math.hypot(mdx, mdz);
        const moving = mDist > 0.08;
        if (moving) {
          const stepLen = Math.min(mDist, speed * dt);
          pos.x += (mdx / mDist) * stepLen;
          pos.z += (mdz / mDist) * stepLen;
        }
        staticPhysics.resolveHorizontalBody(pos, enemy.floorY, 1.75, 0.45);
        if (outdoorKind) {
          resolveDynamicBoxCollision(
            pos,
            pos.y,
            0.45,
            squadVehicle.root.position.x,
            squadVehicle.root.position.y,
            squadVehicle.root.position.z,
            1.52,
            2.8,
            3.28,
            squadVehicle.root.rotation.y
          );
          staticPhysics.resolveHorizontalBody(pos, enemy.floorY, 1.75, 0.45);
        }
        pos.y = enemy.floorY;
        const legSwing = moving ? Math.sin(elapsed * 7 + idx) * 0.38 : 0;
        enemy.rig.leftLegPivot.rotation.x = legSwing;
        enemy.rig.rightLegPivot.rotation.x = -legSwing;

        if (enemy.hasLos) {
          enemy.rig.root.rotation.y = Math.atan2(-(_playerPos.x - pos.x), -(_playerPos.z - pos.z));
          enemy.fireTimer -= dt;
          if (enemy.fireTimer <= 0) {
            enemy.fireTimer = (enemy.kind === 'HVT' ? 0.85 : 1.35) + Math.random() * 0.9;
            _tmpVecA.set(pos.x, pos.y + 1.45, pos.z);
            const spread = 0.5 + distToPlayer * 0.03;
            _tmpVecB
              .set(
                _playerPos.x - pos.x + (Math.random() - 0.5) * spread * 2,
                _playerPos.y + 1.15 - _tmpVecA.y + (Math.random() - 0.5) * spread,
                _playerPos.z - pos.z + (Math.random() - 0.5) * spread * 2
              )
              .normalize();
            spawnTracer(_tmpVecA, _tmpVecB, false, enemy.damage);
          }
        } else if (moving) {
          enemy.rig.root.rotation.y = Math.atan2(-mdx, -mdz);
        }
      });

      // Helper: closest distance squared from 3D point `target` to ray segment [origin, origin + dir * segLen]
      const segmentHitsSphere = (
        origin: THREE.Vector3,
        dir: THREE.Vector3,
        segLen: number,
        target: THREE.Vector3,
        radius: number
      ): number | null => {
        const rx = target.x - origin.x;
        const ry = target.y - origin.y;
        const rz = target.z - origin.z;
        const proj = THREE.MathUtils.clamp(rx * dir.x + ry * dir.y + rz * dir.z, 0, segLen);
        const cx = origin.x + dir.x * proj - target.x;
        const cy = origin.y + dir.y * proj - target.y;
        const cz = origin.z + dir.z * proj - target.z;
        if (cx * cx + cy * cy + cz * cz <= radius * radius) {
          return proj;
        }
        return null;
      };

      // H. Zero-GC Tracer Bolts & Non-Phaseable Static Obstacle / Vehicle / Actor Ballistics
      for (let i = tracers.length - 1; i >= 0; i--) {
        const tr = tracers[i];
        tr.life -= dt;
        const speed = tr.velocity.length();
        const stepDist = speed * dt;
        _velDir.copy(tr.velocity).divideScalar(Math.max(0.001, speed));

        // 1. Exact continuous raycast against ALL static trees, rocks, bridges, walls, bunkers & crates
        const staticHit = staticPhysics.raycast(tr.mesh.position, _velDir, stepDist + 0.08);
        const maxActorDist = staticHit ? staticHit.distance : stepDist;

        _bulletRay.set(tr.mesh.position, _velDir);
        _bulletRay.near = 0;
        _bulletRay.far = maxActorDist + 0.15;

        let consumed = false;

        if (tr.isFriendly) {
          if (convoyHp > 0 && maxActorDist > 0.01) {
            const truckHits = _bulletRay.intersectObjects(
              [convoyTruckMesh, convoyLeadEscort.root, convoyRearEscort.root],
              true
            );
            if (truckHits.length > 0 && truckHits[0].distance <= maxActorDist + 0.1) {
              consumed = true;
              spawnImpactSparks(truckHits[0].point, 4, false);
              convoyHp -= tr.damage;
              if (convoyHp <= 0) {
                convoyKilledThisFrame = true;
                audioEngine.playExplosion();
                camControllerRef.current.applyCombatImpulse(0.04, 0, 0.25);
                spawnImpactSparks(convoyTruckMesh.position, 18, true);
                convoyLeadEscort.root.visible = false;
                convoyTruckMesh.visible = false;
                convoyRearEscort.root.visible = false;
                convoyDestroyedCooldown = 24.0;

                const dropCrateMesh = buildSalvageTechCrate();
                const dropPos = { x: convoyX, z: getHighwayCenterZ(convoyX) };
                staticPhysics.resolveHorizontalBody(
                  dropPos,
                  sampleWalkableHeight(dropPos.x, dropPos.z),
                  1.0,
                  0.9
                );
                const dropY = sampleWalkableHeight(dropPos.x, dropPos.z);
                dropCrateMesh.position.set(dropPos.x, dropY, dropPos.z);
                scene.add(dropCrateMesh);
                const crateId = `crate-${Date.now()}`;
                registerCrateCollider(crateId, dropPos.x, dropY, dropPos.z);
                droppedCrates.push({
                  id: crateId,
                  mesh: dropCrateMesh,
                  collected: false,
                });
                setConvoyStatusText(
                  'Convoy destroyed — salvage crate dropped on Grand Avenue (press E)'
                );
              }
            }
          }

          if (!consumed && maxActorDist > 0.01) {
            // Friendly bullets also stop on Squad APC hull instead of phasing through it
            const apcHits = _bulletRay.intersectObject(squadVehicle.root, true);
            const apcStopDist =
              apcHits.length > 0 && apcHits[0].distance <= maxActorDist
                ? apcHits[0].distance
                : maxActorDist;

            for (const enemy of enemies) {
              if (!enemy.alive) continue;
              _tmpVecA.copy(enemy.rig.root.position).setY(enemy.rig.root.position.y + 1.0);
              const hitProj = segmentHitsSphere(
                tr.mesh.position,
                _velDir,
                apcStopDist,
                _tmpVecA,
                0.85
              );
              if (hitProj !== null) {
                consumed = true;
                _tmpVecC.copy(tr.mesh.position).addScaledVector(_velDir, hitProj);
                spawnImpactSparks(_tmpVecC, 5, false);
                enemy.hp -= tr.damage;
                if (enemy.hp <= 0) killEnemy(enemy);
                break;
              }
            }

            if (!consumed && apcHits.length > 0 && apcHits[0].distance <= maxActorDist) {
              consumed = true;
              spawnImpactSparks(apcHits[0].point, 3, false);
            }
          }
        } else if (maxActorDist > 0.01) {
          _tmpVecA.copy(squadVehicle.root.position).setY(squadVehicle.root.position.y + 1.3);
          const apcProj = segmentHitsSphere(
            tr.mesh.position,
            _velDir,
            maxActorDist,
            _tmpVecA,
            2.35
          );
          if (apcProj !== null) {
            consumed = true;
            _tmpVecC.copy(tr.mesh.position).addScaledVector(_velDir, apcProj);
            spawnImpactSparks(_tmpVecC, 3, false);
            if (vehicleRef.current.apsCharges > 0) {
              vehicleRef.current.apsCharges -= 1;
            } else {
              const mitigated = Math.max(
                1,
                Math.round(tr.damage * (1 - vehicleRef.current.kineticMitigation))
              );
              if (vehicleRef.current.armorPlatingHp > 0) {
                vehicleRef.current.armorPlatingHp = Math.max(
                  0,
                  vehicleRef.current.armorPlatingHp - mitigated
                );
              } else {
                vehicleRef.current.hullHp = Math.max(120, vehicleRef.current.hullHp - mitigated);
              }
            }
          } else {
            _tmpVecB.copy(_playerPos).setY(_playerPos.y + 1.1);
            const playerProj = segmentHitsSphere(
              tr.mesh.position,
              _velDir,
              maxActorDist,
              _tmpVecB,
              0.75
            );
            if (playerProj !== null) {
              consumed = true;
              camControllerRef.current.applyCombatImpulse(0.018, 0, 0.08);
              applyIncomingPlayerDamage(combatRef.current, tr.damage, 0.35);
              d.tookDamage = true;
              if (combatRef.current.hp <= 0) {
                // Going down sends you back to the safehouse; the current step restarts.
                handlePlayerDown();
                playerRig.root.position.copy(_playerPos);
              }
            }
          }
        }

        // If bullet hit a static tree, rock, bridge, wall, bunker, or crate before any actor, stop & spark!
        if (!consumed && staticHit) {
          consumed = true;
          _tmpVecC.set(staticHit.pointX, staticHit.pointY, staticHit.pointZ);
          spawnImpactSparks(_tmpVecC, 4, false);
        }

        if (!consumed) {
          tr.mesh.position.addScaledVector(tr.velocity, dt);
        }
        const terrY = sampleWalkableHeight(tr.mesh.position.x, tr.mesh.position.z);
        if (consumed || tr.life <= 0 || tr.mesh.position.y < terrY) {
          if (!consumed && tr.mesh.position.y < terrY) {
            spawnImpactSparks(tr.mesh.position, 3, false);
          }
          scene.remove(tr.mesh);
          tracers.splice(i, 1);
        }
      }

      // Advance Impact Sparks & Explosion Fireballs
      for (let i = impactBursts.length - 1; i >= 0; i--) {
        const b = impactBursts[i];
        b.life -= dt;
        b.velocity.y -= 14.0 * dt;
        b.mesh.position.addScaledVector(b.velocity, dt);
        const s = Math.max(0.05, b.mesh.scale.x + b.scaleRate * dt);
        b.mesh.scale.setScalar(s);
        if (b.life <= 0) {
          scene.remove(b.mesh);
          impactBursts.splice(i, 1);
        }
      }

      // Remove fallen enemies (deferred so combat loops never splice mid-iteration).
      for (let i = enemies.length - 1; i >= 0; i--) {
        if (!enemies[i].alive) despawnEnemy(enemies[i]);
      }

      // I. Proximity prompts: mission actions, loot crates, safehouse rest, APC resupply, convoy salvage
      let activePrompt: string | null = directorPrompt;
      const gunSpecNow = FACTION_PRIMARY_FIREARMS[factionRef.current];

      if (!activePrompt && playerBuilding) {
        for (const l of playerBuilding.loot) {
          if (l.floor !== playerFloor || appliedLooted.has(l.id)) continue;
          if (Math.hypot(l.x - _playerPos.x, l.z - _playerPos.z) < 1.9) {
            activePrompt = `Press [E] to search ${LOOT_LABEL[l.kind]}`;
            if (interactJustPressed) {
              const reward = rollLootReward(l.kind, Math.random());
              const c = combatRef.current;
              c.reserveAmmo = Math.min(gunSpecNow.maxReserveAmmo, c.reserveAmmo + reward.ammo);
              c.medkitsRemaining = Math.min(c.medkitMax, c.medkitsRemaining + reward.medkits);
              c.armorIntegrity = Math.min(c.maxArmorIntegrity, c.armorIntegrity + reward.armor);
              if (reward.ammo > 0) c.autoSwitchedOnZeroAmmo = false;
              appliedLooted.add(l.id);
              city.hideLoot(l.id);
              audioEngine.playReloadClick();
              callbacksRef.current.onLoot(l.id, reward);
            }
            break;
          }
        }
      }

      if (!activePrompt && playerBuilding === safehouse && campaignRef.current.completedMissionIds.includes('m01')) {
        activePrompt = 'Press [E] to rest at the safehouse — full health, ammo and medkits';
        if (interactJustPressed) {
          const c = combatRef.current;
          c.hp = c.maxHp;
          c.armorIntegrity = c.maxArmorIntegrity;
          c.medkitsRemaining = c.medkitMax;
          c.reserveAmmo = Math.max(c.reserveAmmo, gunSpecNow.initialReserveAmmo);
          c.healthStatus = HealthStatus.NOMINAL;
          c.autoSwitchedOnZeroAmmo = false;
          audioEngine.playMedkitApply();
          callbacksRef.current.onToast('Rested at Kestrel Row. Fully resupplied.');
        }
      }

      for (const crate of droppedCrates) {
        if (activePrompt || crate.collected) continue;
        const dist = crate.mesh.position.distanceTo(_playerPos);
        if (dist < 4.8) {
          activePrompt = 'Press [E] to salvage the convoy crate';
          if (interactJustPressed) {
            crate.collected = true;
            crate.mesh.visible = false;
            staticPhysics.setColliderActive(crate.id, false);
            audioEngine.playRetrofitInstall();
            callbacksRef.current.onLootConvoyCrate();
          }
        }
      }

      if (!activePrompt && squadVehicle.root.position.distanceTo(_playerPos) < 5.6) {
        const sinceResupply = simTime - lastResupplyAt;
        const ready = canResupplyAtApc(sinceResupply);
        activePrompt = ready
          ? `Press [E] at ${vehicleRef.current.callsign} to resupply ammo & armor and install upgrades`
          : `Press [E] at ${vehicleRef.current.callsign} to install upgrades · resupply in ${Math.ceil(APC_RESUPPLY_COOLDOWN_SEC - sinceResupply)} s`;
        if (interactJustPressed) {
          if (ready) {
            lastResupplyAt = simTime;
            combatRef.current = {
              ...combatRef.current,
              reserveAmmo: Math.max(combatRef.current.reserveAmmo, gunSpecNow.initialReserveAmmo),
              armorIntegrity: 100,
              autoSwitchedOnZeroAmmo: false,
            };
          }
          audioEngine.playRetrofitInstall();
          callbacksRef.current.onQuickRetrofitNextNode(ready);
        }
      }

      interactJustPressed = false;

      // Waypoint beam follows the current mission target
      if (directorWaypoint && Math.hypot(directorWaypoint.x - _playerPos.x, directorWaypoint.z - _playerPos.z) > 14) {
        waypointBeam.visible = true;
        waypointBeam.position.set(directorWaypoint.x, directorWaypoint.y, directorWaypoint.z);
      } else {
        waypointBeam.visible = false;
      }

      // Sync React HUD & Minimap at ~15Hz
      uiSyncAccum += Math.max(dt, 0.016);
      if (uiSyncAccum >= 0.066) {
        uiSyncAccum = 0;
        setCamTelemetry(telemetry);
        setPlayerState({ ...combatRef.current });
        setVehicleState({ ...vehicleRef.current });
        setNearbyPrompt(activePrompt);

        const pCoords = { x: _playerPos.x, z: _playerPos.z, y: _playerPos.y, yaw };
        const vCoords = {
          x: squadVehicle.root.position.x,
          z: squadVehicle.root.position.z,
        };
        const cCoords = {
          x: convoyX,
          z: getHighwayCenterZ(convoyX),
          intact: convoyHp > 0,
        };
        setMinimapState({ player: pCoords, vehicle: vCoords, convoy: cCoords });
        callbacksRef.current.onSyncLiveCoords(pCoords, vCoords, cCoords);

        directorHud.locationLabel = playerBuilding
          ? `${playerBuilding.name} · Floor ${playerFloor + 1} of ${playerBuilding.floors}`
          : 'Streets of Varos-Meridian';
        setMissionHud({ ...directorHud });
        setMapWaypoint(directorWaypoint ? { x: directorWaypoint.x, z: directorWaypoint.z } : null);

        if (directorWaypoint) {
          _projPin.set(directorWaypoint.x, directorWaypoint.y + 2.4, directorWaypoint.z);
          const distM = Math.round(_projPin.distanceTo(_playerPos));
          _projPin.project(camera);
          const inFront = _projPin.z < 1.0;
          const xPct = THREE.MathUtils.clamp((_projPin.x * 0.5 + 0.5) * 100, 6, 94);
          const yPct = THREE.MathUtils.clamp((-_projPin.y * 0.5 + 0.5) * 100, 10, 82);
          setPinnedHudProj({
            visible: inFront,
            xPct,
            yPct,
            distMeters: distM,
            title: directorHud.stepText,
          });
        } else {
          setPinnedHudProj((prev) => (prev.visible ? { ...prev, visible: false } : prev));
        }
      }

      renderer.render(scene, camera);
      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    }

    frameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      for (let i = enemies.length - 1; i >= 0; i--) despawnEnemy(enemies[i]);
      city.dispose();
      matLib.dispose();
      renderer.dispose();
    };
  }, []);

  const gunSpec = FACTION_PRIMARY_FIREARMS[faction];
  const swordSpec = FACTION_EMERGENCY_SWORDS[faction];
  const currentStep = getCurrentStep(campaign);
  const targetBuildingId = getStepBuilding(currentStep)?.id ?? null;
  const missionsDone = campaign.completedMissionIds.length;

  const availableUpgrades = techNodes.filter(
    (n) => n.stage !== RetrofitStage.FIELD_RETROFITTED
  );
  const readyUpgrades = availableUpgrades.filter(
    (n) => canAdvanceRetrofitStage(n, techNodes, salvageInventory).allowed
  );
  const nextUpgradeToDisplay = readyUpgrades[0] ?? availableUpgrades[0] ?? null;
  const equippedUpgradeCount = techNodes.length - availableUpgrades.length;

  const eraPlates =
    faction === FactionId.EAST
      ? salvageInventory.westernCompositePlates
      : salvageInventory.easternEraBlocks;

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#0B0E13] select-none">
      {/* Isolated WebGL Canvas Container */}
      <div ref={canvasMountRef} className="w-full h-full cursor-crosshair" />

      {/* Render Player HUD Only During Active Round */}
      {isRoundActive && !isMenuOpen && (
        <>
          {/* Projected 3D Screen-Space Waypoint & Cover Occlusion SVG Layer */}
          {(pinnedHudProj.visible || camTelemetry.muzzleBlockedByCover) && (
            <svg
              viewBox="0 0 1000 600"
              preserveAspectRatio="none"
              className="pointer-events-none absolute inset-0 w-full h-full z-10"
            >
              {pinnedHudProj.visible && (
                <g transform={`translate(${pinnedHudProj.xPct * 10}, ${pinnedHudProj.yPct * 6})`}>
                  <rect
                    x="-95"
                    y="-26"
                    width="190"
                    height="20"
                    rx="4"
                    fill="#0D1219"
                    fillOpacity="0.92"
                    stroke="#38BDF8"
                    strokeOpacity="0.75"
                    strokeWidth="1"
                  />
                  <text
                    x="0"
                    y="-12.5"
                    textAnchor="middle"
                    fill="#7DD3FC"
                    fontSize="10"
                    fontFamily="monospace"
                  >
                    {pinnedHudProj.distMeters}m · {pinnedHudProj.title.length > 26 ? `${pinnedHudProj.title.slice(0, 25)}…` : pinnedHudProj.title}
                  </text>
                  <polygon
                    points="0,-2 6,4 0,10 -6,4"
                    fill="#38BDF8"
                    fillOpacity="0.25"
                    stroke="#38BDF8"
                    strokeWidth="1.5"
                  />
                </g>
              )}
              {camTelemetry.muzzleBlockedByCover && (
                <g
                  transform={`translate(${500 + camTelemetry.blockedImpactScreenNdc.x * 360}, ${
                    300 - camTelemetry.blockedImpactScreenNdc.y * 220
                  })`}
                >
                  <rect
                    x="-62"
                    y="-11"
                    width="124"
                    height="22"
                    rx="4"
                    fill="#0B0E13"
                    fillOpacity="0.92"
                    stroke="#EF4444"
                    strokeOpacity="0.7"
                    strokeWidth="1"
                  />
                  <text
                    x="0"
                    y="3.5"
                    textAnchor="middle"
                    fill="#EF4444"
                    fontSize="11"
                    fontWeight="700"
                    fontFamily="monospace"
                  >
                    × COVER BLOCK
                  </text>
                </g>
              )}
            </svg>
          )}

          {/* Center Crosshair */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative flex items-center justify-center">
              <div className="w-5 h-5 border border-white/75 rounded-full flex items-center justify-center">
                <div className="w-1 h-1 bg-[#F59E0B] rounded-full" />
              </div>
              <div className="absolute -top-2.5 w-px h-2 bg-white/70" />
              <div className="absolute -bottom-2.5 w-px h-2 bg-white/70" />
              <div className="absolute -left-2.5 h-px w-2 bg-white/70" />
              <div className="absolute -right-2.5 h-px w-2 bg-white/70" />
            </div>
          </div>

          {/* Top-Left: Map & Current Target Order */}
          <div className="absolute top-4 left-4 flex items-start gap-3 z-10">
            <button
              type="button"
              onClick={onToggleMenu}
              title="Open Bigger Map & Active Target [M]"
              className="w-40 h-40 rounded-lg bg-[#0D1219]/95 border border-slate-700/85 p-1.5 relative overflow-hidden hover:border-[#F59E0B] transition-colors cursor-pointer"
            >
              <CityMapView
                playerCoords={minimapState.player}
                vehicleCoords={minimapState.vehicle}
                squadTargetCoords={squadTargetCoords}
                convoyCoords={minimapState.convoy}
                waypoint={mapWaypoint}
                targetBuildingId={targetBuildingId}
                destroyedBuildingIds={campaign.destroyedBuildingIds}
                compactMinimap
              />
              <div className="absolute bottom-1.5 left-2 right-2 flex justify-between items-center bg-[#090D12]/90 px-1.5 py-0.5 rounded text-[10px] font-mono text-slate-200 tabular-nums">
                <span>{missionsDone}/{MISSIONS.length}</span>
                <span className="text-[#F59E0B] font-semibold">[M] MAP</span>
              </div>
            </button>

            <div className="pointer-events-none bg-[#0D1219]/92 border border-slate-700/80 rounded-lg px-3.5 py-2.5 text-xs space-y-1.5 w-80">
              <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-[#F59E0B]">
                <span className="flex items-center gap-1 font-semibold truncate">
                  <Target className="w-3.5 h-3.5 shrink-0" />
                  {missionHud.missionLabel.toUpperCase()}
                </span>
                {pinnedHudProj.distMeters > 0 && missionHud.stepText && (
                  <span className="text-sky-300 tabular-nums shrink-0">{pinnedHudProj.distMeters}m</span>
                )}
              </div>
              <div className="font-semibold text-white leading-snug">{missionHud.stepText}</div>
              {missionHud.detail && <div className="text-[11px] text-slate-300">{missionHud.detail}</div>}
              {missionHud.progress !== null && (
                <div className="h-1.5 bg-slate-800 rounded overflow-hidden">
                  <div
                    className="h-full bg-[#F59E0B] transition-[width] duration-150"
                    style={{ width: `${Math.round(Math.max(0, Math.min(1, missionHud.progress)) * 100)}%` }}
                  />
                </div>
              )}
              <div className="text-[11px] text-slate-400 flex items-center gap-1.5 truncate">
                <Building2 className="w-3 h-3 shrink-0" />
                <span className="truncate">{missionHud.locationLabel}</span>
              </div>
              <div className="text-[11px] text-slate-500 truncate">{convoyStatusText}</div>
            </div>
          </div>

          {/* Contextual Interaction Prompt */}
          {nearbyPrompt && (
            <div className="pointer-events-none absolute bottom-36 left-1/2 -translate-x-1/2 bg-[#0D1219]/95 border border-[#F59E0B]/70 text-white px-4 py-2 rounded-lg text-xs font-medium shadow-lg z-20">
              {nearbyPrompt}
            </div>
          )}

          {playerState.autoSwitchedOnZeroAmmo &&
            playerState.equippedSlot === WeaponSlot.EMERGENCY_SWORD && (
              <div className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 bg-[#3A1216]/95 border border-[#EF4444]/70 text-red-100 px-4 py-1.5 rounded-lg text-xs font-mono z-20">
                OUT OF AMMO — DREW {swordSpec.designation.toUpperCase()}
              </div>
            )}

          {/* Player HUD Dock: Health, Armor Health, Ammo, Available Upgrades & Controls */}
          <div
            className={`absolute bottom-4 left-1/2 -translate-x-1/2 w-[min(1060px,95vw)] transition-transform duration-200 z-20 ${
              dockCollapsed ? 'translate-y-[calc(100%-32px)]' : 'translate-y-0'
            }`}
          >
            <div className="flex justify-center mb-1.5">
              <button
                type="button"
                onClick={() => setDockCollapsed((prev) => !prev)}
                className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-[#0D1219]/95 border border-slate-700/80 text-xs text-slate-300 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {dockCollapsed ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
                <span>{dockCollapsed ? 'Show HUD & Controls [H]' : 'Hide Controls [H]'}</span>
              </button>
            </div>

            <div className="bg-[#0D1219]/95 border border-slate-700/85 rounded-xl p-3.5 shadow-2xl space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                {/* 1. Health & Armor Health */}
                <div className="space-y-2">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-300 font-medium flex items-center gap-1.5">
                        <HeartPulse className="w-3.5 h-3.5 text-[#EF4444]" />
                        Health
                      </span>
                      <span className="font-mono font-semibold text-white tabular-nums">
                        {Math.round(playerState.hp)} / {playerState.maxHp} HP · Medkit [4] ×
                        {playerState.medkitsRemaining}
                      </span>
                    </div>
                    <svg
                      viewBox="0 0 100 6"
                      preserveAspectRatio="none"
                      className="w-full h-1.5 bg-slate-800 rounded overflow-hidden block"
                    >
                      <rect
                        x="0"
                        y="0"
                        width={Math.max(0, Math.min(100, (playerState.hp / playerState.maxHp) * 100))}
                        height="6"
                        fill={playerState.hp <= 30 ? '#EF4444' : '#10B981'}
                      />
                    </svg>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-300 font-medium flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-sky-400" />
                        Armor Health
                      </span>
                      <span className="font-mono font-semibold text-sky-300 tabular-nums">
                        Plate {Math.round(playerState.armorIntegrity)}% · APC{' '}
                        {vehicleState.armorPlatingHp}/{vehicleState.maxArmorPlatingHp}
                      </span>
                    </div>
                    <svg
                      viewBox="0 0 100 6"
                      preserveAspectRatio="none"
                      className="w-full h-1.5 bg-slate-800 rounded overflow-hidden block"
                    >
                      <rect
                        x="0"
                        y="0"
                        width={Math.max(0, Math.min(100, playerState.armorIntegrity))}
                        height="6"
                        fill="#38BDF8"
                      />
                    </svg>
                  </div>
                </div>

                {/* 2. Ammo & Equipped Weapon */}
                <div className="space-y-1.5 border-y md:border-y-0 md:border-x border-slate-800 py-2 md:py-0 md:px-4">
                  {playerState.equippedSlot === WeaponSlot.PRIMARY_FIREARM ? (
                    <>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-300 font-medium truncate">
                          {gunSpec.designation}
                        </span>
                        <span className="text-[11px] font-mono text-slate-400">AMMO</span>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="font-mono text-2xl font-bold text-[#F59E0B] tabular-nums">
                          {playerState.magazineAmmo}{' '}
                          <span className="text-sm font-normal text-slate-400">
                            / {playerState.reserveAmmo}
                          </span>
                        </span>
                        <span className="text-[11px] font-mono text-slate-400">
                          {playerState.firearmState === FirearmState.RELOAD_TACTICAL ||
                          playerState.firearmState === FirearmState.RELOAD_DRY
                            ? 'RELOADING...'
                            : '[R] Reload · [2] Sword'}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-[#F59E0B] truncate flex items-center gap-1.5">
                          <Sword className="w-3.5 h-3.5" />
                          {swordSpec.designation}
                        </span>
                        <span className="text-[11px] font-mono text-slate-400">BLADE</span>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="font-mono text-xl font-bold text-white tabular-nums">
                          {Math.round(playerState.swordDurability)}% Edge
                        </span>
                        <span className="text-[11px] font-mono text-slate-400">[1] Rifle</span>
                      </div>
                    </>
                  )}
                </div>

                {/* 3. Available Upgrades */}
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300 font-medium flex items-center gap-1.5">
                      <Wrench className="w-3.5 h-3.5 text-[#F59E0B]" />
                      Available Upgrades ({equippedUpgradeCount}/{techNodes.length})
                    </span>
                    <button
                      type="button"
                      onClick={onToggleMenu}
                      className="text-[11px] font-mono font-semibold text-[#F59E0B] hover:underline cursor-pointer"
                    >
                      Open [M]
                    </button>
                  </div>

                  {nextUpgradeToDisplay ? (
                    <div className="text-[11px] text-slate-200 truncate">
                      Next: <span className="font-semibold">{nextUpgradeToDisplay.name}</span>{' '}
                      {readyUpgrades.length > 0 ? (
                        <span className="text-emerald-400 font-mono font-semibold">
                          (ready — press E at the APC)
                        </span>
                      ) : (
                        <span className="text-slate-400 font-mono">
                          (loot crates · finish missions)
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="text-[11px] text-emerald-400 font-medium">
                      All Unit Upgrades Equipped
                    </div>
                  )}

                  <div className="text-[11px] text-slate-400 font-mono tabular-nums">
                    Salvage: {salvageInventory.rawScrapAlloy} Alloy · {eraPlates} Plates ·{' '}
                    {salvageInventory.encryptedFireControlChips} Chips
                  </div>
                </div>
              </div>

              {/* Clean Controls Strip */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/90 text-[11px] font-mono text-slate-300">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>
                    <strong className="text-white">WASD</strong> Move
                  </span>
                  <span>
                    <strong className="text-white">Click</strong> Shoot
                  </span>
                  <span>
                    <strong className="text-white">RMB</strong> Aim
                  </span>
                  <span>
                    <strong className="text-[#F59E0B]">[C]</strong> 1st/3rd POV
                  </span>
                  <span>
                    <strong className="text-white">[Q]</strong> Shoulder
                  </span>
                  <span>
                    <strong className="text-white">[R]</strong> Reload
                  </span>
                  <span>
                    <strong className="text-white">[4]</strong> Heal
                  </span>
                  <span>
                    <strong className="text-white">[E]</strong> Search / Use (hold)
                  </span>
                  <span>
                    <strong className="text-white">[G]</strong> Detonate
                  </span>
                  <span>
                    <strong className="text-white">[F]</strong> Squad Order
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onToggleMenu}
                    className="px-3 py-1 rounded-md bg-[#F59E0B] hover:bg-amber-400 text-slate-950 text-xs font-sans font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <MapIcon className="w-3.5 h-3.5" />
                    <span>Map &amp; Target [M]</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const nextMute = !muted;
                      audioEngine.setMuted(nextMute);
                      setMuted(nextMute);
                    }}
                    aria-label={muted ? 'Unmute audio' : 'Mute audio'}
                    className="p-1.5 rounded-md bg-slate-800 text-slate-300 hover:text-white transition-colors shrink-0 cursor-pointer"
                  >
                    {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
