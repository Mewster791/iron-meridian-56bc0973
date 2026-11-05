import { MISSIONS, Mission, MissionStep } from './campaignData';
import { Building, LootKind, getBuildingEntrance, getCityLayout } from '../city/cityLayout';

export interface CampaignProgress {
  missionIndex: number;
  stepIndex: number;
  briefingSeen: boolean;
  /** Floors cleared for the current CLEAR_BUILDING step (persist across deaths). */
  clearedFloors: number[];
  completedMissionIds: string[];
  lootedIds: string[];
  destroyedBuildingIds: string[];
  dossiersFound: string[];
  deaths: number;
  playTimeSec: number;
}

/** Seconds between APC field resupplies. */
export const APC_RESUPPLY_COOLDOWN_SEC = 180;
/** Fraction of scrap alloy lost when the operator goes down. */
export const DEATH_SCRAP_PENALTY = 0.2;
/** Enemy toughness per act. */
export const ENEMY_HP_BY_ACT: Record<1 | 2 | 3, number> = { 1: 120, 2: 150, 3: 185 };
export const ENEMY_DAMAGE_BY_ACT: Record<1 | 2 | 3, number> = { 1: 10, 2: 12, 3: 14 };

export function createInitialCampaignProgress(): CampaignProgress {
  return {
    missionIndex: 0,
    stepIndex: 0,
    briefingSeen: false,
    clearedFloors: [],
    completedMissionIds: [],
    lootedIds: [],
    destroyedBuildingIds: [],
    dossiersFound: [],
    deaths: 0,
    playTimeSec: 0,
  };
}

export function isCampaignComplete(p: CampaignProgress): boolean {
  return p.missionIndex >= MISSIONS.length;
}

export function getCurrentMission(p: CampaignProgress): Mission | null {
  return MISSIONS[p.missionIndex] ?? null;
}

export function getCurrentStep(p: CampaignProgress): MissionStep | null {
  const m = getCurrentMission(p);
  return m ? (m.steps[p.stepIndex] ?? null) : null;
}

/** Returns a new progress with `floor` marked cleared (idempotent). */
export function markFloorCleared(p: CampaignProgress, floor: number): CampaignProgress {
  if (p.clearedFloors.includes(floor)) return p;
  return { ...p, clearedFloors: [...p.clearedFloors, floor].sort((a, b) => a - b) };
}

/** A building is only cleared once every one of its floors is cleared. */
export function isBuildingFullyCleared(clearedFloors: number[], building: Pick<Building, 'floors'>): boolean {
  for (let f = 0; f < building.floors; f++) {
    if (!clearedFloors.includes(f)) return false;
  }
  return true;
}

/**
 * A floor counts as cleared only when its hostiles are all down AND the operator
 * has physically been on it. Killing enemies through a window does not count.
 */
export function isFloorCleared(remainingHostiles: number, visitedByPlayer: boolean): boolean {
  return remainingHostiles <= 0 && visitedByPlayer;
}

/** Planting a charge or retrieving an item is locked until the floor's guards are down. */
export function canStartHoldAction(guardsRemaining: number): boolean {
  return guardsRemaining <= 0;
}

/** Hold-to-act progress. Releasing [E] or getting shot drains progress instead of keeping it. */
export function stepHoldProgress(progressSec: number, dt: number, holding: boolean, tookDamage: boolean): number {
  if (tookDamage) return 0;
  if (holding) return progressSec + dt;
  return Math.max(0, progressSec - dt * 2);
}

export function canDetonate(distanceToCharge: number, safeDistance: number): boolean {
  return distanceToCharge >= safeDistance;
}

/** DEFEND clock only runs while the operator is inside the zone. */
export function stepDefendTimer(elapsedSec: number, dt: number, insideZone: boolean): number {
  return insideZone ? elapsedSec + dt : elapsedSec;
}

export interface StepAdvanceResult {
  progress: CampaignProgress;
  completedMission: Mission | null;
}

/** Steps must be completed strictly in order; finishing the last step completes the mission. */
export function completeCurrentStep(p: CampaignProgress): StepAdvanceResult {
  const mission = getCurrentMission(p);
  if (!mission) return { progress: p, completedMission: null };
  const nextStep = p.stepIndex + 1;
  if (nextStep < mission.steps.length) {
    return { progress: { ...p, stepIndex: nextStep, clearedFloors: [] }, completedMission: null };
  }
  return {
    progress: {
      ...p,
      missionIndex: p.missionIndex + 1,
      stepIndex: 0,
      briefingSeen: false,
      clearedFloors: [],
      completedMissionIds: [...p.completedMissionIds, mission.id],
    },
    completedMission: mission,
  };
}

