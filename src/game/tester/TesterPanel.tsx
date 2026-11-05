import React, { useEffect, useRef, useState } from 'react';
import { FlaskConical, KeyRound, X } from 'lucide-react';
import { MISSIONS } from '../campaign/campaignData';
import { CampaignProgress, getCurrentMission } from '../campaign/campaignRules';
import { isTesterPassword } from './testerAccess';
import type { TesterCommandType } from '../components/TacticalArena3D';

interface PasswordPromptProps {
  onSubmit: () => void;
  onCancel: () => void;
}

export const TesterPasswordPrompt: React.FC<PasswordPromptProps> = ({ onSubmit, onCancel }) => {
  const [value, setValue] = useState('');
  const [wrong, setWrong] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#070A0F]/80 p-6" onKeyDown={(e) => e.stopPropagation()}>
      <form
        className="w-full max-w-xs rounded-xl border border-slate-700 bg-[#11161F] p-5 shadow-2xl"
        onSubmit={(e) => {
          e.preventDefault();
          if (isTesterPassword(value)) onSubmit();
          else {
            setWrong(true);
            setValue('');
          }
        }}
      >
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
          <KeyRound className="h-4 w-4 text-[#F59E0B]" /> Password
        </div>
        <label className="mb-1.5 block text-xs uppercase tracking-widest text-slate-400" htmlFor="tester-password">
          color
        </label>
        <input
          id="tester-password"
          ref={inputRef}
          type="password"
          autoComplete="off"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setWrong(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onCancel();
          }}
          className="w-full rounded-md border border-slate-600 bg-[#0B0E13] px-3 py-2 text-sm text-slate-100 outline-none focus:border-[#F59E0B]"
        />
        {wrong && <p className="mt-2 text-xs text-red-400">Wrong answer.</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-md px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200">
            Cancel
          </button>
          <button type="submit" className="rounded-md bg-[#F59E0B] px-3 py-1.5 text-xs font-semibold text-[#0B0E13]">
            Enter
          </button>
        </div>
      </form>
    </div>
  );
};

interface TesterPanelProps {
  campaign: CampaignProgress;
  inGame: boolean;
  godMode: boolean;
  onClose: () => void;
  onCompleteStep: () => void;
  onFinishMission: () => void;
  onJumpMission: (index: number) => void;
  onJumpStep: (index: number) => void;
  onTeleportObjective: () => void;
  onCommand: (type: TesterCommandType) => void;
  onToggleGodMode: () => void;
  onAddSalvage: () => void;
}

const btn =
  'rounded-md border border-slate-600 bg-[#1A212C] px-2.5 py-1.5 text-xs text-slate-200 hover:border-[#F59E0B] hover:text-[#F59E0B] disabled:opacity-40 disabled:pointer-events-none';

export const TesterPanel: React.FC<TesterPanelProps> = ({
  campaign,
  inGame,
  godMode,
  onClose,
  onCompleteStep,
  onFinishMission,
  onJumpMission,
  onJumpStep,
  onTeleportObjective,
  onCommand,
  onToggleGodMode,
  onAddSalvage,
}) => {
  const mission = getCurrentMission(campaign);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#070A0F]/75 p-4 select-none">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[#F59E0B]/60 bg-[#11161F] shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-700 px-5 py-3">
          <div className="flex items-center gap-2 text-sm font-bold tracking-wide text-[#F59E0B]">
            <FlaskConical className="h-4 w-4" /> TESTER PANEL
          </div>
          <button onClick={onClose} aria-label="Close tester panel" className="text-slate-400 hover:text-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto px-5 py-4">
          <section>
            <div className="text-[11px] uppercase tracking-widest text-slate-500">Current</div>
            <div className="mt-1 text-sm text-slate-100">
              {mission ? `Mission ${mission.number}: ${mission.title}` : 'Campaign complete'}
            </div>
            {mission && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {mission.steps.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => onJumpStep(i)}
                    className={`${btn} ${i === campaign.stepIndex ? 'border-[#F59E0B] text-[#F59E0B]' : ''}`}
                    title="Jump to this step"
                  >
                    {i + 1}. {s.text}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-1.5">
              <button className={btn} disabled={!mission} onClick={onCompleteStep}>
                Complete current step
              </button>
              <button className={btn} disabled={!mission} onClick={onFinishMission}>
                Finish whole mission
              </button>
            </div>
          </section>

          <section>
            <div className="text-[11px] uppercase tracking-widest text-slate-500">In the field</div>
            {!inGame && <p className="mt-1 text-xs text-slate-500">Jump to a mission to start playing, then reopen this panel.</p>}
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button className={btn} disabled={!inGame || !mission} onClick={onTeleportObjective}>
                Teleport to objective
              </button>
              <button className={btn} disabled={!inGame} onClick={() => onCommand('KILL_NEAR')}>
                Kill enemies within 40 m
              </button>
              <button className={btn} disabled={!inGame} onClick={() => onCommand('KILL_MISSION')}>
                Kill all mission enemies
              </button>
              <button className={btn} disabled={!inGame} onClick={() => onCommand('DESTROY_CONVOY')}>
                Destroy convoy
              </button>
              <button className={btn} disabled={!inGame} onClick={() => onCommand('HEAL')}>
                Full health, armor &amp; ammo
              </button>
              <button className={`${btn} ${godMode ? 'border-[#F59E0B] text-[#F59E0B]' : ''}`} onClick={onToggleGodMode}>
                God mode: {godMode ? 'ON' : 'OFF'}
              </button>
              <button className={btn} onClick={onAddSalvage}>
                +200 alloy, +5 plates, +3 chips
              </button>
            </div>
          </section>

          <section>
            <div className="text-[11px] uppercase tracking-widest text-slate-500">Jump to mission</div>
            <p className="mt-1 text-xs text-slate-500">Earlier missions count as done. This overwrites the current save.</p>
            <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {MISSIONS.map((m, i) => (
                <button
                  key={m.id}
                  onClick={() => onJumpMission(i)}
                  className={`${btn} text-left ${i === campaign.missionIndex ? 'border-[#F59E0B] text-[#F59E0B]' : ''}`}
                >
                  {m.number}. {m.title}
                  <span className="ml-1 text-slate-500">· {m.location}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
