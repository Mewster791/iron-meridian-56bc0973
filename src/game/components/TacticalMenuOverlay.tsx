import React, { useMemo, useState } from 'react';
import {
  FactionId,
  ObjectiveArchetype,
  ObjectiveStatus,
  PlayerCombatState,
  RetrofitStage,
  RetrofitTechNode,
  SalvageInventory,
  SquadOrder,
  TacticalUnitVehicleState,
  TheaterObjective,
} from '../types/systems';
import { canAdvanceRetrofitStage } from '../systems/scavengeRetrofitSystem';
import { ATMOSPHERE_CONFIGS, AtmospherePreset } from '../three/proceduralTextures';
import { TopographicalMapView } from './TopographicalMapCanvas';
import {
  Compass,
  Crosshair,
  Home,
  Keyboard,
  MapPin,
  Shield,
  Sun,
  Target,
  Wrench,
  X,
} from 'lucide-react';

type PlayerMenuTab = 'MAP_AND_TARGET' | 'UPGRADES' | 'CONTROLS';

interface TacticalMenuOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onReturnHome: () => void;
  faction: FactionId;
  atmosphere: AtmospherePreset;
  onChangeAtmosphere: (preset: AtmospherePreset) => void;
  playerState: PlayerCombatState;
  vehicleState: TacticalUnitVehicleState;
  techNodes: RetrofitTechNode[];
  salvageInventory: SalvageInventory;
  activeObjectives: TheaterObjective[];
  pinnedObjectiveUid: string | null;
  onPinObjective: (uid: string) => void;
  playerCoords: { x: number; z: number; yaw: number };
  vehicleCoords: { x: number; z: number };
  squadTargetCoords: { x: number; z: number } | null;
  convoyCoords: { x: number; z: number; intact: boolean };
  onIssueSquadMoveOrder: (x: number, z: number) => void;
  onAdvanceTechNode: (nodeId: string) => void;
  onSetSquadOrder: (order: SquadOrder) => void;
}

const SQUAD_ORDER_LABELS: Record<SquadOrder, string> = {
  [SquadOrder.FOLLOW_WEDGE]: 'Follow Operator',
  [SquadOrder.HOLD_OVERWATCH]: 'Hold Overwatch',
  [SquadOrder.ASSAULT_CONVOY]: 'Assault Convoy',
  [SquadOrder.SUPPRESS_SECTOR]: 'Suppress Enemies',
};

function getDirectiveVerb(archetype: ObjectiveArchetype): string {
  switch (archetype) {
    case ObjectiveArchetype.CONVOY_AMBUSH:
      return 'INTERCEPT & DESTROY';
    case ObjectiveArchetype.SAM_BATTERY_RAID:
      return 'RAID & ELIMINATE';
    case ObjectiveArchetype.ARMOR_SPEARHEAD_HALT:
      return 'DEFEAT ARMOR COLUMN';
    case ObjectiveArchetype.BRIDGE_INTERDICTION:
      return 'SECURE BRIDGEHEAD';
    case ObjectiveArchetype.COMMS_BUNKER_BREACH:
      return 'BREACH & CLEAR';
    default:
      return 'EXECUTE & CAPTURE';
  }
}

