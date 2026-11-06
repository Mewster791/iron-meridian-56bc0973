import {
  CampaignProgress,
  getActionSpot,
  getCurrentStep,
  getStepBuilding,
  getStepWaypoint,
} from "../campaign/campaignRules";
import { floorY, getBuildingEntrance } from "../city/cityLayout";

/** Where the tester "teleport to objective" button drops the player for the current step. */
export function getTesterTeleportTarget(
  p: CampaignProgress,
  convoy: { x: number; z: number; intact: boolean },
): { x: number; z: number; y: number } | null {
  const step = getCurrentStep(p);
  if (!step) return null;
  if (step.type === "DESTROY_CONVOY") return { x: convoy.x - 18, z: convoy.z, y: 0 };
  const b = getStepBuilding(step);
  if (b && step.type === "DETONATE") {
    const e = getBuildingEntrance(b);
    const away = (step.safeDistance ?? 50) + 8;
    const dir = b.doorSide === "N" ? -1 : 1;
    return { x: e.x, z: e.z + dir * away, y: 0 };
  }
  if (b && step.floor !== undefined) {
    const spot = getActionSpot(b);
    return { x: spot.x - 2.5, z: spot.z, y: floorY(step.floor) };
  }
  if (b) {
    const e = getBuildingEntrance(b);
    return { x: e.x, z: e.z, y: 0 };
  }
  return getStepWaypoint(step);
}
