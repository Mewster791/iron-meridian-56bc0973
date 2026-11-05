import type {
  FactionId, PlayerCombatState, TacticalUnitVehicleState, SalvageInventory, RetrofitTechNode,
} from '../types/systems';
import type { CampaignProgress } from '../campaign/campaignRules';

export const CAMPAIGN_SAVE_KEY = 'iron-meridian.campaign.v3';

export interface CampaignSave {
  version: 3;
  savedAt: string;
  faction: FactionId;
  playerState: PlayerCombatState;
  vehicleState: TacticalUnitVehicleState;
  salvageInventory: SalvageInventory;
  techNodes: RetrofitTechNode[];
  progress: CampaignProgress;
  playerCoords: { x: number; z: number; y: number; yaw: number };
}

export type CampaignSaveInput = Omit<CampaignSave, 'version' | 'savedAt'>;

export function isValidCampaignSave(value: unknown): value is CampaignSave {
  const v = value as CampaignSave | null;
  return !!v && v.version === 3 && !!v.playerState && !!v.progress && Array.isArray(v.progress.lootedIds);
}

export function readCampaignSave(): CampaignSave | null {
  try {
    const raw = window.localStorage.getItem(CAMPAIGN_SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isValidCampaignSave(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function buildCampaignSave(save: CampaignSaveInput): CampaignSave {
  return { ...save, version: 3, savedAt: new Date().toISOString() };
}

export function writeCampaignSave(save: CampaignSave): boolean {
  try {
    window.localStorage.setItem(CAMPAIGN_SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function clearCampaignSave(): void {
  try {
    window.localStorage.removeItem(CAMPAIGN_SAVE_KEY);
  } catch {
    /* storage unavailable */
  }
}