/**
 * Tester shortcut: progress as if every mission before `missionIndex` was played.
 * Earlier bomb targets stay destroyed; loot, dossiers, deaths and play time are kept.
 */
export function jumpToMission(p: CampaignProgress, missionIndex: number): CampaignProgress {
  const idx = Math.max(0, Math.min(MISSIONS.length, Math.floor(missionIndex)));
  const before = MISSIONS.slice(0, idx);
  const destroyed = new Set<string>();
  for (const m of before) {
    for (const s of m.steps) if (s.type === 'DETONATE' && s.buildingId) destroyed.add(s.buildingId);
  }
  return {
    ...p,
    missionIndex: idx,
    stepIndex: 0,
    briefingSeen: false,
    clearedFloors: [],
    completedMissionIds: before.map((m) => m.id),
    destroyedBuildingIds: [...destroyed],
  };
}

/** Tester shortcut: jump to a step inside the current mission. */
export function jumpToStep(p: CampaignProgress, stepIndex: number): CampaignProgress {
  const m = getCurrentMission(p);
  if (!m) return p;
  const idx = Math.max(0, Math.min(m.steps.length - 1, Math.floor(stepIndex)));
  return { ...p, stepIndex: idx, clearedFloors: [], briefingSeen: true };
}

/** Going down costs scrap and a walk back from the safehouse; cleared floors are kept as checkpoints. */
export function applyDeath(p: CampaignProgress, scrap: number): { progress: CampaignProgress; scrapAfter: number; scrapLost: number } {
  const scrapLost = Math.floor(scrap * DEATH_SCRAP_PENALTY);
  return { progress: { ...p, deaths: p.deaths + 1 }, scrapAfter: scrap - scrapLost, scrapLost };
}

export function canResupplyAtApc(secondsSinceLast: number): boolean {
  return secondsSinceLast >= APC_RESUPPLY_COOLDOWN_SEC;
}

export interface LootReward {
  ammo: number;
  medkits: number;
  armor: number;
  scrap: number;
  plates: number;
  chips: number;
  dossier: boolean;
  label: string;
}

export function rollLootReward(kind: LootKind, roll: number): LootReward {
  const base: LootReward = { ammo: 0, medkits: 0, armor: 0, scrap: 0, plates: 0, chips: 0, dossier: false, label: '' };
  switch (kind) {
    case 'AMMO': {
      const ammo = 30 + Math.floor(roll * 31);
      return { ...base, ammo, label: `+${ammo} rounds` };
    }
    case 'MEDKIT':
      return { ...base, medkits: 1, label: '+1 medkit' };
    case 'ARMOR': {
      const armor = 25 + Math.floor(roll * 26);
      return { ...base, armor, label: `+${armor}% plate armor` };
    }
    case 'SALVAGE': {
      const scrap = 6 + Math.floor(roll * 10);
      const plates = roll > 0.8 ? 1 : 0;
      const chips = roll > 0.93 ? 1 : 0;
      return { ...base, scrap, plates, chips, label: `+${scrap} alloy${plates ? ' · +1 plate' : ''}${chips ? ' · +1 chip' : ''}` };
    }
    case 'DOSSIER':
      return { ...base, scrap: 10, dossier: true, label: 'Dossier recovered · +10 alloy' };
  }
}

export function getStepBuilding(step: MissionStep | null): Building | null {
  if (!step) return null;
  if (step.type === 'RETURN_SAFEHOUSE') return getCityLayout().byId.get('safehouse') ?? null;
  return step.buildingId ? (getCityLayout().byId.get(step.buildingId) ?? null) : null;
}

/** World point the HUD waypoint points at for a step (null when it follows a moving target). */
export function getStepWaypoint(step: MissionStep | null): { x: number; z: number; y: number } | null {
  if (!step) return null;
  if (step.zone) return { x: step.zone.x, z: step.zone.z, y: 0 };
  const b = getStepBuilding(step);
  if (!b) return null;
  if (step.type === 'TRAVEL' || step.type === 'RETURN_SAFEHOUSE') {
    const e = getBuildingEntrance(b);
    return { x: e.x, z: e.z, y: 0 };
  }
  const cx = (b.footprint.minX + b.footprint.maxX) / 2;
  const cz = (b.footprint.minZ + b.footprint.maxZ) / 2;
  return { x: cx, z: cz, y: (step.floor ?? 0) * 3.4 };
}

/** Spot inside the target floor where the charge / item sits: far east room, against the wall. */
export function getActionSpot(b: Building): { x: number; z: number } {
  const room = b.rooms[b.rooms.length - 1];
  return { x: room.maxX - 0.9, z: (room.minZ + room.maxZ) / 2 };
}

export function formatPlayTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
