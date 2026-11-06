import React, { useState } from "react";
import {
  FactionId,
  PlayerCombatState,
  RetrofitStage,
  RetrofitTechNode,
  SalvageInventory,
  SquadOrder,
  TacticalUnitVehicleState,
} from "../types/systems";
import { canAdvanceRetrofitStage } from "../systems/scavengeRetrofitSystem";
import { ATMOSPHERE_CONFIGS, AtmospherePreset } from "../three/proceduralTextures";
import { CityMapView } from "./CityMapView";
import { ACT_TITLES, LORE_DOSSIERS, MISSIONS } from "../campaign/campaignData";
import {
  CampaignProgress,
  formatPlayTime,
  getCurrentMission,
  getStepBuilding,
  getStepWaypoint,
} from "../campaign/campaignRules";
import {
  BookOpen,
  CheckCircle2,
  Circle,
  Compass,
  Crosshair,
  Download,
  Headphones,
  Home,
  Keyboard,
  Loader2,
  Shield,
  Sparkles,
  Sun,
  Target,
  Volume2,
  VolumeX,
  Wrench,
  X,
} from "lucide-react";
import { SOUNDTRACK_TRACKS, SoundtrackId, musicEngine } from "../systems/musicEngine";

type PlayerMenuTab = "MAP_AND_MISSION" | "JOURNAL" | "UPGRADES" | "SOUNDTRACK" | "CONTROLS";

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
  campaign: CampaignProgress;
  playerCoords: { x: number; z: number; yaw: number };
  vehicleCoords: { x: number; z: number };
  squadTargetCoords: { x: number; z: number } | null;
  convoyCoords: { x: number; z: number; intact: boolean };
  onIssueSquadMoveOrder: (x: number, z: number) => void;
  onAdvanceTechNode: (nodeId: string) => void;
  onSetSquadOrder: (order: SquadOrder) => void;
}

