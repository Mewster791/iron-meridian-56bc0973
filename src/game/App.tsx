import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  FactionId,
  PlayerCombatState,
  RetrofitStage,
  RetrofitTechNode,
  SalvageInventory,
  SquadOrder,
  TacticalUnitVehicleState,
} from "./types/systems";
import {
  advanceNodeAndRecalculateVehicle,
  applyConvoySalvageDrop,
  canAdvanceRetrofitStage,
  createInitialSalvageInventory,
  createInitialVehicleState,
  createTechTreeForFaction,
} from "./systems/scavengeRetrofitSystem";
import { createInitialPlayerCombatState } from "./systems/loadoutHealthSystem";
import { AtmospherePreset } from "./three/proceduralTextures";
import { TacticalArena3D } from "./components/TacticalArena3D";
import { TacticalMenuOverlay } from "./components/TacticalMenuOverlay";
import { HomeScreen, SaveSummary } from "./components/HomeScreen";
import { MissionBriefing } from "./components/MissionBriefing";
import { audioEngine } from "./systems/audioEngine";
import { musicEngine } from "./systems/musicEngine";
import { Music2, VolumeX as MusicOff } from "lucide-react";
import {
  CampaignSave,
  buildCampaignSave,
  readCampaignSave,
  writeCampaignSave,
} from "./systems/campaignSaveSystem";
import {
  fetchCloudSave,
  pushCloudSave,
  signInWithGoogle,
  signOutPlayer,
  usePlayerAccount,
} from "./systems/cloudSave";
import { LORE_DOSSIERS, Mission, MISSIONS } from "./campaign/campaignData";
import {
  CampaignProgress,
  LootReward,
  applyDeath,
  completeCurrentStep,
  createInitialCampaignProgress,
  formatPlayTime,
  getCurrentMission,
  jumpToMission,
  jumpToStep,
  markFloorCleared,
} from "./campaign/campaignRules";
import type { TesterCommandType } from "./components/TacticalArena3D";
import { TesterPanel, TesterPasswordPrompt } from "./tester/TesterPanel";
import { initialTesterCodeState, stepTesterCode } from "./tester/testerAccess";
import { getTesterTeleportTarget } from "./tester/testerTargets";

type Coords = { x: number; z: number; y: number; yaw: number };

const LOCAL_AUTOSAVE_MS = 10_000;
const CLOUD_AUTOSAVE_MS = 60_000;

function summarize(save: CampaignSave | null): SaveSummary | null {
  if (!save) return null;
  const mission = getCurrentMission(save.progress);
  return {
    faction: save.faction,
    missionLabel: mission ? `Mission ${mission.number}: ${mission.title}` : "Campaign complete",
    missionsDone: save.progress.completedMissionIds.length,
    missionsTotal: MISSIONS.length,
    playTime: formatPlayTime(save.progress.playTimeSec),
  };
}

