/**
 * Adaptive score director — pure rules that pick which phase of the
 * "Iron Meridian" theme should be playing. The audio engine only calls this.
 *
 *  AMBIENT     Phase 1 · map view / home / briefings / calm streets
 *  ASSAULT     Phase 2 · hostiles nearby or closing on the objective
 *  COMBAT      Phase 3 · active firefight (enemies with eyes on you, shots, hits)
 *  RESOLUTION  Phase 4 · mission complete debrief
 */

export type MusicPhase = 'AMBIENT' | 'ASSAULT' | 'COMBAT' | 'RESOLUTION';

/** Where the player is in the app, set by the React shell. */
export type MusicContext = 'HOME' | 'MAP' | 'PLAYING' | 'VICTORY';

export const MUSIC_BPM = 90;
/** Combat keeps playing this long after the last shot / hit / enemy sighting. */
export const COMBAT_HOLD_SEC = 9;
/** Assault keeps playing this long after the last hostile was nearby. */
export const ASSAULT_HOLD_SEC = 7;
/** Hostiles within this range count as "nearby". */
export const NEAR_ENEMY_RANGE = 60;
/** Being this close to the mission objective counts as an assault. */
export const OBJECTIVE_ASSAULT_RANGE = 45;

export interface ThreatSnapshot {
  /** Living hostiles within NEAR_ENEMY_RANGE. */
  nearEnemies: number;
  /** Hostiles that currently have line of sight and are in firing range. */
  engagedEnemies: number;
  /** Metres to the current mission waypoint, or null when there is none. */
  objectiveDist: number | null;
}

export interface MusicDirectorState {
  phase: MusicPhase;
  /** Seconds timestamp of the last combat signal. */
  lastCombatAt: number;
  /** Seconds timestamp of the last assault signal. */
  lastAssaultAt: number;
}

export const createMusicDirectorState = (): MusicDirectorState => ({
  phase: 'AMBIENT',
  lastCombatAt: -Infinity,
  lastAssaultAt: -Infinity,
});

export interface MusicDirectorInput {
  context: MusicContext;
  threat: ThreatSnapshot;
  /** Seconds timestamp of the last player shot fired near hostiles or hit taken. */
  lastCombatEventAt: number;
  now: number;
}

/** Decide the next phase. Escalation is instant, cooling down waits for the hold timers. */
export function nextMusicPhase(state: MusicDirectorState, input: MusicDirectorInput): MusicDirectorState {
  const { context, threat, now } = input;

  if (context === 'VICTORY') return { ...state, phase: 'RESOLUTION' };
  if (context === 'HOME' || context === 'MAP') {
    // Leaving the game world resets the heat so returning starts calm.
    return { phase: 'AMBIENT', lastCombatAt: -Infinity, lastAssaultAt: -Infinity };
  }

  let lastCombatAt = Math.max(state.lastCombatAt, input.lastCombatEventAt);
  if (threat.engagedEnemies > 0) lastCombatAt = now;

  let lastAssaultAt = state.lastAssaultAt;
  const nearObjective = threat.objectiveDist !== null && threat.objectiveDist < OBJECTIVE_ASSAULT_RANGE;
  if (threat.nearEnemies > 0 || nearObjective) lastAssaultAt = now;

  let phase: MusicPhase = 'AMBIENT';
  if (now - lastCombatAt < COMBAT_HOLD_SEC) phase = 'COMBAT';
  else if (now - lastAssaultAt < ASSAULT_HOLD_SEC) phase = 'ASSAULT';

  return { phase, lastCombatAt, lastAssaultAt };
}
