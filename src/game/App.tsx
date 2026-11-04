import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FactionId,
  ObjectiveStatus,
  PlayerCombatState,
  RetrofitStage,
  RetrofitTechNode,
  SalvageInventory,
  SquadOrder,
  TacticalUnitVehicleState,
  TheaterObjective,
} from './types/systems';
import {
  advanceNodeAndRecalculateVehicle,
  applyConvoySalvageDrop,
  canAdvanceRetrofitStage,
  createInitialSalvageInventory,
  createInitialVehicleState,
  createTechTreeForFaction,
} from './systems/scavengeRetrofitSystem';
import { createInitialPlayerCombatState } from './systems/loadoutHealthSystem';
import { generateRegionalTheaterObjectives } from './systems/theaterMapGenerator';
import { AtmospherePreset } from './three/proceduralTextures';
import { TacticalArena3D } from './components/TacticalArena3D';
import { TacticalMenuOverlay } from './components/TacticalMenuOverlay';
import { HomeScreen } from './components/HomeScreen';
import { audioEngine } from './systems/audioEngine';
import { readCampaignSave, writeCampaignSave } from './systems/campaignSaveSystem';

export default function App() {
  const [isRoundActive, setIsRoundActive] = useState<boolean>(false);
  const [saveReady, setSaveReady] = useState(false);
  const [hasSave, setHasSave] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const [faction, setFaction] = useState<FactionId>(FactionId.EAST);
  const [atmosphere, setAtmosphere] = useState<AtmospherePreset>(AtmospherePreset.ALPINE_DAYLIGHT);

  const [playerState, setPlayerState] = useState<PlayerCombatState>(() =>
    createInitialPlayerCombatState(FactionId.EAST)
  );
  const [vehicleState, setVehicleState] = useState<TacticalUnitVehicleState>(() =>
    createInitialVehicleState(FactionId.EAST)
  );
  const [salvageInventory, setSalvageInventory] = useState<SalvageInventory>(() =>
    createInitialSalvageInventory(FactionId.EAST)
  );
  const [techNodes, setTechNodes] = useState<RetrofitTechNode[]>(() =>
    createTechTreeForFaction(FactionId.EAST)
  );

  // Restore once at startup; never autosave defaults over an existing campaign.
  useEffect(() => {
    const saved = readCampaignSave();
    if (saved) {
      setFaction(saved.faction);
      setPlayerState(saved.playerState);
      setVehicleState(saved.vehicleState);
      setSalvageInventory(saved.salvageInventory);
      setTechNodes(saved.techNodes);
      setActiveRun50(saved.objectives);
      setPinnedObjectiveUid(saved.pinnedObjectiveUid);
      setLivePlayerCoords(saved.playerCoords);
      setDeployRequest({ x: saved.playerCoords.x, z: saved.playerCoords.z, nonce: 1 });
      setHasSave(true);
    }
    setSaveReady(true);
  }, []);

  useEffect(() => {
    if (!saveReady) return;
    const ok = writeCampaignSave({
      faction, playerState, vehicleState, salvageInventory, techNodes,
      objectives: activeRun50, pinnedObjectiveUid, playerCoords: livePlayerCoords,
    });
    if (ok) setHasSave(true);
  }, [saveReady, faction, playerState, vehicleState, salvageInventory, techNodes,
      activeRun50, pinnedObjectiveUid, livePlayerCoords]);

  const initialTheater = useMemo(() => generateRegionalTheaterObjectives(849201), []);
  const [activeRun50, setActiveRun50] = useState<TheaterObjective[]>(
    initialTheater.activeRun50
  );
  const [pinnedObjectiveUid, setPinnedObjectiveUid] = useState<string | null>(
    initialTheater.activeRun50[0]?.uid ?? null
  );

  const [squadTargetCoords, setSquadTargetCoords] = useState<{ x: number; z: number } | null>(
    null
  );
  const [deployRequest, setDeployRequest] = useState<{
    x: number;
    z: number;
    nonce: number;
  } | null>(null);

  const [livePlayerCoords, setLivePlayerCoords] = useState<{
    x: number;
    z: number;
    yaw: number;
  }>({ x: 0, z: -10, yaw: 0 });
  const [liveVehicleCoords, setLiveVehicleCoords] = useState<{ x: number; z: number }>({
    x: -9.5,
    z: -14,
  });
  const [liveConvoyCoords, setLiveConvoyCoords] = useState<{
    x: number;
    z: number;
    intact: boolean;
  }>({ x: -95, z: -28, intact: true });

  const [toastBanner, setToastBanner] = useState<string | null>(null);
  const factionRef = useRef<FactionId>(faction);
  factionRef.current = faction;
  const roundActiveRef = useRef<boolean>(isRoundActive);
  roundActiveRef.current = isRoundActive;

  const showToast = useCallback((msg: string) => {
    setToastBanner(msg);
    window.setTimeout(() => {
      setToastBanner((curr) => (curr === msg ? null : curr));
    }, 3400);
  }, []);

  // Global Keyboard Shortcut: Press 'M' during an active round to toggle Map & Active Target Menu
  useEffect(() => {
    const onGlobalKeyDown = (e: KeyboardEvent) => {
      if (!roundActiveRef.current) return;
      if (
        document.activeElement &&
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)
      ) {
        return;
      }
      if (e.repeat) return;

      if (e.code === 'KeyM') {
        e.preventDefault();
        setIsMenuOpen((prev) => {
          const next = !prev;
          if (next && document.pointerLockElement) {
            document.exitPointerLock?.();
          }
          return next;
        });
      } else if (e.code === 'Escape') {
        setIsMenuOpen((prev) => (prev ? false : prev));
      }
    };

    window.addEventListener('keydown', onGlobalKeyDown);
    return () => window.removeEventListener('keydown', onGlobalKeyDown);
  }, []);

  const handleCompleteObjective = useCallback(
    (uid: string) => {
      setActiveRun50((prev) => {
        const target = prev.find((o) => o.uid === uid);
        if (!target || target.status === ObjectiveStatus.COMPLETED) {
          return prev;
        }

        const currentFaction = factionRef.current;
        setSalvageInventory((inv) => ({
          ...inv,
          rawScrapAlloy: inv.rawScrapAlloy + target.rewardScrap,
          westernCompositePlates:
            inv.westernCompositePlates +
            (currentFaction === FactionId.EAST ? target.rewardArmorUnits : 0),
          easternEraBlocks:
            inv.easternEraBlocks +
            (currentFaction === FactionId.WEST ? target.rewardArmorUnits : 0),
          encryptedFireControlChips: inv.encryptedFireControlChips + target.rewardChips,
        }));

        const nextList = prev.map((obj) =>
          obj.uid === uid ? { ...obj, status: ObjectiveStatus.COMPLETED } : obj
        );

        const nextPending = nextList.find((o) => o.status !== ObjectiveStatus.COMPLETED) ?? null;

        setPinnedObjectiveUid((currPin) => {
          if (currPin !== uid) return currPin;
          return nextPending?.uid ?? null;
        });

        showToast(
          nextPending
            ? `Target Cleared! (+${target.rewardScrap} Alloy, +${target.rewardArmorUnits} Plates) · Next Target Assigned`
            : `Target Cleared: ${target.title}`
        );

        return nextList;
      });
    },
    [showToast]
  );

  useEffect(() => {
    const onArenaCompleteObj = (ev: Event) => {
      const customEv = ev as CustomEvent<string>;
      if (typeof customEv.detail === 'string') {
        handleCompleteObjective(customEv.detail);
      }
    };
    window.addEventListener('iron-meridian-complete-obj', onArenaCompleteObj);
    return () => window.removeEventListener('iron-meridian-complete-obj', onArenaCompleteObj);
  }, [handleCompleteObjective]);

  const handleSelectFaction = useCallback((nextFaction: FactionId) => {
    setFaction(nextFaction);
    setPlayerState(createInitialPlayerCombatState(nextFaction));
    setVehicleState(createInitialVehicleState(nextFaction));
    setSalvageInventory(createInitialSalvageInventory(nextFaction));
    setTechNodes(createTechTreeForFaction(nextFaction));
    setSquadTargetCoords(null);
  }, []);

  const handleBeginRound = useCallback(() => {
    // Starting play never wipes campaign progress.
    setDeployRequest((prev) => ({
      x: livePlayerCoords.x, z: livePlayerCoords.z, nonce: (prev?.nonce ?? 0) + 1,
    }));
    setIsMenuOpen(false);
    setIsRoundActive(true);
    showToast('Campaign started — progress saves automatically in this browser');
  }, [showToast, livePlayerCoords.x, livePlayerCoords.z]);

  const handleContinueCampaign = useCallback(() => {
    setIsMenuOpen(false);
    setIsRoundActive(true);
    showToast('Campaign loaded — welcome back');
  }, [showToast]);

  const handleReturnHome = useCallback(() => {
    if (document.pointerLockElement) {
      document.exitPointerLock?.();
    }
    setIsMenuOpen(false);
    setIsRoundActive(false);
  }, []);

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
        vehicleState
      );
      setTechNodes(res.nodes);
      setSalvageInventory(res.inventory);
      setVehicleState(res.vehicle);
      audioEngine.playRetrofitInstall();
      showToast(res.eventMessage);
    },
    [techNodes, salvageInventory, vehicleState, showToast]
  );

  const handleQuickRetrofitNextNode = useCallback(() => {
    let workingNodes = [...techNodes];
    let workingInv = { ...salvageInventory };
    let workingVeh = { ...vehicleState };
    let upgraded = false;
    let lastMsg = 'Ammo, Armor & Medkits Resupplied at Squad APC';

    const candidate = workingNodes.find(
      (n) =>
        n.stage !== RetrofitStage.FIELD_RETROFITTED &&
        canAdvanceRetrofitStage(n, workingNodes, workingInv).allowed
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
          workingVeh
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

    showToast(upgraded ? `${lastMsg} · Loadout Resupplied` : lastMsg);
  }, [techNodes, salvageInventory, vehicleState, showToast]);

  const handleIssueSquadMoveOrder = useCallback(
    (x: number, z: number) => {
      setSquadTargetCoords({ x, z });
      setVehicleState((prev) => ({ ...prev, currentOrder: SquadOrder.HOLD_OVERWATCH }));
      showToast(`Squad APC Ordered to (${x}m, ${z}m)`);
    },
    [showToast]
  );

  const handleSetSquadOrder = useCallback(
    (order: SquadOrder) => {
      if (order === SquadOrder.FOLLOW_WEDGE || order === SquadOrder.ASSAULT_CONVOY) {
        setSquadTargetCoords(null);
      }
      setVehicleState((prev) => ({ ...prev, currentOrder: order }));
      showToast(`Squad Standing Order Updated`);
    },
    [showToast]
  );

  const handleSyncLiveCoords = useCallback(
    (
      player: { x: number; z: number; yaw: number },
      vehicle: { x: number; z: number },
      convoy: { x: number; z: number; intact: boolean }
    ) => {
      setLivePlayerCoords(player);
      setLiveVehicleCoords(vehicle);
      setLiveConvoyCoords(convoy);
    },
    []
  );

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0B0E13] text-[#E6ECF2]">
      {/* Non-Modal Feedback Banner */}
      {toastBanner && isRoundActive && (
        <div className="fixed top-5 right-5 z-50 max-w-md bg-[#11161F]/95 border border-[#F59E0B]/75 text-slate-100 px-4 py-2.5 rounded-lg text-xs font-medium shadow-xl pointer-events-none">
          {toastBanner}
        </div>
      )}

      {/* Home Page at Beginning of Game / Round */}
      {!isRoundActive && (
        <HomeScreen
          faction={faction}
          onSelectFaction={handleSelectFaction}
          onBeginRound={handleBeginRound}
          onContinue={handleContinueCampaign}
          hasSave={hasSave}
        />
      )}

      {/* 'M' Menu: Bigger Map, Active Target Order, Available Upgrades & Controls */}
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
          activeObjectives={activeRun50}
          pinnedObjectiveUid={pinnedObjectiveUid}
          onPinObjective={setPinnedObjectiveUid}
          playerCoords={livePlayerCoords}
          vehicleCoords={liveVehicleCoords}
          squadTargetCoords={squadTargetCoords}
          convoyCoords={liveConvoyCoords}
          onIssueSquadMoveOrder={handleIssueSquadMoveOrder}
          onAdvanceTechNode={handleAdvanceTechNode}
          onSetSquadOrder={handleSetSquadOrder}
        />
      )}

      {/* Full-Screen 3D Tactical Arena */}
      <TacticalArena3D
        isRoundActive={isRoundActive}
        isMenuOpen={isMenuOpen}
        onToggleMenu={() => setIsMenuOpen((prev) => !prev)}
        faction={faction}
        atmosphere={atmosphere}
        playerState={playerState}
        setPlayerState={setPlayerState}
        vehicleState={vehicleState}
        setVehicleState={setVehicleState}
        techNodes={techNodes}
        salvageInventory={salvageInventory}
        activeObjectives={activeRun50}
        pinnedObjectiveUid={pinnedObjectiveUid}
        squadTargetCoords={squadTargetCoords}
        deployRequest={deployRequest}
        onSyncLiveCoords={handleSyncLiveCoords}
        onLootConvoyCrate={handleLootConvoyCrate}
        onQuickRetrofitNextNode={handleQuickRetrofitNextNode}
      />
    </div>
  );
}
