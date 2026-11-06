import React, { useState } from "react";
import { FactionId } from "../types/systems";
import { FACTION_EMERGENCY_SWORDS, FACTION_PRIMARY_FIREARMS } from "../systems/loadoutHealthSystem";
import {
  Cloud,
  CloudOff,
  Crosshair,
  Download,
  Headphones,
  Keyboard,
  Loader2,
  LogOut,
  Music,
  Play,
  Shield,
  Sparkles,
  Sword,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { SOUNDTRACK_TRACKS, SoundtrackId, musicEngine } from "../systems/musicEngine";

export interface SaveSummary {
  faction: FactionId;
  missionLabel: string;
  missionsDone: number;
  missionsTotal: number;
  playTime: string;
}

interface HomeScreenProps {
  onNewCampaign: (faction: FactionId) => void;
  onContinue: () => void;
  save: SaveSummary | null;
  accountEmail: string | null;
  accountReady: boolean;
  cloudStatus: string | null;
  onSignIn: () => void;
  onSignOut: () => void;
}

const CONTROLS_LIST: Array<{ action: string; keys: string }> = [
  { action: "Move Operator", keys: "W A S D" },
  { action: "Sprint / Jump", keys: "Shift / Space" },
  { action: "Aim & Fire Weapon", keys: "Mouse + Left-Click (or J)" },
  { action: "Aim Down Sights (ADS)", keys: "Right-Click (or Z)" },
  { action: "Toggle 1st / 3rd Person POV", keys: "C" },
  { action: "Swap Camera Shoulder", keys: "Q" },
  { action: "Reload Rifle", keys: "R" },
  { action: "Switch Rifle / Emergency Sword", keys: "1 / 2 (or V Quick Slash)" },
  { action: "Use Medkit (+HP)", keys: "4" },
  { action: "Search crates · rest · use the APC", keys: "E" },
  { action: "Plant a charge / download (hold)", keys: "Hold E" },
  { action: "Detonate a planted charge", keys: "G" },
  { action: "Cycle Squad Order", keys: "F" },
  { action: "Open map, mission & journal", keys: "M" },
];

export const HomeScreen: React.FC<HomeScreenProps> = ({
  onNewCampaign,
  onContinue,
  save,
  accountEmail,
  accountReady,
  cloudStatus,
  onSignIn,
  onSignOut,
}) => {
  const [showControls, setShowControls] = useState<boolean>(false);
  const [faction, onSelectFaction] = useState<FactionId>(save?.faction ?? FactionId.EAST);
  const [confirmNew, setConfirmNew] = useState(false);
  const [activeTrack, setActiveTrack] = useState<SoundtrackId>(() => musicEngine.getActiveTrack());
  const [downloadingTrack, setDownloadingTrack] = useState<SoundtrackId | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState<SoundtrackId | null>(null);

  const handleSelectTrack = (trackId: SoundtrackId) => {
    musicEngine.setActiveTrack(trackId);
    setActiveTrack(trackId);
  };

  const handleDownloadTrack = async (trackId: SoundtrackId, e: React.MouseEvent) => {
    e.stopPropagation();
    setDownloadingTrack(trackId);
    try {
      await musicEngine.downloadTrack(trackId);
      setDownloadSuccess(trackId);
      window.setTimeout(() => setDownloadSuccess(null), 3500);
    } catch (err) {
      console.error("Soundtrack download failed", err);
    } finally {
      setDownloadingTrack(null);
    }
  };

  const hasSave = !!save;
  const startNew = () => {
    if (hasSave && !confirmNew) {
      setConfirmNew(true);
      return;
    }
    setConfirmNew(false);
    onNewCampaign(faction);
  };

  const eastGun = FACTION_PRIMARY_FIREARMS[FactionId.EAST];
  const eastSword = FACTION_EMERGENCY_SWORDS[FactionId.EAST];
  const westGun = FACTION_PRIMARY_FIREARMS[FactionId.WEST];
  const westSword = FACTION_EMERGENCY_SWORDS[FactionId.WEST];

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#070A0F]/85 p-6 select-none overflow-y-auto">
      <div className="w-full max-w-4xl my-auto">
        {!showControls ? (
          <div className="bg-[#0D1219] border border-slate-800 rounded-2xl p-8 md:p-10 shadow-2xl space-y-8">
            {/* Title & Mission Premise */}
            <div className="space-y-3 border-b border-slate-800/90 pb-6">
              <div className="text-xs font-mono uppercase tracking-widest text-[#F59E0B]">
                Asymmetric Tactical Command · East vs. West
              </div>
              <h1 className="font-display text-5xl md:text-6xl font-bold tracking-wide text-white uppercase">
                Iron Meridian
              </h1>
              <p className="text-sm md:text-base text-slate-300 max-w-2xl leading-relaxed">
                The free city of Varos-Meridian has fallen to the Ashgrove Consortium. Lead your
                squad street by street through a 16-mission story: storm buildings floor by floor,
                plant charges, loot every room and uncover who has been funding both sides of the
                war.
              </p>
            </div>

            {/* Saved campaign + account */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl p-5 border border-slate-800 bg-[#0B0F15] space-y-2">
                <div className="text-xs font-mono uppercase tracking-wider text-slate-400">
                  Your campaign
                </div>
                {save ? (
                  <>
                    <div className="text-white font-semibold">{save.missionLabel}</div>
                    <div className="text-xs font-mono text-slate-400 tabular-nums">
                      {save.missionsDone}/{save.missionsTotal} missions · {save.playTime} played ·{" "}
                      {save.faction === FactionId.EAST ? "East unit" : "West unit"}
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-slate-400">
                    No campaign yet. Pick a unit and start below.
                  </div>
                )}
              </div>
              <div className="rounded-xl p-5 border border-slate-800 bg-[#0B0F15] space-y-2.5">
                <div className="text-xs font-mono uppercase tracking-wider text-slate-400">
                  Save progress online
                </div>
                {!accountReady ? (
                  <div className="text-sm text-slate-500">Checking sign-in…</div>
                ) : accountEmail ? (
                  <>
                    <div className="flex items-center gap-2 text-sm text-emerald-300">
                      <Cloud className="w-4 h-4 shrink-0" />
                      <span className="truncate">Saving to {accountEmail}</span>
                    </div>
                    {cloudStatus && <div className="text-xs text-slate-400">{cloudStatus}</div>}
                    <button
                      type="button"
                      onClick={onSignOut}
                      className="text-xs text-slate-300 hover:text-white flex items-center gap-1.5 cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" /> Sign out
                    </button>
                  </>
                ) : (
                  <>
                    <div className="flex items-start gap-2 text-xs text-slate-400">
                      <CloudOff className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>
                        Playing as a guest — progress lives in this browser only. Sign in to keep it
                        safe and play on any device.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={onSignIn}
                      className="px-4 py-2 rounded-lg bg-white hover:bg-slate-200 text-slate-900 text-sm font-semibold flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
                        <path
                          fill="#4285F4"
                          d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.8z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z"
                        />
                      </svg>
                      Sign in with Google
                    </button>
                    {cloudStatus && <div className="text-xs text-red-300">{cloudStatus}</div>}
                  </>
                )}
              </div>
            </div>

            {/* Soundtrack Station & Audio Archive */}
            <div className="rounded-xl p-5 border border-slate-800 bg-[#0B0F15] space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2">
                  <Headphones className="w-4 h-4 text-[#F59E0B]" />
                  <span className="text-xs font-mono uppercase tracking-wider text-slate-200 font-bold">
                    Soundtrack &amp; Audio Archive
                  </span>
                </div>
                <div className="text-[11px] font-mono text-slate-400">
                  Select version to play · Download original score &amp; tracks
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {SOUNDTRACK_TRACKS.map((t) => {
                  const isPlaying = activeTrack === t.id;
                  const isDownloading = downloadingTrack === t.id;
                  const isSuccess = downloadSuccess === t.id;
                  return (
                    <div
                      key={t.id}
                      onClick={() => handleSelectTrack(t.id)}
                      className={`relative p-3.5 rounded-lg border text-left cursor-pointer transition-all flex flex-col justify-between gap-3 ${
                        isPlaying
                          ? "border-[#F59E0B] bg-[#141C27] shadow-lg shadow-amber-950/20"
                          : "border-slate-800/80 bg-[#090D12] hover:border-slate-700"
                      }`}
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold uppercase ${
                              isPlaying
                                ? "bg-[#F59E0B] text-slate-950"
                                : "bg-slate-800 text-slate-400"
                            }`}
                          >
                            {t.version}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">{t.format}</span>
                        </div>
                        <div className="text-xs font-semibold text-white tracking-wide leading-snug">
                          {t.title}
                        </div>
                        <p className="text-[11px] text-slate-400 leading-normal">{t.description}</p>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-800/70">
                        <span
                          className={`text-[11px] font-mono font-medium flex items-center gap-1.5 ${
                            isPlaying ? "text-[#F59E0B]" : "text-slate-400 hover:text-slate-300"
                          }`}
                        >
                          {isPlaying && (
                            <span className="inline-block w-2 h-2 rounded-full bg-[#F59E0B] animate-pulse" />
                          )}
                          {isPlaying ? "ACTIVE" : "SELECT"}
                        </span>

                        <button
                          type="button"
                          onClick={(e) => handleDownloadTrack(t.id, e)}
                          disabled={isDownloading}
                          title={`Download ${t.title} (${t.format})`}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 text-[11px] font-mono flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
                        >
                          {isDownloading ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin text-[#F59E0B]" />
                              <span>
                                {t.id === "iron-bow-original"
                                  ? "Rendering WAV..."
                                  : "Downloading..."}
                              </span>
                            </>
                          ) : isSuccess ? (
                            <>
                              <Sparkles className="w-3 h-3 text-emerald-400" />
                              <span className="text-emerald-400">Saved!</span>
                            </>
                          ) : (
                            <>
                              <Download className="w-3 h-3" />
                              <span>Save {t.format}</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Faction / Unit Selection */}
            <div className="space-y-3">
              <div className="text-xs font-mono uppercase tracking-wider text-slate-400">
                {hasSave ? "New campaign: choose a unit" : "Choose your unit"}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => onSelectFaction(FactionId.EAST)}
                  className={`text-left rounded-xl p-5 border transition-colors cursor-pointer space-y-2.5 ${
                    faction === FactionId.EAST
                      ? "bg-[#141C27] border-[#F59E0B]"
                      : "bg-[#0B0F15] border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-display text-xl font-bold tracking-wide text-white uppercase">
                      East Tactical Unit
                    </span>
                    <span
                      className={`text-xs font-mono ${
                        faction === FactionId.EAST ? "text-[#F59E0B]" : "text-slate-500"
                      }`}
                    >
                      {faction === FactionId.EAST ? "SELECTED" : "SELECT"}
                    </span>
                  </div>
                  <div className="text-xs text-slate-300 font-mono space-y-1">
                    <div className="flex items-center gap-2">
                      <Shield className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>Squad Carrier: BTR-82A 8×8 APC</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Crosshair className="w-3.5 h-3.5 text-[#F59E0B] shrink-0" />
                      <span>
                        Primary: {eastGun.designation} ({eastGun.caliber})
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Sword className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      <span>Backup Blade: {eastSword.designation}</span>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => onSelectFaction(FactionId.WEST)}
                  className={`text-left rounded-xl p-5 border transition-colors cursor-pointer space-y-2.5 ${
                    faction === FactionId.WEST
                      ? "bg-[#141C27] border-[#F59E0B]"
                      : "bg-[#0B0F15] border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-display text-xl font-bold tracking-wide text-white uppercase">
                      West Tactical Unit
                    </span>
                    <span
                      className={`text-xs font-mono ${
                        faction === FactionId.WEST ? "text-[#F59E0B]" : "text-slate-500"
                      }`}
                    >
                      {faction === FactionId.WEST ? "SELECTED" : "SELECT"}
                    </span>
                  </div>
                  <div className="text-xs text-slate-300 font-mono space-y-1">
                    <div className="flex items-center gap-2">
                      <Shield className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>Squad Carrier: M1126 Stryker 8×8 APC</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Crosshair className="w-3.5 h-3.5 text-[#F59E0B] shrink-0" />
                      <span>
                        Primary: {westGun.designation} ({westGun.caliber})
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Sword className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      <span>Backup Blade: {westSword.designation}</span>
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {/* Primary Home Actions: Begin Round & Controls */}
            <div className="flex flex-wrap items-center gap-4 pt-2">
              {hasSave && (
                <button
                  type="button"
                  onClick={onContinue}
                  className="px-8 py-4 rounded-xl bg-[#F59E0B] hover:bg-amber-400 text-slate-950 font-display text-xl font-bold tracking-wider uppercase flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <Play className="w-5 h-5 fill-slate-950" />
                  <span>Continue Campaign</span>
                </button>
              )}
              <button
                type="button"
                onClick={startNew}
                className={`px-7 py-4 rounded-xl font-display text-xl font-bold tracking-wider uppercase flex items-center gap-2.5 transition-colors cursor-pointer ${
                  hasSave
                    ? confirmNew
                      ? "bg-red-600 hover:bg-red-500 text-white"
                      : "bg-[#161E2B] hover:bg-slate-800 border border-slate-700 text-white"
                    : "bg-[#F59E0B] hover:bg-amber-400 text-slate-950"
                }`}
              >
                {!hasSave && <Play className="w-5 h-5 fill-slate-950" />}
                <span>{confirmNew ? "Erase save & start over?" : "New Campaign"}</span>
              </button>
              {confirmNew && (
                <button
                  type="button"
                  onClick={() => setConfirmNew(false)}
                  className="text-sm text-slate-300 hover:text-white cursor-pointer"
                >
                  Keep my save
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowControls(true)}
                className="px-6 py-4 rounded-xl bg-[#161E2B] hover:bg-slate-800 border border-slate-700 text-white font-display text-xl font-semibold tracking-wider uppercase flex items-center gap-2.5 transition-colors cursor-pointer"
              >
                <Keyboard className="w-5 h-5 text-[#F59E0B]" />
                <span>Controls</span>
              </button>
            </div>
          </div>
        ) : (
          /* Controls View on Home Page */
          <div className="bg-[#0D1219] border border-slate-800 rounded-2xl p-8 md:p-10 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <div className="text-xs font-mono uppercase tracking-widest text-[#F59E0B]">
                  Field Manual
                </div>
                <h2 className="font-display text-3xl font-bold tracking-wide text-white uppercase">
                  Combat &amp; Command Controls
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setShowControls(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
                <span>Back</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
              {CONTROLS_LIST.map((item) => (
                <div
                  key={item.action}
                  className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-[#0B0F15] border border-slate-800/90"
                >
                  <span className="text-slate-300 font-sans font-medium">{item.action}</span>
                  <span className="text-[#F59E0B] font-semibold shrink-0">{item.keys}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-800">
              <span className="text-xs text-slate-400">
                Tip: During a round, press <strong className="text-white">[M]</strong> anytime to
                open the city map, your mission steps and the story journal.
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
