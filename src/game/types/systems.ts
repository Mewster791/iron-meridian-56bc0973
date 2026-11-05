export enum FactionId {
  EAST = 'EAST',
  WEST = 'WEST',
}

export enum PerspectiveMode {
  FIRST_PERSON = 'FIRST_PERSON',
  THIRD_PERSON = 'THIRD_PERSON',
}

export enum ShoulderSide {
  RIGHT = 1,
  LEFT = -1,
}

export enum WeaponSlot {
  PRIMARY_FIREARM = 'PRIMARY_FIREARM',
  EMERGENCY_SWORD = 'EMERGENCY_SWORD',
}

export enum FirearmState {
  IDLE = 'IDLE',
  FIRING = 'FIRING',
  RELOAD_TACTICAL = 'RELOAD_TACTICAL',
  RELOAD_DRY = 'RELOAD_DRY',
  DRY_EMPTY = 'DRY_EMPTY',
  HOLSTERED = 'HOLSTERED',
}

export enum SwordState {
  SHEATHED = 'SHEATHED',
  EMERGENCY_DRAW = 'EMERGENCY_DRAW',
  READY_STANCE = 'READY_STANCE',
  SLASH_1_STARTUP = 'SLASH_1_STARTUP',
  SLASH_1_ACTIVE = 'SLASH_1_ACTIVE',
  SLASH_1_RECOVERY = 'SLASH_1_RECOVERY',
  SLASH_2_STARTUP = 'SLASH_2_STARTUP',
  SLASH_2_ACTIVE = 'SLASH_2_ACTIVE',
  SLASH_2_RECOVERY = 'SLASH_2_RECOVERY',
  THRUST_3_STARTUP = 'THRUST_3_STARTUP',
  THRUST_3_ACTIVE = 'THRUST_3_ACTIVE',
  THRUST_3_RECOVERY = 'THRUST_3_RECOVERY',
  GUARD_PARRY = 'GUARD_PARRY',
}

export enum HealthStatus {
  NOMINAL = 'NOMINAL',
  DAMAGED = 'DAMAGED',
  CRITICAL = 'CRITICAL',
  APPLYING_MEDKIT = 'APPLYING_MEDKIT',
  INCAPACITATED = 'INCAPACITATED',
}

export enum SquadOrder {
  FOLLOW_WEDGE = 'FOLLOW_WEDGE',
  HOLD_OVERWATCH = 'HOLD_OVERWATCH',
  ASSAULT_CONVOY = 'ASSAULT_CONVOY',
  SUPPRESS_SECTOR = 'SUPPRESS_SECTOR',
}

export enum RetrofitStage {
  LOCKED_UNSEEN = 'LOCKED_UNSEEN',
  SALVAGE_CAPTURED = 'SALVAGE_CAPTURED',
  REVERSE_ENGINEERED = 'REVERSE_ENGINEERED',
  ADAPTER_FABRICATED = 'ADAPTER_FABRICATED',
  FIELD_RETROFITTED = 'FIELD_RETROFITTED',
}

export enum RetrofitCategory {
  VEHICLE_ARMOR = 'VEHICLE_ARMOR',
  ACTIVE_PROTECTION = 'ACTIVE_PROTECTION',
  FIRE_CONTROL_OPTICS = 'FIRE_CONTROL_OPTICS',
  SQUAD_ORDNANCE = 'SQUAD_ORDNANCE',
  ELECTRONIC_WARFARE = 'ELECTRONIC_WARFARE',
}

export enum TerrainBiome {
  ALPINE_PEAK = 'ALPINE_PEAK',
  ROCKY_RIDGE = 'ROCKY_RIDGE',
  FORESTED_SLOPE = 'FORESTED_SLOPE',
  CENTRAL_VALLEY = 'CENTRAL_VALLEY',
  RIVER_CHANNEL = 'RIVER_CHANNEL',
  HIGHWAY_CORRIDOR = 'HIGHWAY_CORRIDOR',
}

export enum ObjectiveArchetype {
  CONVOY_AMBUSH = 'CONVOY_AMBUSH',
  SAM_BATTERY_RAID = 'SAM_BATTERY_RAID',
  BRIDGE_INTERDICTION = 'BRIDGE_INTERDICTION',
  MOUNTAIN_RELAY_CAPTURE = 'MOUNTAIN_RELAY_CAPTURE',
  DEPOT_SALVAGE = 'DEPOT_SALVAGE',
  UAV_RECOVERY = 'UAV_RECOVERY',
  ARMOR_SPEARHEAD_HALT = 'ARMOR_SPEARHEAD_HALT',
  COMMS_BUNKER_BREACH = 'COMMS_BUNKER_BREACH',
}

export enum ObjectiveStatus {
  ACTIVE = 'ACTIVE',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
}

export interface CameraRigConfig {
  firstPersonEyeOffset: { x: number; y: number; z: number };
  thirdPersonPivotOffset: { x: number; y: number; z: number };
  thirdPersonArmLength: number;
  thirdPersonShoulderOffset: number;
  adsArmLength: number;
  adsShoulderOffset: number;
  fovFirstPerson: number;
  fovThirdPerson: number;
  fovAds: number;
  transitionSpeedLambda: number;
  collisionProbeRadius: number;
  collisionSnapInLambda: number;
  collisionRecoverOutLambda: number;
  minArmClamp: number;
  minConvergenceDistance: number;
  maxAimTraceDistance: number;
}