export const TacticalMenuOverlay: React.FC<TacticalMenuOverlayProps> = ({
  isOpen,
  onClose,
  onReturnHome,
  faction,
  atmosphere,
  onChangeAtmosphere,
  playerState,
  vehicleState,
  techNodes,
  salvageInventory,
  activeObjectives,
  pinnedObjectiveUid,
  onPinObjective,
  playerCoords,
  vehicleCoords,
  squadTargetCoords,
  convoyCoords,
  onIssueSquadMoveOrder,
  onAdvanceTechNode,
  onSetSquadOrder,
}) => {
  const [subTab, setSubTab] = useState<PlayerMenuTab>('MAP_AND_TARGET');

  const activeTarget = useMemo(() => {
    if (pinnedObjectiveUid) {
      const pinned = activeObjectives.find((o) => o.uid === pinnedObjectiveUid);
      if (pinned) return pinned;
    }
    return (
      activeObjectives.find((o) => o.status !== ObjectiveStatus.COMPLETED) ??
      activeObjectives[0] ??
      null
    );
  }, [activeObjectives, pinnedObjectiveUid]);

  if (!isOpen) return null;

  const completedCount = activeObjectives.filter(
    (o) => o.status === ObjectiveStatus.COMPLETED
  ).length;

  const readyUpgradeCount = techNodes.filter(
    (n) =>
      n.stage !== RetrofitStage.FIELD_RETROFITTED &&
      canAdvanceRetrofitStage(n, techNodes, salvageInventory).allowed
  ).length;

  const targetDistanceMeters = activeTarget
    ? Math.round(
        Math.hypot(activeTarget.worldX - playerCoords.x, activeTarget.worldZ - playerCoords.z)
      )
    : 0;

  const eraCount =
    faction === FactionId.EAST
      ? salvageInventory.westernCompositePlates
      : salvageInventory.easternEraBlocks;

  return (
    <div className="fixed inset-0 z-50 bg-[#070A0F]/95 flex flex-col text-[#E6ECF2] select-none">
      {/* Menu Header */}
      <div className="h-14 px-6 border-b border-slate-800 bg-[#0D1219] flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-5 overflow-x-auto">
          <span className="font-display text-xl font-bold tracking-wide text-white uppercase whitespace-nowrap">
            Tactical Map &amp; Orders
          </span>

          <div className="flex items-center gap-1 p-1 bg-[#090D12] border border-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setSubTab('MAP_AND_TARGET')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                subTab === 'MAP_AND_TARGET'
                  ? 'bg-[#F59E0B] text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Map &amp; Active Target ({completedCount}/{activeObjectives.length})
            </button>
            <button
              type="button"
              onClick={() => setSubTab('UPGRADES')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                subTab === 'UPGRADES'
                  ? 'bg-[#F59E0B] text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Upgrades{readyUpgradeCount > 0 ? ` (${readyUpgradeCount} Ready)` : ''}
            </button>
            <button
              type="button"
              onClick={() => setSubTab('CONTROLS')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                subTab === 'CONTROLS'
                  ? 'bg-[#F59E0B] text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Controls
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onReturnHome}
            className="px-3 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-xs font-medium text-slate-200 flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Home className="w-3.5 h-3.5" />
            <span>Home Page</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg bg-[#F59E0B] hover:bg-amber-400 text-xs font-semibold text-slate-950 flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            <span>Resume [M]</span>
          </button>
        </div>
      </div>

      {/* Menu Body */}
      <div className="flex-1 overflow-y-auto p-5 md:p-6">
        {subTab === 'MAP_AND_TARGET' && (
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Left 7 Columns: Bigger Topographical Sector Map */}
            <div className="lg:col-span-7 bg-[#11161F] border border-slate-800 rounded-xl p-4 flex flex-col space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="font-semibold text-white flex items-center gap-2">
                  <Compass className="w-4 h-4 text-[#F59E0B]" />
                  <span>Regional Operations Map (Click any pin to set target · Click terrain to move APC)</span>
                </div>
              </div>

              <div className="aspect-square w-full max-h-[64vh] mx-auto rounded-lg overflow-hidden border border-slate-700/80 bg-[#0B0E13] cursor-crosshair">
                <TopographicalMapView
                  objectives={activeObjectives}
                  selectedObjectiveUid={activeTarget?.uid ?? null}
                  pinnedObjectiveUid={activeTarget?.uid ?? null}
                  playerCoords={playerCoords}
                  vehicleCoords={vehicleCoords}
                  squadTargetCoords={squadTargetCoords}
                  convoyCoords={convoyCoords}
                  onSelectObjective={(obj) => onPinObjective(obj.uid)}
                  onClickMapWorldPoint={(wx, wz) => onIssueSquadMoveOrder(wx, wz)}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-400">
                <span>Cyan Arrow: You · Green Square: Squad APC · Red Diamond: Enemy Convoy</span>
                <span>Sky-Blue Pin: Current Target Order</span>
              </div>
            </div>

            {/* Right 5 Columns: Active Order / Target to Defeat & Execute */}
            <div className="lg:col-span-5 flex flex-col justify-between space-y-4">
              {/* Primary Order / Target Card */}
              {activeTarget && (
                <div className="bg-[#11161F] border-2 border-[#F59E0B]/80 rounded-xl p-5 space-y-3.5">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-[#F59E0B] font-semibold flex items-center gap-1.5">
                      <Target className="w-4 h-4" />
                      ACTIVE ORDER · {getDirectiveVerb(activeTarget.archetype)}
                    </span>
                    <span className="text-sky-300 tabular-nums">{targetDistanceMeters}m away</span>
                  </div>

                  <div>
                    <h2 className="text-xl font-bold text-white leading-snug">
                      {activeTarget.title}
                    </h2>
                    <div className="text-xs font-mono text-slate-400 mt-1 tabular-nums">
                      Sector: {activeTarget.biome.replace('_', ' ')} · Threat Level {activeTarget.threatTier}
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-[#0B0E13] border border-slate-800 space-y-1 text-xs">
                    <div className="text-slate-200 font-medium">
                      Mission Execution &amp; Upgrade Reward:
                    </div>
                    <div className="text-slate-400">
                      Move into target perimeter and neutralize hostile defenders, or intercept the
                      enemy armored convoy along the northern highway to capture upgrade crates.
                    </div>
                    <div className="text-[#F59E0B] font-mono pt-1 tabular-nums">
                      Reward: +{activeTarget.rewardScrap} Alloy · +{activeTarget.rewardArmorUnits}{' '}
                      Armor Plates · +{activeTarget.rewardChips} Tech Chips
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() =>
                        onIssueSquadMoveOrder(activeTarget.worldX, activeTarget.worldZ)
                      }
                      className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Crosshair className="w-3.5 h-3.5" />
                      <span>Order Squad APC to Target</span>
                    </button>

                    <button
                      type="button"
                      onClick={onClose}
                      className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <MapPin className="w-3.5 h-3.5 text-sky-400" />
                      <span>Track on 3D HUD</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Squad Standing Orders */}
              <div className="bg-[#11161F] border border-slate-800 rounded-xl p-4 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-white">Squad Standing Order [Key F]</span>
                  <span className="font-mono text-slate-400 tabular-nums">
                    APC Armor {vehicleState.armorPlatingHp}/{vehicleState.maxArmorPlatingHp}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {Object.values(SquadOrder).map((ord) => (
                    <button
                      key={ord}
                      type="button"
                      onClick={() => onSetSquadOrder(ord)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left cursor-pointer ${
                        vehicleState.currentOrder === ord
                          ? 'bg-emerald-600 text-white font-semibold'
                          : 'bg-[#0B0E13] text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {SQUAD_ORDER_LABELS[ord]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Other Targets to Execute in Sector */}
              <div className="bg-[#11161F] border border-slate-800 rounded-xl p-4 flex-1 flex flex-col space-y-2.5 min-h-[200px] max-h-[260px]">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-white">Select Target to Execute</span>
                  <span className="font-mono text-slate-400 tabular-nums">
                    {completedCount}/{activeObjectives.length} Cleared
                  </span>
                </div>

                <div className="overflow-y-auto space-y-1 pr-1 text-xs font-mono tabular-nums">
                  {activeObjectives.map((obj) => {
                    const isPinned = activeTarget?.uid === obj.uid;
                    const isDone = obj.status === ObjectiveStatus.COMPLETED;
                    const dist = Math.round(
                      Math.hypot(obj.worldX - playerCoords.x, obj.worldZ - playerCoords.z)
                    );
                    return (
                      <button
                        key={obj.uid}
                        type="button"
                        onClick={() => onPinObjective(obj.uid)}
                        className={`w-full text-left px-3 py-2 rounded-md flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                          isPinned
                            ? 'bg-sky-500/20 border border-sky-400/60 text-white'
                            : 'bg-[#0B0E13] text-slate-300 hover:bg-slate-800/70'
                        }`}
                      >
                        <span className="truncate">
                          {String(obj.runOrderIndex).padStart(2, '0')}. {obj.title}
                        </span>
                        <span
                          className={
                            isDone
                              ? 'text-emerald-400 shrink-0'
                              : isPinned
                                ? 'text-sky-300 shrink-0'
                                : 'text-slate-400 shrink-0'
                          }
                        >
                          {isDone ? 'CLEARED' : isPinned ? `TARGET (${dist}m)` : `${dist}m`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {subTab === 'UPGRADES' && (
          <div className="max-w-5xl mx-auto space-y-6">
            {/* Salvage Materials Header */}
            <div className="bg-[#11161F] border border-slate-800 rounded-xl p-5 grid grid-cols-2 md:grid-cols-4 gap-4 font-mono text-xs tabular-nums">
              <div>
                <div className="text-slate-400">Squad Carrier</div>
                <div className="text-sm font-semibold text-white mt-0.5">
                  {vehicleState.chassisDesignation}
                </div>
              </div>
              <div>
                <div className="text-slate-400">Scrap Alloy</div>
                <div className="text-base font-semibold text-white mt-0.5">
                  {salvageInventory.rawScrapAlloy}
                </div>
              </div>
              <div>
                <div className="text-slate-400">Looted Armor Plates</div>
                <div className="text-base font-semibold text-[#F59E0B] mt-0.5">{eraCount}</div>
              </div>
              <div>
                <div className="text-slate-400">Tech Chips</div>
                <div className="text-base font-semibold text-sky-400 mt-0.5">
                  {salvageInventory.encryptedFireControlChips}
                </div>
              </div>
            </div>

            {/* Upgrade Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {techNodes.map((node) => {
                const check = canAdvanceRetrofitStage(node, techNodes, salvageInventory);
                const installed = node.stage === RetrofitStage.FIELD_RETROFITTED;
                return (
                  <div
                    key={node.id}
                    className={`bg-[#11161F] border rounded-xl p-5 flex flex-col justify-between space-y-4 ${
                      installed
                        ? 'border-emerald-500/60'
                        : check.allowed
                          ? 'border-[#F59E0B]/70'
                          : 'border-slate-800'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-slate-400">Unit Upgrade</span>
                        <span
                          className={
                            installed
                              ? 'text-emerald-400 font-semibold'
                              : check.allowed
                                ? 'text-[#F59E0B] font-semibold'
                                : 'text-slate-500'
                          }
                        >
                          {installed
                            ? 'EQUIPPED'
                            : node.stage === RetrofitStage.LOCKED_UNSEEN
                              ? 'LOOT CONVOY TO UNLOCK'
                              : 'IN PROGRESS'}
                        </span>
                      </div>
                      <h3 className="text-lg font-semibold text-white">{node.name}</h3>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        {node.statModifiers.vehicleMaxArmorBonus > 0 &&
                          `+${node.statModifiers.vehicleMaxArmorBonus} APC Armor Health · `}
                        {node.statModifiers.shapedChargeMitigationBonus > 0 &&
                          `+${Math.round(
                            node.statModifiers.shapedChargeMitigationBonus * 100
                          )}% Blast Resistance · `}
                        {node.statModifiers.apsInterceptCharges > 0 &&
                          `+${node.statModifiers.apsInterceptCharges} Active Defense Charges · `}
                        {node.statModifiers.squadFirepowerMultiplier > 1 &&
                          `+${Math.round(
                            (node.statModifiers.squadFirepowerMultiplier - 1) * 100
                          )}% Squad Firepower · `}
                        {node.sourceDescription}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-slate-800 text-xs font-mono tabular-nums">
                      <span className="text-slate-300">
                        Cost: {node.costScrapAlloy} Alloy · {node.costArmorUnits} Plates ·{' '}
                        {node.costControlChips} Chips
                      </span>
                      <button
                        type="button"
                        disabled={!check.allowed}
                        onClick={() => onAdvanceTechNode(node.id)}
                        className={`px-3.5 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-colors ${
                          installed
                            ? 'bg-emerald-950/70 text-emerald-300 cursor-default'
                            : check.allowed
                              ? 'bg-[#F59E0B] text-slate-950 hover:bg-amber-400 cursor-pointer'
                              : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        }`}
                      >
                        {installed ? (
                          <Shield className="w-3.5 h-3.5" />
                        ) : (
                          <Wrench className="w-3.5 h-3.5" />
                        )}
                        <span>
                          {installed
                            ? 'Installed'
                            : check.allowed
                              ? node.stage === RetrofitStage.ADAPTER_FABRICATED
                                ? 'Equip Upgrade'
                                : 'Upgrade Step'
                              : 'Need Salvage'}
                        </span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {subTab === 'CONTROLS' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-[#11161F] border border-slate-800 rounded-xl p-6 space-y-4">
              <div className="flex items-center gap-2 text-base font-semibold text-white">
                <Keyboard className="w-4 h-4 text-[#F59E0B]" />
                <span>Player Controls</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
                <div className="flex justify-between px-3.5 py-2.5 rounded-lg bg-[#0B0E13] border border-slate-800">
                  <span className="text-slate-300 font-sans">Move / Sprint / Jump</span>
                  <span className="text-[#F59E0B]">WASD / Shift / Space</span>
                </div>
                <div className="flex justify-between px-3.5 py-2.5 rounded-lg bg-[#0B0E13] border border-slate-800">
                  <span className="text-slate-300 font-sans">Aim &amp; Shoot</span>
                  <span className="text-[#F59E0B]">Mouse + Left-Click (or J)</span>
                </div>
                <div className="flex justify-between px-3.5 py-2.5 rounded-lg bg-[#0B0E13] border border-slate-800">
                  <span className="text-slate-300 font-sans">Aim Down Sights (ADS)</span>
                  <span className="text-[#F59E0B]">Right-Click (or Z)</span>
                </div>
                <div className="flex justify-between px-3.5 py-2.5 rounded-lg bg-[#0B0E13] border border-slate-800">
                  <span className="text-slate-300 font-sans">Toggle 1st / 3rd Person POV</span>
                  <span className="text-[#F59E0B]">C</span>
                </div>
                <div className="flex justify-between px-3.5 py-2.5 rounded-lg bg-[#0B0E13] border border-slate-800">
                  <span className="text-slate-300 font-sans">Swap Camera Shoulder</span>
                  <span className="text-[#F59E0B]">Q</span>
                </div>
                <div className="flex justify-between px-3.5 py-2.5 rounded-lg bg-[#0B0E13] border border-slate-800">
                  <span className="text-slate-300 font-sans">Reload Rifle</span>
                  <span className="text-[#F59E0B]">R</span>
                </div>
                <div className="flex justify-between px-3.5 py-2.5 rounded-lg bg-[#0B0E13] border border-slate-800">
                  <span className="text-slate-300 font-sans">Switch Rifle / Sword</span>
                  <span className="text-[#F59E0B]">1 / 2 (V Quick Slash)</span>
                </div>
                <div className="flex justify-between px-3.5 py-2.5 rounded-lg bg-[#0B0E13] border border-slate-800">
                  <span className="text-slate-300 font-sans">Use Medkit (+HP)</span>
                  <span className="text-[#F59E0B]">4 ({playerState.medkitsRemaining} left)</span>
                </div>
                <div className="flex justify-between px-3.5 py-2.5 rounded-lg bg-[#0B0E13] border border-slate-800">
                  <span className="text-slate-300 font-sans">Loot Crate / Resupply &amp; Upgrade at APC</span>
                  <span className="text-[#F59E0B]">E</span>
                </div>
                <div className="flex justify-between px-3.5 py-2.5 rounded-lg bg-[#0B0E13] border border-slate-800">
                  <span className="text-slate-300 font-sans">Open Map &amp; Target Order</span>
                  <span className="text-[#F59E0B]">M</span>
                </div>
              </div>
            </div>

            {/* Weather / Time-of-Day Setting */}
            <div className="bg-[#11161F] border border-slate-800 rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Sun className="w-4 h-4 text-[#F59E0B]" />
                <span>Time of Day &amp; Visibility</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {(Object.keys(ATMOSPHERE_CONFIGS) as AtmospherePreset[]).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => onChangeAtmosphere(preset)}
                    className={`px-3.5 py-2.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                      atmosphere === preset
                        ? 'bg-[#F59E0B] text-slate-950 border-[#F59E0B]'
                        : 'bg-[#0B0E13] text-slate-300 border-slate-800 hover:border-slate-600'
                    }`}
                  >
                    {ATMOSPHERE_CONFIGS[preset].label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