const SQUAD_ORDER_LABELS: Record<SquadOrder, string> = {
  [SquadOrder.FOLLOW_WEDGE]: "Follow Operator",
  [SquadOrder.HOLD_OVERWATCH]: "Hold Position",
  [SquadOrder.ASSAULT_CONVOY]: "Assault Convoy",
  [SquadOrder.SUPPRESS_SECTOR]: "Move to Map Point",
};

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
  campaign,
  playerCoords,
  vehicleCoords,
  squadTargetCoords,
  convoyCoords,
  onIssueSquadMoveOrder,
  onAdvanceTechNode,
  onSetSquadOrder,
}) => {
  const [subTab, setSubTab] = useState<PlayerMenuTab>("MAP_AND_MISSION");
  const [activeTrack, setActiveTrack] = useState<SoundtrackId>(() => musicEngine.getActiveTrack());
  const [isMuted, setIsMuted] = useState<boolean>(() => musicEngine.isMuted());
  const [downloadingTrack, setDownloadingTrack] = useState<SoundtrackId | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState<SoundtrackId | null>(null);

  const handleSelectTrack = (trackId: SoundtrackId) => {
    musicEngine.setActiveTrack(trackId);
    setActiveTrack(trackId);
  };

  const handleToggleMute = () => {
    const next = !musicEngine.isMuted();
    musicEngine.setMuted(next);
    setIsMuted(next);
  };

  const handleDownloadTrack = async (trackId: SoundtrackId, e: React.MouseEvent) => {
    e.stopPropagation();
    setDownloadingTrack(trackId);
    try {
      await musicEngine.downloadTrack(trackId);
      setDownloadSuccess(trackId);
      window.setTimeout(() => setDownloadSuccess(null), 3500);
    } catch (err) {
      console.error("Download failed", err);
    } finally {
      setDownloadingTrack(null);
    }
  };

  if (!isOpen) return null;

  const mission = getCurrentMission(campaign);
  const step = mission ? mission.steps[campaign.stepIndex] : null;
  const waypoint = getStepWaypoint(step);
  const targetBuilding = getStepBuilding(step);
  const waypointDist = waypoint
    ? Math.round(Math.hypot(waypoint.x - playerCoords.x, waypoint.z - playerCoords.z))
    : 0;

  const readyUpgradeCount = techNodes.filter(
    (n) =>
      n.stage !== RetrofitStage.FIELD_RETROFITTED &&
      canAdvanceRetrofitStage(n, techNodes, salvageInventory).allowed,
  ).length;

  const eraCount =
    faction === FactionId.EAST
      ? salvageInventory.westernCompositePlates
      : salvageInventory.easternEraBlocks;

  const tabs: Array<{ id: PlayerMenuTab; label: string }> = [
    {
      id: "MAP_AND_MISSION",
      label: `Map & Mission (${campaign.completedMissionIds.length}/${MISSIONS.length})`,
    },
    {
      id: "JOURNAL",
      label: `Journal (${campaign.dossiersFound.length}/${LORE_DOSSIERS.length} dossiers)`,
    },
    {
      id: "UPGRADES",
      label: `Upgrades${readyUpgradeCount > 0 ? ` (${readyUpgradeCount} Ready)` : ""}`,
    },
    { id: "SOUNDTRACK", label: "Soundtrack" },
    { id: "CONTROLS", label: "Controls" },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-[#070A0F]/95 flex flex-col text-[#E6ECF2] select-none">
      {/* Menu Header */}
      <div className="h-14 px-6 border-b border-slate-800 bg-[#0D1219] flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-5 overflow-x-auto">
          <span className="font-display text-xl font-bold tracking-wide text-white uppercase whitespace-nowrap">
            Varos-Meridian
          </span>

          <div className="flex items-center gap-1 p-1 bg-[#090D12] border border-slate-800 rounded-lg">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSubTab(t.id)}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  subTab === t.id
                    ? "bg-[#F59E0B] text-slate-950 font-semibold"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                {t.label}
              </button>
            ))}
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
        {subTab === "MAP_AND_MISSION" && (
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            <div className="lg:col-span-7 bg-[#11161F] border border-slate-800 rounded-xl p-4 flex flex-col space-y-3">
              <div className="font-semibold text-white flex items-center gap-2 text-xs">
                <Compass className="w-4 h-4 text-[#F59E0B]" />
                <span>City map · click anywhere to send the squad APC there</span>
              </div>
              <div className="aspect-square w-full max-h-[64vh] mx-auto rounded-lg overflow-hidden border border-slate-700/80 bg-[#0B0E13] cursor-crosshair">
                <CityMapView
                  playerCoords={playerCoords}
                  vehicleCoords={vehicleCoords}
                  squadTargetCoords={squadTargetCoords}
                  convoyCoords={convoyCoords}
                  waypoint={waypoint ? { x: waypoint.x, z: waypoint.z } : null}
                  targetBuildingId={targetBuilding?.id ?? null}
                  destroyedBuildingIds={campaign.destroyedBuildingIds}
                  onClickMapWorldPoint={(wx, wz) => onIssueSquadMoveOrder(wx, wz)}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-400">
                <span>Blue arrow: you · Green: squad APC · Red diamond: convoy</span>
                <span>Amber: mission building · Green building: safehouse</span>
              </div>
            </div>

            <div className="lg:col-span-5 flex flex-col space-y-4">
              {mission ? (
                <div className="bg-[#11161F] border-2 border-[#F59E0B]/80 rounded-xl p-5 space-y-3.5">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-[#F59E0B] font-semibold flex items-center gap-1.5">
                      <Target className="w-4 h-4" />
                      {ACT_TITLES[mission.act].title.toUpperCase()} · MISSION {mission.number}
                    </span>
                    {waypoint && (
                      <span className="text-sky-300 tabular-nums">{waypointDist}m away</span>
                    )}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white leading-snug">{mission.title}</h2>
                    <div className="text-xs font-mono text-slate-400 mt-1">{mission.location}</div>
                  </div>
                  <div className="space-y-2 text-xs text-slate-300 leading-relaxed">
                    {mission.briefing.map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                  </div>
                  <ol className="space-y-1.5 text-xs">
                    {mission.steps.map((s, i) => {
                      const done = i < campaign.stepIndex;
                      const current = i === campaign.stepIndex;
                      return (
                        <li
                          key={`${s.type}-${i}`}
                          className={`flex items-start gap-2 ${done ? "text-emerald-400" : current ? "text-white font-semibold" : "text-slate-500"}`}
                        >
                          {done ? (
                            <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                          ) : (
                            <Circle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                          )}
                          <span>{s.text}</span>
                        </li>
                      );
                    })}
                  </ol>
                  <div className="text-[#F59E0B] font-mono text-xs tabular-nums pt-1 border-t border-slate-800">
                    Reward: +{mission.reward.scrap} alloy · +{mission.reward.plates} plates · +
                    {mission.reward.chips} chips
                  </div>
                  {waypoint && (
                    <button
                      type="button"
                      onClick={() => onIssueSquadMoveOrder(waypoint.x, waypoint.z)}
                      className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Crosshair className="w-3.5 h-3.5" />
                      <span>Send squad APC to the objective</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="bg-[#11161F] border-2 border-emerald-500/70 rounded-xl p-5 space-y-2">
                  <h2 className="text-xl font-bold text-white">Campaign complete</h2>
                  <p className="text-xs text-slate-300">
                    Varos-Meridian is free. You can keep exploring, looting and upgrading.
                  </p>
                </div>
              )}

              <div className="bg-[#11161F] border border-slate-800 rounded-xl p-4 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-white">Squad order [F]</span>
                  <span className="font-mono text-slate-400 tabular-nums">
                    APC armor {vehicleState.armorPlatingHp}/{vehicleState.maxArmorPlatingHp}
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
                          ? "bg-emerald-600 text-white font-semibold"
                          : "bg-[#0B0E13] text-slate-300 hover:bg-slate-800"
                      }`}
                    >
                      {SQUAD_ORDER_LABELS[ord]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-[#11161F] border border-slate-800 rounded-xl p-4 grid grid-cols-3 gap-3 text-xs font-mono tabular-nums">
                <div>
                  <div className="text-slate-400">Time played</div>
                  <div className="text-white font-semibold mt-0.5">
                    {formatPlayTime(campaign.playTimeSec)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">Times down</div>
                  <div className="text-white font-semibold mt-0.5">{campaign.deaths}</div>
                </div>
                <div>
                  <div className="text-slate-400">Crates searched</div>
                  <div className="text-white font-semibold mt-0.5">{campaign.lootedIds.length}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {subTab === "JOURNAL" && (
          <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-[#11161F] border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <BookOpen className="w-4 h-4 text-[#F59E0B]" />
                <span>Campaign log</span>
              </div>
              {([1, 2, 3] as const).map((act) => (
                <div key={act} className="space-y-1.5">
                  <div className="text-xs font-mono text-[#F59E0B]">{ACT_TITLES[act].title}</div>
                  {MISSIONS.filter((m) => m.act === act).map((m) => {
                    const done = campaign.completedMissionIds.includes(m.id);
                    const current = mission?.id === m.id;
                    return (
                      <div
                        key={m.id}
                        className={`text-xs ${done ? "text-slate-300" : current ? "text-white font-semibold" : "text-slate-600"}`}
                      >
                        <div>
                          {m.number}. {done || current ? m.title : "???"}
                          {current && (
                            <span className="text-[#F59E0B] font-mono"> · in progress</span>
                          )}
                        </div>
                        {done && (
                          <div className="text-[11px] text-slate-500 leading-relaxed">
                            {m.outro}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="bg-[#11161F] border border-slate-800 rounded-xl p-5 space-y-3">
              <div className="text-sm font-semibold text-white">Dossiers found in the city</div>
              <p className="text-[11px] text-slate-400">
                Gold document cases are hidden in buildings across Varos-Meridian.
              </p>
              {LORE_DOSSIERS.map((doc) => {
                const found = campaign.dossiersFound.includes(doc.id);
                return (
                  <div key={doc.id} className="p-3 rounded-lg bg-[#0B0E13] border border-slate-800">
                    <div
                      className={`text-xs font-semibold ${found ? "text-white" : "text-slate-600"}`}
                    >
                      {found ? doc.title : "Undiscovered dossier"}
                    </div>
                    {found && (
                      <div className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                        {doc.text}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {subTab === "UPGRADES" && (
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
                        ? "border-emerald-500/60"
                        : check.allowed
                          ? "border-[#F59E0B]/70"
                          : "border-slate-800"
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-slate-400">Unit Upgrade</span>
                        <span
                          className={
                            installed
                              ? "text-emerald-400 font-semibold"
                              : check.allowed
                                ? "text-[#F59E0B] font-semibold"
                                : "text-slate-500"
                          }
                        >
                          {installed
                            ? "EQUIPPED"
                            : node.stage === RetrofitStage.LOCKED_UNSEEN
                              ? "LOOT CONVOYS TO UNLOCK"
                              : "IN PROGRESS"}
                        </span>
                      </div>
                      <h3 className="text-lg font-semibold text-white">{node.name}</h3>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        {node.statModifiers.vehicleMaxArmorBonus > 0 &&
                          `+${node.statModifiers.vehicleMaxArmorBonus} APC Armor Health · `}
                        {node.statModifiers.shapedChargeMitigationBonus > 0 &&
                          `+${Math.round(
                            node.statModifiers.shapedChargeMitigationBonus * 100,
                          )}% Blast Resistance · `}
                        {node.statModifiers.apsInterceptCharges > 0 &&
                          `+${node.statModifiers.apsInterceptCharges} Active Defense Charges · `}
                        {node.statModifiers.squadFirepowerMultiplier > 1 &&
                          `+${Math.round(
                            (node.statModifiers.squadFirepowerMultiplier - 1) * 100,
                          )}% Squad Firepower · `}
                        {node.sourceDescription}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-slate-800 text-xs font-mono tabular-nums">
                      <span className="text-slate-300">
                        Cost: {node.costScrapAlloy} Alloy · {node.costArmorUnits} Plates ·{" "}
                        {node.costControlChips} Chips
                      </span>
                      <button
                        type="button"
                        disabled={!check.allowed}
                        onClick={() => onAdvanceTechNode(node.id)}
                        className={`px-3.5 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-colors ${
                          installed
                            ? "bg-emerald-950/70 text-emerald-300 cursor-default"
                            : check.allowed
                              ? "bg-[#F59E0B] text-slate-950 hover:bg-amber-400 cursor-pointer"
                              : "bg-slate-800 text-slate-500 cursor-not-allowed"
                        }`}
                      >
                        {installed ? (
                          <Shield className="w-3.5 h-3.5" />
                        ) : (
                          <Wrench className="w-3.5 h-3.5" />
                        )}
                        <span>
                          {installed
                            ? "Installed"
                            : check.allowed
                              ? node.stage === RetrofitStage.ADAPTER_FABRICATED
                                ? "Equip Upgrade"
                                : "Upgrade Step"
                              : "Need Salvage"}
                        </span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {subTab === "CONTROLS" && (
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
                  <span className="text-slate-300 font-sans">
                    Search crates · rest · APC (hold to plant / download)
                  </span>
                  <span className="text-[#F59E0B]">E</span>
                </div>
                <div className="flex justify-between px-3.5 py-2.5 rounded-lg bg-[#0B0E13] border border-slate-800">
                  <span className="text-slate-300 font-sans">Detonate a planted charge</span>
                  <span className="text-[#F59E0B]">G</span>
                </div>
                <div className="flex justify-between px-3.5 py-2.5 rounded-lg bg-[#0B0E13] border border-slate-800">
                  <span className="text-slate-300 font-sans">Open map, mission &amp; journal</span>
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
                        ? "bg-[#F59E0B] text-slate-950 border-[#F59E0B]"
                        : "bg-[#0B0E13] text-slate-300 border-slate-800 hover:border-slate-600"
                    }`}
                  >
                    {ATMOSPHERE_CONFIGS[preset].label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab: SOUNDTRACK */}
        {subTab === "SOUNDTRACK" && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <div className="text-xs font-mono uppercase tracking-widest text-[#F59E0B]">
                  Audio Control &amp; Master Tracks
                </div>
                <h2 className="font-display text-2xl font-bold tracking-wide text-white uppercase">
                  Varos-Meridian Soundtrack
                </h2>
              </div>

              <button
                type="button"
                onClick={handleToggleMute}
                className="px-4 py-2 rounded-lg bg-[#141C27] hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-white flex items-center gap-2 transition-colors cursor-pointer"
              >
                {isMuted ? (
                  <>
                    <VolumeX className="w-4 h-4 text-red-400" />
                    <span>Music Muted (Turn On)</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-4 h-4 text-[#F59E0B]" />
                    <span>Music Active (Mute)</span>
                  </>
                )}
              </button>
            </div>

            <div className="space-y-4">
              <div className="text-xs text-slate-400">
                Switch active soundtrack version on the fly or download high-fidelity audio files to
                your device for offline listening.
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {SOUNDTRACK_TRACKS.map((t) => {
                  const isPlaying = activeTrack === t.id;
                  const isDownloading = downloadingTrack === t.id;
                  const isSuccess = downloadSuccess === t.id;
                  return (
                    <div
                      key={t.id}
                      onClick={() => handleSelectTrack(t.id)}
                      className={`relative p-5 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between gap-4 ${
                        isPlaying
                          ? "border-[#F59E0B] bg-[#141C27] shadow-xl shadow-amber-950/20"
                          : "border-slate-800 bg-[#0D1219] hover:border-slate-700"
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                              isPlaying
                                ? "bg-[#F59E0B] text-slate-950"
                                : "bg-slate-800 text-slate-400"
                            }`}
                          >
                            {t.version}
                          </span>
                          <span className="text-xs font-mono text-slate-400">{t.format}</span>
                        </div>
                        <div className="text-sm font-bold text-white tracking-wide">{t.title}</div>
                        <p className="text-xs text-slate-400 leading-relaxed">{t.description}</p>
                      </div>

                      <div className="space-y-3 pt-3 border-t border-slate-800/80">
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-xs font-mono font-medium flex items-center gap-1.5 ${
                              isPlaying ? "text-[#F59E0B]" : "text-slate-400"
                            }`}
                          >
                            {isPlaying && (
                              <span className="inline-block w-2 h-2 rounded-full bg-[#F59E0B] animate-pulse" />
                            )}
                            {isPlaying ? "NOW PLAYING" : "CLICK TO PLAY"}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => handleDownloadTrack(t.id, e)}
                          disabled={isDownloading}
                          title={`Download ${t.title} (${t.format})`}
                          className="w-full py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 text-xs font-mono flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
                        >
                          {isDownloading ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#F59E0B]" />
                              <span>
                                {t.id === "iron-bow-original"
                                  ? "Rendering WAV..."
                                  : "Downloading..."}
                              </span>
                            </>
                          ) : isSuccess ? (
                            <>
                              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-emerald-400">Downloaded to device!</span>
                            </>
                          ) : (
                            <>
                              <Download className="w-3.5 h-3.5" />
                              <span>Download {t.format}</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
