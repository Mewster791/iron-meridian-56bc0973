import type {
  FactionId, PlayerCombatState, TacticalUnitVehicleState, SalvageInventory,
  RetrofitTechNode, TheaterObjective,
} from '../types/systems';

export const CAMPAIGN_SAVE_KEY = 'iron-meridian.campaign.v2';

export interface CampaignSave {
  version: 2;
  savedAt: string;
  faction: FactionId;
  playerState: PlayerCombatState;
  vehicleState: TacticalUnitVehicleState;
  salvageInventory: SalvageInventory;
  techNodes: RetrofitTechNode[];
  objectives: TheaterObjective[];
  pinnedObjectiveUid: string | null;
  playerCoords: { x: number; z: number; yaw: number };
}

export function readCampaignSave(): CampaignSave | null {
  try {
    const raw = window.localStorage.getItem(CAMPAIGN_SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CampaignSave;
    if (parsed.version !== 2 || !parsed.playerState || !Array.isArray(parsed.objectives)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCampaignSave(save: Omit<CampaignSave, 'version' | 'savedAt'>): boolean {
  try {
    const payload: CampaignSave = { ...save, version: 2, savedAt: new Date().toISOString() };
    window.localStorage.setItem(CAMPAIGN_SAVE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}
