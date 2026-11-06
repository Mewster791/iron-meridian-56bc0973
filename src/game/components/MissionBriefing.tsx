import React from "react";
import { ACT_TITLES, CAMPAIGN_PROLOGUE, Mission, MISSIONS } from "../campaign/campaignData";
import { FactionId } from "../types/systems";
import { CheckCircle2, Cloud, Play, Radio } from "lucide-react";

interface MissionBriefingProps {
  /** Mission just finished (shows the debrief first). */
  debrief: Mission | null;
  /** Next mission to brief (null once the campaign is over). */
  mission: Mission | null;
  faction: FactionId;
  signedIn: boolean;
  onContinueDebrief: () => void;
  onBeginMission: () => void;
}

export const MissionBriefing: React.FC<MissionBriefingProps> = ({
  debrief,
  mission,
  faction,
  signedIn,
  onContinueDebrief,
  onBeginMission,
}) => {
  const plateLabel = faction === FactionId.EAST ? "composite plates" : "ERA blocks";

  if (debrief) {
    const finale = !mission;
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#070A0F]/88 p-6 select-none">
        <div className="w-full max-w-2xl bg-[#0D1219] border border-emerald-600/70 rounded-2xl p-8 space-y-5 shadow-2xl">
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
            <span>Mission {debrief.number} complete</span>
          </div>
          <h2 className="font-display text-4xl font-bold tracking-wide text-white uppercase">
            {debrief.title}
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed">{debrief.outro}</p>
          <div className="text-sm font-mono text-[#F59E0B] tabular-nums">
            +{debrief.reward.scrap} alloy · +{debrief.reward.plates} {plateLabel} · +
            {debrief.reward.chips} chips
          </div>
          {finale && (
            <p className="text-sm text-emerald-300">
              The Ledger is broken and Varos-Meridian is free. Thank you for seeing it through,
              operator.
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
            <span className="text-xs text-slate-400 flex items-center gap-1.5">
              <Cloud className="w-3.5 h-3.5" />
              {signedIn
                ? "Progress saved to your account."
                : "Saved in this browser. Sign in with Google on the home page to keep it safe online."}
            </span>
            <button
              type="button"
              onClick={onContinueDebrief}
              className="px-6 py-3 rounded-xl bg-[#F59E0B] hover:bg-amber-400 text-slate-950 font-display text-lg font-bold tracking-wider uppercase transition-colors cursor-pointer"
            >
              {finale ? "Return to the city" : "Continue"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!mission) return null;
  const isFirst = mission.number === 1;
  const opensAct = MISSIONS.find((m) => m.act === mission.act)?.id === mission.id;
  const act = ACT_TITLES[mission.act];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#070A0F]/88 p-6 select-none overflow-y-auto">
      <div className="w-full max-w-2xl my-auto bg-[#0D1219] border border-[#F59E0B]/70 rounded-2xl p-8 space-y-5 shadow-2xl">
        {isFirst && (
          <div className="space-y-2 pb-4 border-b border-slate-800 text-sm text-slate-300 leading-relaxed">
            {CAMPAIGN_PROLOGUE.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        )}
        {opensAct && (
          <div>
            <div className="font-display text-2xl font-bold tracking-wide text-[#F59E0B] uppercase">
              {act.title}
            </div>
            <div className="text-xs text-slate-400">{act.subtitle}</div>
          </div>
        )}
        <div className="space-y-1">
          <div className="text-xs font-mono uppercase tracking-widest text-slate-400">
            Mission {mission.number} of {MISSIONS.length} · {mission.location}
          </div>
          <h2 className="font-display text-4xl font-bold tracking-wide text-white uppercase">
            {mission.title}
          </h2>
        </div>
        <div className="space-y-2.5 text-sm text-slate-200 leading-relaxed">
          {mission.briefing.map((line) => (
            <p key={line} className="flex gap-2">
              <Radio className="w-4 h-4 text-[#F59E0B] shrink-0 mt-0.5" />
              <span>{line}</span>
            </p>
          ))}
        </div>
        <ol className="space-y-1 text-xs text-slate-300 list-decimal list-inside">
          {mission.steps.map((s, i) => (
            <li key={`${s.type}-${i}`}>{s.text}</li>
          ))}
        </ol>
        <div className="flex justify-end pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={onBeginMission}
            className="px-6 py-3 rounded-xl bg-[#F59E0B] hover:bg-amber-400 text-slate-950 font-display text-lg font-bold tracking-wider uppercase flex items-center gap-2 transition-colors cursor-pointer"
          >
            <Play className="w-4 h-4 fill-slate-950" />
            <span>Begin mission</span>
          </button>
        </div>
      </div>
    </div>
  );
};