export interface CameraRigTelemetry {
  targetMode: PerspectiveMode;
  blendAlpha: number; // 0.0 = Pure 1st Person, 1.0 = Pure 3rd Person
  shoulderSide: ShoulderSide;
  isAimingDownSights: boolean;
  desiredArmLength: number;
  occludedArmLength: number;
  collisionActive: boolean;
  collisionNormal: { x: number; y: number; z: number };
  focalPointWorld: { x: number; y: number; z: number };
  focalDistance: number;
  muzzleOriginWorld: { x: number; y: number; z: number };
  convergentMuzzleDir: { x: number; y: number; z: number };
  parallaxAngleDeg: number;
  muzzleBlockedByCover: boolean;
  blockedImpactScreenNdc: { x: number; y: number };
}

export interface PrimaryFirearmSpec {
  id: string;
  designation: string;
  caliber: string;
  originFaction: FactionId;
  magazineCapacity: number;
  initialReserveAmmo: number;
  maxReserveAmmo: number;
  roundsPerMinute: number;
  muzzleVelocityMps: number;
  baseDamage: number;
  armorPenetrationRating: number;
  tacticalReloadSec: number;
  dryReloadSec: number;
  effectiveRangeMeters: number;
}

export interface MeleeSwordSpec {
  id: string;
  designation: string;
  steelGrade: string;
  maxDurability: number;
  durabilityLossPerHit: number;
  slash1Damage: number;
  slash2Damage: number;
  thrust3Damage: number;
  armorBypassRatio: number;
  reachMeters: number;
  cleaveArcDeg: number;
  startupWindowSec: number;
  activeCollisionWindowSec: number;
  recoveryWindowSec: number;
  comboChainGraceSec: number;
  emergencyAutoDrawSec: number;
}

export interface MedicalGearSpec {
  id: string;
  designation: string;
  initialCharges: number;
  maxCharges: number;
  instantHealHp: number;
  regenOverTimeHp: number;
  regenDurationSec: number;
  applicationTimeSec: number;
  moveSpeedMultiplierWhileApplying: number;
}

export interface PlayerCombatState {
  hp: number;
  maxHp: number;
  armorIntegrity: number;
  maxArmorIntegrity: number;
  healthStatus: HealthStatus;
  medkitsRemaining: number;
  medkitMax: number;
  medkitProgressSec: number;
  regenRemainingHp: number;

  equippedSlot: WeaponSlot;
  firearmState: FirearmState;
  magazineAmmo: number;
  magazineCapacity: number;
  reserveAmmo: number;
  fireCooldownSec: number;
  reloadTimerSec: number;
  reloadDurationSec: number;

  swordState: SwordState;
  swordDurability: number;
  swordMaxDurability: number;
  swordStateTimerSec: number;
  comboQueuedNext: boolean;
  activeHitEntitiesThisSwing: string[];
  autoSwitchedOnZeroAmmo: boolean;
}

export interface SalvageInventory {
  rawScrapAlloy: number;
  westernCompositePlates: number;
  easternEraBlocks: number;
  encryptedFireControlChips: number;
  milStdBusAdapters: number;
  ordnanceCells: number;
}

export interface RetrofitTechNode {
  id: string;
  code: string;
  name: string;
  originFaction: FactionId;
  usableByFaction: FactionId;
  category: RetrofitCategory;
  stage: RetrofitStage;
  sourceDescription: string;
  adapterEngineeringNote: string;
  costScrapAlloy: number;
  costArmorUnits: number;
  costControlChips: number;
  fabricationTimeSec: number;
  prerequisiteNodeIds: string[];
  statModifiers: {
    vehicleMaxArmorBonus: number;
    kineticMitigationBonus: number; // 0.0 - 0.60
    shapedChargeMitigationBonus: number; // ERA reactive bonus 0.0 - 0.75
    apsInterceptCharges: number;
    squadFirepowerMultiplier: number;
    weaponConvergenceBonus: number;
    chassisMassDeltaKg: number;
  };
  visualMeshFlag: 'ERA_TILES' | 'APS_RADAR' | 'THERMAL_MAST' | 'REMOTE_TURRET' | 'SQUAD_EXOS' | 'HYBRID_AMMO';
}

export interface TacticalUnitVehicleState {
  callsign: string;
  chassisDesignation: string;
  faction: FactionId;
  hullHp: number;
  maxHullHp: number;
  armorPlatingHp: number;
  maxArmorPlatingHp: number;
  kineticMitigation: number;
  shapedChargeMitigation: number;
  apsCharges: number;
  maxApsCharges: number;
  massKg: number;
  hasEraTiles: boolean;
  hasApsRadar: boolean;
  hasThermalMast: boolean;
  hasRemoteTurret: boolean;
  squadOperatorsAlive: number;
  squadMaxOperators: number;
  currentOrder: SquadOrder;
}

export interface TheaterObjective {
  uid: string;
  poolIndex: number; // 1..500
  runOrderIndex: number; // 1..50 when active in run
  title: string;
  archetype: ObjectiveArchetype;
  biome: TerrainBiome;
  worldX: number;
  worldY: number;
  worldZ: number;
  threatTier: 1 | 2 | 3 | 4;
  rewardScrap: number;
  rewardArmorUnits: number;
  rewardChips: number;
  unlocksTechHint: string;
  status: ObjectiveStatus;
}

export interface CombatLogEntry {
  id: string;
  timestamp: string;
  category: 'CAMERA' | 'COMBAT' | 'RETROFIT' | 'CONVOY' | 'OBJECTIVE';
  message: string;
}
