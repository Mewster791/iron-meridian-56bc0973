import { describe, expect, it } from "vitest";
import { MISSIONS } from "./campaignData";
import {
  applyDeath,
  canDetonate,
  canResupplyAtApc,
  canStartHoldAction,
  completeCurrentStep,
  createInitialCampaignProgress,
  getCurrentStep,
  isBuildingFullyCleared,
  jumpToMission,
  jumpToStep,
  isFloorCleared,
  markFloorCleared,
  stepDefendTimer,
  stepHoldProgress,
} from "./campaignRules";
import { getCityLayout, sampleCitySupport, isBlockedByStairs, floorY } from "../city/cityLayout";

describe("campaign structure", () => {
  it("has a long campaign of at least 15 story missions", () => {
    expect(MISSIONS.length).toBeGreaterThanOrEqual(15);
  });

  it("references only buildings that exist in the city", () => {
    const layout = getCityLayout();
    for (const m of MISSIONS) {
      for (const s of m.steps) {
        if (s.buildingId) expect(layout.byId.has(s.buildingId)).toBe(true);
        if (s.floor !== undefined && s.buildingId) {
          expect(s.floor).toBeLessThan(layout.byId.get(s.buildingId)!.floors);
        }
      }
    }
  });

  it("has a mission that bombs the bank by planting then detonating", () => {
    const bank = MISSIONS.find((m) =>
      m.steps.some((s) => s.buildingId === "bank" && s.type === "PLANT_BOMB"),
    );
    expect(bank).toBeDefined();
    const plantIdx = bank!.steps.findIndex((s) => s.type === "PLANT_BOMB");
    expect(bank!.steps[plantIdx + 1].type).toBe("DETONATE");
  });
});

describe("taking a building", () => {
  it("requires every floor to be cleared", () => {
    let p = createInitialCampaignProgress();
    p = markFloorCleared(p, 0);
    p = markFloorCleared(p, 2);
    expect(isBuildingFullyCleared(p.clearedFloors, { floors: 3 })).toBe(false);
    p = markFloorCleared(p, 1);
    expect(isBuildingFullyCleared(p.clearedFloors, { floors: 3 })).toBe(true);
  });

  it("only counts a floor once the player has been on it and all hostiles are down", () => {
    expect(isFloorCleared(0, false)).toBe(false);
    expect(isFloorCleared(1, true)).toBe(false);
    expect(isFloorCleared(0, true)).toBe(true);
  });
});

describe("bomb and hold actions", () => {
  it("locks planting until the guards are down", () => {
    expect(canStartHoldAction(2)).toBe(false);
    expect(canStartHoldAction(0)).toBe(true);
  });

  it("resets plant progress when the player gets hit", () => {
    expect(stepHoldProgress(7, 0.1, true, true)).toBe(0);
    expect(stepHoldProgress(7, 0.5, true, false)).toBe(7.5);
    expect(stepHoldProgress(7, 0.5, false, false)).toBe(6);
  });

  it("only detonates from a safe distance", () => {
    expect(canDetonate(30, 50)).toBe(false);
    expect(canDetonate(50, 50)).toBe(true);
  });

  it("pauses the defend clock outside the zone", () => {
    expect(stepDefendTimer(10, 1, false)).toBe(10);
    expect(stepDefendTimer(10, 1, true)).toBe(11);
  });
});

describe("pacing", () => {
  it("advances steps in order and finishes the mission after the last step", () => {
    let p = createInitialCampaignProgress();
    const first = MISSIONS[0];
    for (let i = 0; i < first.steps.length - 1; i++) {
      const r = completeCurrentStep(p);
      expect(r.completedMission).toBeNull();
      p = r.progress;
    }
    const last = completeCurrentStep(p);
    expect(last.completedMission?.id).toBe(first.id);
    expect(last.progress.missionIndex).toBe(1);
    expect(last.progress.stepIndex).toBe(0);
  });

  it("costs 20% scrap on death and keeps cleared floors", () => {
    const p = markFloorCleared(createInitialCampaignProgress(), 0);
    const r = applyDeath(p, 100);
    expect(r.scrapLost).toBe(20);
    expect(r.scrapAfter).toBe(80);
    expect(r.progress.deaths).toBe(1);
    expect(r.progress.clearedFloors).toEqual([0]);
  });

  it("lets the APC resupply only every 180 seconds", () => {
    expect(canResupplyAtApc(179)).toBe(false);
    expect(canResupplyAtApc(180)).toBe(true);
  });
});

describe("tester jumps", () => {
  it("jumping to Iron Road marks missions 1-4 done and Broadcast House destroyed", () => {
    const p = jumpToMission(createInitialCampaignProgress(), 4);
    expect(MISSIONS[p.missionIndex].title).toBe("Iron Road");
    expect(p.completedMissionIds).toEqual(["m01", "m02", "m03", "m04"]);
    expect(p.destroyedBuildingIds).toContain("broadcast");
    expect(p.stepIndex).toBe(0);
    expect(p.briefingSeen).toBe(false);
  });

  it("jumping to a step stays inside the current mission", () => {
    const p = jumpToStep(jumpToMission(createInitialCampaignProgress(), 4), 99);
    expect(p.stepIndex).toBe(MISSIONS[4].steps.length - 1);
  });

  it("destroying the Iron Road convoy then returning home finishes mission 5", () => {
    let p = jumpToMission(createInitialCampaignProgress(), 4);
    p = completeCurrentStep(p).progress;
    expect(getCurrentStep(p)?.type).toBe("RETURN_SAFEHOUSE");
    const r = completeCurrentStep(p);
    expect(r.completedMission?.id).toBe("m05");
  });
});

describe("city floors and stairs", () => {
  it("every building has at least two floors and loot on each floor", () => {
    for (const b of getCityLayout().buildings) {
      expect(b.floors).toBeGreaterThanOrEqual(2);
      for (let f = 0; f < b.floors; f++) {
        expect(b.loot.some((l) => l.floor === f)).toBe(true);
      }
    }
  });

  it("stairs lead from the ground floor up to the next floor", () => {
    const b = getCityLayout().byId.get("safehouse")!;
    const x = (b.core.minX + b.core.maxX) / 2;
    expect(sampleCitySupport(x, b.core.minZ + 0.05, 0)).toBeCloseTo(0, 1);
    const mid = (b.core.minZ + b.core.maxZ) / 2;
    expect(sampleCitySupport(x, mid, 1.5)).toBeCloseTo(floorY(1) / 2, 1);
    expect(sampleCitySupport(x, b.core.maxZ - 0.01, floorY(1) - 0.2)).toBeCloseTo(floorY(1), 1);
  });

  it("upper floors are walkable outside the stairwell", () => {
    const b = getCityLayout().byId.get("tower")!;
    const room = b.rooms[1];
    const x = (room.minX + room.maxX) / 2;
    const z = (room.minZ + room.maxZ) / 2;
    expect(sampleCitySupport(x, z, floorY(5))).toBeCloseTo(floorY(5), 3);
  });

  it("blocks walking under the low end of the ground-floor stairs", () => {
    const b = getCityLayout().byId.get("safehouse")!;
    const x = (b.core.minX + b.core.maxX) / 2;
    expect(isBlockedByStairs(x, b.core.minZ + 1.5, 0)).toBe(true);
    expect(isBlockedByStairs(x, b.core.maxZ - 0.2, 0)).toBe(false);
  });
});
