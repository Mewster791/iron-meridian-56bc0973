import React, { useState } from 'react';
import { FactionId } from '../types/systems';
import {
  FACTION_EMERGENCY_SWORDS,
  FACTION_PRIMARY_FIREARMS,
} from '../systems/loadoutHealthSystem';
import { Crosshair, Keyboard, Play, Shield, Sword, X } from 'lucide-react';

interface HomeScreenProps {
  faction: FactionId;
  onSelectFaction: (faction: FactionId) => void;
  onBeginRound: () => void;
  onContinue?: () => void;
  hasSave?: boolean;
}

const CONTROLS_LIST: Array<{ action: string; keys: string }> = [
  { action: 'Move Operator', keys: 'W A S D' },
  { action: 'Sprint / Jump', keys: 'Shift / Space' },
  { action: 'Aim & Fire Weapon', keys: 'Mouse + Left-Click (or J)' },
  { action: 'Aim Down Sights (ADS)', keys: 'Right-Click (or Z)' },
  { action: 'Toggle 1st / 3rd Person POV', keys: 'C' },
  { action: 'Swap Camera Shoulder', keys: 'Q' },
  { action: 'Reload Rifle', keys: 'R' },
  { action: 'Switch Rifle / Emergency Sword', keys: '1 / 2 (or V Quick Slash)' },
  { action: 'Use Medkit (+HP)', keys: '4' },
  { action: 'Loot Crate / Install APC Upgrade', keys: 'E' },
  { action: 'Cycle Squad Order', keys: 'F' },
  { action: 'Open Bigger Map & Mission Target', keys: 'M' },
];

export const HomeScreen: React.FC<HomeScreenProps> = ({
  faction,
  onSelectFaction,
  onBeginRound,
  onContinue,
  hasSave = false,
}) => {
  const [showControls, setShowControls] = useState<boolean>(false);

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
                Lead a five-person team through a sprawling fictional country. Explore a continuous
                urban region, enter buildings, secure districts, rescue civilians, recover supplies,
                and complete a long-form liberation campaign. Your progress is saved locally.
              </p>
            </div>

            {/* Faction / Unit Selection */}
            <div className="space-y-3">
              <div className="text-xs font-mono uppercase tracking-wider text-slate-400">
                Select Tactical Unit &amp; Starting Loadout
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => onSelectFaction(FactionId.EAST)}
                  className={`text-left rounded-xl p-5 border transition-colors cursor-pointer space-y-2.5 ${
                    faction === FactionId.EAST
                      ? 'bg-[#141C27] border-[#F59E0B]'
                      : 'bg-[#0B0F15] border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-display text-xl font-bold tracking-wide text-white uppercase">
                      East Tactical Unit
                    </span>
                    <span
                      className={`text-xs font-mono ${
                        faction === FactionId.EAST ? 'text-[#F59E0B]' : 'text-slate-500'
                      }`}
                    >
                      {faction === FactionId.EAST ? 'SELECTED' : 'SELECT'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-300 font-mono space-y-1">
                    <div className="flex items-center gap-2">
                      <Shield className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>Squad Carrier: BTR-82A 8×8 APC</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Crosshair className="w-3.5 h-3.5 text-[#F59E0B] shrink-0" />
                      <span>Primary: {eastGun.designation} ({eastGun.caliber})</span>
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
                      ? 'bg-[#141C27] border-[#F59E0B]'
                      : 'bg-[#0B0F15] border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-display text-xl font-bold tracking-wide text-white uppercase">
                      West Tactical Unit
                    </span>
                    <span
                      className={`text-xs font-mono ${
                        faction === FactionId.WEST ? 'text-[#F59E0B]' : 'text-slate-500'
                      }`}
                    >
                      {faction === FactionId.WEST ? 'SELECTED' : 'SELECT'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-300 font-mono space-y-1">
                    <div className="flex items-center gap-2">
                      <Shield className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>Squad Carrier: M1126 Stryker 8×8 APC</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Crosshair className="w-3.5 h-3.5 text-[#F59E0B] shrink-0" />
                      <span>Primary: {westGun.designation} ({westGun.caliber})</span>
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
              {hasSave && onContinue && (
                <button
                  type="button"
                  onClick={onContinue}
                  className="px-7 py-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display text-xl font-bold tracking-wider uppercase transition-colors cursor-pointer"
                >
                  Continue Campaign
                </button>
              )}
              {hasSave && onContinue && (
                <button
                  type="button"
                  onClick={onContinue}
                  className="px-7 py-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display text-xl font-bold tracking-wider uppercase transition-colors cursor-pointer"
                >
                  Continue Campaign
                </button>
              )}
              <button
                type="button"
                onClick={onBeginRound}
                className="px-8 py-4 rounded-xl bg-[#F59E0B] hover:bg-amber-400 text-slate-950 font-display text-xl font-bold tracking-wider uppercase flex items-center gap-2.5 transition-colors cursor-pointer"
              >
                <Play className="w-5 h-5 fill-slate-950" />
                <span>Begin Round</span>
              </button>

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
                view the full sector map, active target order, and unit upgrades.
              </span>

              <button
                type="button"
                onClick={onBeginRound}
                className="px-7 py-3 rounded-xl bg-[#F59E0B] hover:bg-amber-400 text-slate-950 font-display text-lg font-bold tracking-wider uppercase flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Play className="w-4 h-4 fill-slate-950" />
                <span>Begin Round</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