export default function App() {
  const [isRoundActive, setIsRoundActive] = useState<boolean>(false);
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const [faction, setFaction] = useState<FactionId>(FactionId.EAST);
  const [atmosphere, setAtmosphere] = useState<AtmospherePreset>(AtmospherePreset.ALPINE_DAYLIGHT);

  const [playerState, setPlayerState] = useState<PlayerCombatState>(() =>
    createInitialPlayerCombatState(FactionId.EAST),
  );
  const [vehicleState, setVehicleState] = useState<TacticalUnitVehicleState>(() =>
    createInitialVehicleState(FactionId.EAST),
  );
  const [salvageInventory, setSalvageInventory] = useState<SalvageInventory>(() =>
    createInitialSalvageInventory(FactionId.EAST),
  );
  const [techNodes, setTechNodes] = useState<RetrofitTechNode[]>(() =>
    createTechTreeForFaction(FactionId.EAST),
  );
  const [campaign, setCampaignState] = useState<CampaignProgress>(() =>
    createInitialCampaignProgress(),
  );
  const [debrief, setDebrief] = useState<Mission | null>(null);

  /** True once a campaign is loaded or started; nothing autosaves before that. */
  const [campaignLive, setCampaignLive] = useState(false);
  const [savedSummary, setSavedSummary] = useState<SaveSummary | null>(null);
  /** Bumped to rebuild the 3D city (new campaign / loading a different save). */
  const [worldKey, setWorldKey] = useState(0);

  const [squadTargetCoords, setSquadTargetCoords] = useState<{ x: number; z: number } | null>(null);
  const [deployRequest, setDeployRequest] = useState<{
    x: number;
    z: number;
    y: number;
    nonce: number;
  } | null>(null);
  const [livePlayerCoords, setLivePlayerCoords] = useState<{ x: number; z: number; yaw: number }>({
    x: 0,
    z: 0,
    yaw: 0,
  });
  const [liveVehicleCoords, setLiveVehicleCoords] = useState<{ x: number; z: number }>({
    x: 0,
    z: 0,
  });
  const [liveConvoyCoords, setLiveConvoyCoords] = useState<{
    x: number;
    z: number;
    intact: boolean;
  }>({ x: -150, z: 0, intact: true });

  const { user, ready: accountReady } = usePlayerAccount();
  const [cloudStatus, setCloudStatus] = useState<string | null>(null);

  // ---- hidden tester panel (Control, then 94206722, then the "color" password) ----
  const [testerStage, setTesterStage] = useState<"closed" | "password" | "panel">("closed");
  const [testerGodMode, setTesterGodMode] = useState(false);
  const [testerCommand, setTesterCommand] = useState<{
    type: TesterCommandType;
    nonce: number;
  } | null>(null);
  const testerStageRef = useRef(testerStage);
  testerStageRef.current = testerStage;

  const [toastBanner, setToastBanner] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => {
    setToastBanner(msg);
    window.setTimeout(() => setToastBanner((curr) => (curr === msg ? null : curr)), 3800);
  }, []);

  // ---- refs mirroring state, so callbacks fired from the 3D loop always see current values ----
  const factionRef = useRef(faction);
  factionRef.current = faction;
  const campaignRef = useRef(campaign);
  campaignRef.current = campaign;
  const roundActiveRef = useRef(isRoundActive);
  roundActiveRef.current = isRoundActive;
  const playTimeRef = useRef(0);
  const coordsRef = useRef<Coords>({ x: 0, z: 0, y: 0, yaw: 0 });
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = user?.id ?? null;
  const liveRef = useRef(campaignLive);
  liveRef.current = campaignLive;
  const snapshotRef = useRef<() => CampaignSave>(() => {
    throw new Error("snapshot not ready");
  });
  snapshotRef.current = () =>
    buildCampaignSave({
      faction,
      playerState,
      vehicleState,
      salvageInventory,
      techNodes,
      progress: { ...campaign, playTimeSec: Math.floor(playTimeRef.current) },
      playerCoords: coordsRef.current,
    });

  const setCampaign = useCallback((next: CampaignProgress) => {
    campaignRef.current = next;
    setCampaignState(next);
  }, []);

  const saveNow = useCallback((toCloud: boolean) => {
    if (!liveRef.current) return;
    const save = snapshotRef.current();
    writeCampaignSave(save);
    setSavedSummary(summarize(save));
    const uid = userIdRef.current;
    if (toCloud && uid) {
      void pushCloudSave(uid, save).then((ok) => {
        setCloudStatus(
          ok
            ? `Last online save ${new Date().toLocaleTimeString()}`
            : "Online save failed — will retry",
        );
      });
    }
  }, []);

  const applySave = useCallback(
    (save: CampaignSave) => {
      setFaction(save.faction);
      setPlayerState(save.playerState);
      setVehicleState(save.vehicleState);
      setSalvageInventory(save.salvageInventory);
      setTechNodes(save.techNodes);
      setCampaign(save.progress);
      playTimeRef.current = save.progress.playTimeSec;
      coordsRef.current = save.playerCoords;
      setLivePlayerCoords(save.playerCoords);
      setSquadTargetCoords(null);
      setDebrief(null);
      setWorldKey((k) => k + 1);
      setDeployRequest({ ...save.playerCoords, nonce: Date.now() });
      setSavedSummary(summarize(save));
    },
    [setCampaign],
  );

  // Restore the local save at startup.
  useEffect(() => {
    const saved = readCampaignSave();
    if (saved) applySave(saved);
  }, [applySave]);

  // When a player signs in, reconcile the browser save with their online save (newest wins).
  const syncedUserRef = useRef<string | null>(null);
  useEffect(() => {
    if (!user || syncedUserRef.current === user.id) return;
    syncedUserRef.current = user.id;
    let cancelled = false;
    (async () => {
      setCloudStatus("Syncing your online save…");
      const cloud = await fetchCloudSave(user.id);
      if (cancelled) return;
      const local = liveRef.current ? snapshotRef.current() : readCampaignSave();
      if (cloud && (!local || cloud.savedAt > local.savedAt)) {
        if (!roundActiveRef.current) {
          applySave(cloud);
          writeCampaignSave(cloud);
          setCampaignLive(true);
          setCloudStatus("Loaded your online save");
        } else {
          setCloudStatus("A newer online save exists — return home to load it");
        }
      } else if (local) {
        const ok = await pushCloudSave(user.id, local);
        if (!cancelled)
          setCloudStatus(ok ? "Progress backed up online" : "Online save failed — will retry");
      } else {
        setCloudStatus("No online save yet — start a campaign");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, applySave]);

  useEffect(() => {
    if (!user) syncedUserRef.current = null;
  }, [user]);

  // Immediate local save whenever campaign progress, salvage or upgrades change.
  useEffect(() => {
    saveNow(false);
  }, [campaign, salvageInventory, techNodes, faction, saveNow]);

  // Periodic saves while playing: browser every 10 s, online every 60 s.
  useEffect(() => {
    if (!isRoundActive) return;
    const local = window.setInterval(() => saveNow(false), LOCAL_AUTOSAVE_MS);
    const cloud = window.setInterval(() => saveNow(true), CLOUD_AUTOSAVE_MS);
    const onHide = () => saveNow(true);
    window.addEventListener("pagehide", onHide);
    return () => {
      window.clearInterval(local);
      window.clearInterval(cloud);
      window.removeEventListener("pagehide", onHide);
    };
  }, [isRoundActive, saveNow]);

  const showBriefing =
    isRoundActive &&
    (debrief !== null || (!campaign.briefingSeen && getCurrentMission(campaign) !== null));
  const simPaused = isMenuOpen || showBriefing || testerStage !== "closed";

  // ---- soundtrack: one song ("Iron Bow, Broken Crown") plays the same everywhere, start to finish ----
  const [musicMuted, setMusicMuted] = useState(false);
  useEffect(() => {
    setMusicMuted(musicEngine.isMuted());
    // Browsers only allow audio after the first click or key press.
    const unlock = () => musicEngine.start();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);
  const toggleMusic = () => {
    const next = !musicEngine.isMuted();
    musicEngine.setMuted(next);
    setMusicMuted(next);
  };

  // Play-time clock (only while actually playing).
  useEffect(() => {
    if (!isRoundActive || simPaused) return;
    const id = window.setInterval(() => {
      playTimeRef.current += 1;
    }, 1000);
    return () => window.clearInterval(id);
  }, [isRoundActive, simPaused]);

  // Global keys: M toggles the menu, Escape closes it.
  useEffect(() => {
    const onGlobalKeyDown = (e: KeyboardEvent) => {
      if (!roundActiveRef.current || e.repeat || testerStageRef.current !== "closed") return;
      if (
        document.activeElement &&
        ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)
      )
        return;
      if (e.code === "KeyM") {
        e.preventDefault();
        setIsMenuOpen((prev) => {
          const next = !prev;
          if (next && document.pointerLockElement) document.exitPointerLock?.();
          return next;
        });
      } else if (e.code === "Escape") {
        setIsMenuOpen((prev) => (prev ? false : prev));
      }
    };
    window.addEventListener("keydown", onGlobalKeyDown);
    return () => window.removeEventListener("keydown", onGlobalKeyDown);
  }, []);

  // Listen for the tester unlock sequence anywhere (home screen or in a mission).
  useEffect(() => {
    let codeState = initialTesterCodeState;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || testerStageRef.current !== "closed") return;
      if (
        document.activeElement &&
        ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)
      )
        return;
      const r = stepTesterCode(codeState, e.key, performance.now());
      codeState = r.state;
      if (r.unlocked) {
        if (document.pointerLockElement) document.exitPointerLock?.();
        setTesterStage("password");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---- home screen ----
  const handleNewCampaign = useCallback(
    (nextFaction: FactionId) => {
      setFaction(nextFaction);
      setPlayerState(createInitialPlayerCombatState(nextFaction));
      setVehicleState(createInitialVehicleState(nextFaction));
      setSalvageInventory(createInitialSalvageInventory(nextFaction));
      setTechNodes(createTechTreeForFaction(nextFaction));
      setCampaign(createInitialCampaignProgress());
      playTimeRef.current = 0;
      coordsRef.current = { x: 0, z: 0, y: 0, yaw: 0 };
      setSquadTargetCoords(null);
      setDebrief(null);
      setDeployRequest(null);
      setWorldKey((k) => k + 1);
      setCampaignLive(true);
      setIsMenuOpen(false);
      setIsRoundActive(true);
    },
    [setCampaign],
  );

  const handleContinueCampaign = useCallback(() => {
    setCampaignLive(true);
    setIsMenuOpen(false);
    setIsRoundActive(true);
    showToast("Welcome back, operator");
  }, [showToast]);

  const handleReturnHome = useCallback(() => {
    if (document.pointerLockElement) document.exitPointerLock?.();
    saveNow(true);
    setIsMenuOpen(false);
    setIsRoundActive(false);
  }, [saveNow]);

  const handleSignIn = useCallback(async () => {
    setCloudStatus(null);
    const err = await signInWithGoogle();
    if (err) setCloudStatus(`Sign-in failed: ${err}`);
  }, []);

  const handleSignOut = useCallback(async () => {
    saveNow(true);
    await signOutPlayer();
    setCloudStatus(null);
  }, [saveNow]);

  // ---- mission / campaign events from the 3D world ----
  const handleStepComplete = useCallback(() => {
    const r = completeCurrentStep(campaignRef.current);
    setCampaign(r.progress);
    const m = r.completedMission;
    if (m) {
      const east = factionRef.current === FactionId.EAST;
      setSalvageInventory((inv) => ({
        ...inv,
        rawScrapAlloy: inv.rawScrapAlloy + m.reward.scrap,
        westernCompositePlates: inv.westernCompositePlates + (east ? m.reward.plates : 0),
        easternEraBlocks: inv.easternEraBlocks + (east ? 0 : m.reward.plates),
        encryptedFireControlChips: inv.encryptedFireControlChips + m.reward.chips,
      }));
      audioEngine.playRetrofitInstall();
      setDebrief(m);
      if (document.pointerLockElement) document.exitPointerLock?.();
      window.setTimeout(() => saveNow(true), 50);
    }
  }, [saveNow, setCampaign]);

  const handleFloorCleared = useCallback(
    (floor: number) => {
      setCampaign(markFloorCleared(campaignRef.current, floor));
    },
    [setCampaign],
  );

  const handleLoot = useCallback(
    (lootId: string, reward: LootReward) => {
      const p = campaignRef.current;
      if (p.lootedIds.includes(lootId)) return;
      let dossierTitle: string | null = null;
      let dossiersFound = p.dossiersFound;
      if (reward.dossier) {
        const next = LORE_DOSSIERS.find((d) => !p.dossiersFound.includes(d.id));
        if (next) {
          dossiersFound = [...p.dossiersFound, next.id];
          dossierTitle = next.title;
        }
      }
      setCampaign({ ...p, lootedIds: [...p.lootedIds, lootId], dossiersFound });
      if (reward.scrap || reward.plates || reward.chips) {
        const east = factionRef.current === FactionId.EAST;
        setSalvageInventory((inv) => ({
          ...inv,
          rawScrapAlloy: inv.rawScrapAlloy + reward.scrap,
          westernCompositePlates: inv.westernCompositePlates + (east ? reward.plates : 0),
          easternEraBlocks: inv.easternEraBlocks + (east ? 0 : reward.plates),
          encryptedFireControlChips: inv.encryptedFireControlChips + reward.chips,
        }));
      }
      showToast(
        dossierTitle
          ? `Dossier found: "${dossierTitle}" — read it in the journal [M]`
          : `Found ${reward.label}`,
      );
    },
    [setCampaign, showToast],
  );

  const handleBuildingDestroyed = useCallback(
    (buildingId: string) => {
      const p = campaignRef.current;
      if (p.destroyedBuildingIds.includes(buildingId)) return;
      setCampaign({ ...p, destroyedBuildingIds: [...p.destroyedBuildingIds, buildingId] });
    },
    [setCampaign],
  );

  const handlePlayerDown = useCallback(() => {
    setSalvageInventory((inv) => {
      const r = applyDeath(campaignRef.current, inv.rawScrapAlloy);
      setCampaign(r.progress);
      showToast(`You went down and were dragged back to the safehouse. Lost ${r.scrapLost} alloy.`);
      return { ...inv, rawScrapAlloy: r.scrapAfter };
    });
  }, [setCampaign, showToast]);

  const handleLootConvoyCrate = useCallback(() => {
    const res = applyConvoySalvageDrop(techNodes, salvageInventory, faction);
    setTechNodes(res.nodes);
    setSalvageInventory(res.inventory);
    showToast(res.summary);
  }, [techNodes, salvageInventory, faction, showToast]);

  const handleAdvanceTechNode = useCallback(
    (nodeId: string) => {
      const res = advanceNodeAndRecalculateVehicle(
        nodeId,
        techNodes,
        salvageInventory,
        vehicleState,
      );
      setTechNodes(res.nodes);
      setSalvageInventory(res.inventory);
      setVehicleState(res.vehicle);
      audioEngine.playRetrofitInstall();
      showToast(res.eventMessage);
    },
    [techNodes, salvageInventory, vehicleState, showToast],
  );

  const handleQuickRetrofitNextNode = useCallback(
    (resupplied: boolean) => {
      let workingNodes = [...techNodes];
      let workingInv = { ...salvageInventory };
      let workingVeh = { ...vehicleState };
      let upgraded = false;
      let lastMsg = "";

      const candidate = workingNodes.find(
        (n) =>
          n.stage !== RetrofitStage.FIELD_RETROFITTED &&
          canAdvanceRetrofitStage(n, workingNodes, workingInv).allowed,
      );
      if (candidate) {
        for (let step = 0; step < 3; step++) {
          const currentObj = workingNodes.find((n) => n.id === candidate.id);
          if (!currentObj || currentObj.stage === RetrofitStage.FIELD_RETROFITTED) break;
          if (!canAdvanceRetrofitStage(currentObj, workingNodes, workingInv).allowed) break;
          const out = advanceNodeAndRecalculateVehicle(
            candidate.id,
            workingNodes,
            workingInv,
            workingVeh,
          );
          workingNodes = out.nodes;
          workingInv = out.inventory;
          workingVeh = out.vehicle;
          lastMsg = out.eventMessage;
          upgraded = true;
        }
        setTechNodes(workingNodes);
        setSalvageInventory(workingInv);
        setVehicleState(workingVeh);
      }
      const parts = [
        resupplied ? "Ammo & armor resupplied" : "APC resupply still on cooldown",
        upgraded ? lastMsg : "",
      ];
      showToast(parts.filter(Boolean).join(" · "));
    },
    [techNodes, salvageInventory, vehicleState, showToast],
  );

  const handleIssueSquadMoveOrder = useCallback(
    (x: number, z: number) => {
      setSquadTargetCoords({ x, z });
      setVehicleState((prev) => ({ ...prev, currentOrder: SquadOrder.SUPPRESS_SECTOR }));
      showToast("Squad APC moving to the marked point");
    },
    [showToast],
  );

  const handleSetSquadOrder = useCallback(
    (order: SquadOrder) => {
      if (order === SquadOrder.FOLLOW_WEDGE || order === SquadOrder.ASSAULT_CONVOY)
        setSquadTargetCoords(null);
      setVehicleState((prev) => ({ ...prev, currentOrder: order }));
      showToast("Squad order updated");
    },
    [showToast],
  );

  const handleSyncLiveCoords = useCallback(
    (
      player: Coords,
      vehicle: { x: number; z: number },
      convoy: { x: number; z: number; intact: boolean },
    ) => {
      coordsRef.current = player;
      setLivePlayerCoords((prev) =>
        Math.abs(prev.x - player.x) +
          Math.abs(prev.z - player.z) +
          Math.abs(prev.yaw - player.yaw) >
        0.05
          ? player
          : prev,
      );
      setLiveVehicleCoords(vehicle);
      setLiveConvoyCoords(convoy);
    },
    [],
  );

  // ---- tester panel actions ----
  const closeTester = useCallback(() => setTesterStage("closed"), []);

  const testerFinishMission = useCallback(() => {
    const p = campaignRef.current;
    const m = getCurrentMission(p);
    if (!m) return;
    const bombed = m.steps
      .filter((s) => s.type === "DETONATE" && s.buildingId)
      .map((s) => s.buildingId as string);
    setCampaign({
      ...p,
      stepIndex: m.steps.length - 1,
      clearedFloors: [],
      destroyedBuildingIds: [...new Set([...p.destroyedBuildingIds, ...bombed])],
    });
    handleStepComplete();
  }, [handleStepComplete, setCampaign]);

  const testerJumpMission = useCallback(
    (index: number) => {
      setCampaign(jumpToMission(campaignRef.current, index));
      coordsRef.current = { x: 0, z: 0, y: 0, yaw: 0 };
      setSquadTargetCoords(null);
      setDebrief(null);
      setDeployRequest(null);
      setWorldKey((k) => k + 1);
      setCampaignLive(true);
      setIsMenuOpen(false);
      setIsRoundActive(true);
      setTesterStage("closed");
    },
    [setCampaign],
  );

  const testerJumpStep = useCallback(
    (index: number) => {
      setDebrief(null);
      setCampaign(jumpToStep(campaignRef.current, index));
    },
    [setCampaign],
  );

  const testerTeleport = useCallback(() => {
    const target = getTesterTeleportTarget(campaignRef.current, liveConvoyCoords);
    if (!target) return;
    setDeployRequest({ ...target, nonce: Date.now() });
    setTesterStage("closed");
  }, [liveConvoyCoords]);

  const testerAddSalvage = useCallback(() => {
    setSalvageInventory((inv) => ({
      ...inv,
      rawScrapAlloy: inv.rawScrapAlloy + 200,
      westernCompositePlates: inv.westernCompositePlates + 5,
      easternEraBlocks: inv.easternEraBlocks + 5,
      encryptedFireControlChips: inv.encryptedFireControlChips + 3,
    }));
    showToast("Tester: salvage added");
  }, [showToast]);

  const nextMission = getCurrentMission(campaign);
  const campaignForUi = isMenuOpen
    ? { ...campaign, playTimeSec: Math.floor(playTimeRef.current) }
    : campaign;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0B0E13] text-[#E6ECF2]">
      {toastBanner && isRoundActive && (
        <div className="fixed top-5 right-5 z-50 max-w-md bg-[#11161F]/95 border border-[#F59E0B]/75 text-slate-100 px-4 py-2.5 rounded-lg text-xs font-medium shadow-xl pointer-events-none">
          {toastBanner}
        </div>
      )}

      {!isRoundActive && (
        <HomeScreen
          onNewCampaign={handleNewCampaign}
          onContinue={handleContinueCampaign}
          save={savedSummary}
          accountEmail={user?.email ?? null}
          accountReady={accountReady}
          cloudStatus={cloudStatus}
          onSignIn={handleSignIn}
          onSignOut={handleSignOut}
        />
      )}

      {!isRoundActive && (
        <button
          type="button"
          onClick={toggleMusic}
          aria-label={musicMuted ? "Turn music on" : "Turn music off"}
          className="fixed top-4 right-4 z-40 flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#11161F]/90 border border-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-colors cursor-pointer"
        >
          {musicMuted ? <MusicOff className="w-3.5 h-3.5" /> : <Music2 className="w-3.5 h-3.5" />}
          <span>{musicMuted ? "Music off" : "Music on"}</span>
        </button>
      )}

      {testerStage === "password" && (
        <TesterPasswordPrompt onSubmit={() => setTesterStage("panel")} onCancel={closeTester} />
      )}

      {testerStage === "panel" && (
        <TesterPanel
          campaign={campaign}
          inGame={isRoundActive}
          godMode={testerGodMode}
          onClose={closeTester}
          onCompleteStep={handleStepComplete}
          onFinishMission={testerFinishMission}
          onJumpMission={testerJumpMission}
          onJumpStep={testerJumpStep}
          onTeleportObjective={testerTeleport}
          onCommand={(type) => setTesterCommand({ type, nonce: Date.now() })}
          onToggleGodMode={() => setTesterGodMode((g) => !g)}
          onAddSalvage={testerAddSalvage}
        />
      )}

      {showBriefing && (
        <MissionBriefing
          debrief={debrief}
          mission={nextMission}
          faction={faction}
          signedIn={!!user}
          onContinueDebrief={() => setDebrief(null)}
          onBeginMission={() => setCampaign({ ...campaignRef.current, briefingSeen: true })}
        />
      )}

      {isRoundActive && (
        <TacticalMenuOverlay
          isOpen={isMenuOpen}
          onClose={() => setIsMenuOpen(false)}
          onReturnHome={handleReturnHome}
          faction={faction}
          atmosphere={atmosphere}
          onChangeAtmosphere={setAtmosphere}
          playerState={playerState}
          vehicleState={vehicleState}
          techNodes={techNodes}
          salvageInventory={salvageInventory}
          campaign={campaignForUi}
          playerCoords={livePlayerCoords}
          vehicleCoords={liveVehicleCoords}
          squadTargetCoords={squadTargetCoords}
          convoyCoords={liveConvoyCoords}
          onIssueSquadMoveOrder={handleIssueSquadMoveOrder}
          onAdvanceTechNode={handleAdvanceTechNode}
          onSetSquadOrder={handleSetSquadOrder}
        />
      )}

      <TacticalArena3D
        key={worldKey}
        isRoundActive={isRoundActive}
        isMenuOpen={simPaused}
        onToggleMenu={() => setIsMenuOpen((prev) => !prev)}
        faction={faction}
        atmosphere={atmosphere}
        playerState={playerState}
        setPlayerState={setPlayerState}
        vehicleState={vehicleState}
        setVehicleState={setVehicleState}
        techNodes={techNodes}
        salvageInventory={salvageInventory}
        campaign={campaign}
        squadTargetCoords={squadTargetCoords}
        deployRequest={deployRequest}
        testerCommand={testerCommand}
        testerGodMode={testerGodMode}
        onSyncLiveCoords={handleSyncLiveCoords}
        onLootConvoyCrate={handleLootConvoyCrate}
        onQuickRetrofitNextNode={handleQuickRetrofitNextNode}
        onStepComplete={handleStepComplete}
        onFloorCleared={handleFloorCleared}
        onLoot={handleLoot}
        onBuildingDestroyed={handleBuildingDestroyed}
        onPlayerDown={handlePlayerDown}
        onToast={showToast}
      />
    </div>
  );
}
