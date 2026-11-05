import { describe, expect, it } from 'vitest';
import { COMBAT_HOLD_SEC, createMusicDirectorState, nextMusicPhase, type ThreatSnapshot } from './musicDirector';

const calm: ThreatSnapshot = { nearEnemies: 0, engagedEnemies: 0, objectiveDist: null };

describe('music director', () => {
  it('plays the ambient phase on the map view even during a firefight', () => {
    const s = nextMusicPhase(createMusicDirectorState(), {
      context: 'MAP',
      threat: { nearEnemies: 4, engagedEnemies: 3, objectiveDist: 5 },
      lastCombatEventAt: 10,
      now: 10,
    });
    expect(s.phase).toBe('AMBIENT');
  });

  it('kicks into the assault phase when hostiles are within 60 m', () => {
    const s = nextMusicPhase(createMusicDirectorState(), {
      context: 'PLAYING',
      threat: { nearEnemies: 2, engagedEnemies: 0, objectiveDist: null },
      lastCombatEventAt: -Infinity,
      now: 5,
    });
    expect(s.phase).toBe('ASSAULT');
  });

  it('kicks into the assault phase when within 45 m of the objective', () => {
    const near = nextMusicPhase(createMusicDirectorState(), {
      context: 'PLAYING',
      threat: { ...calm, objectiveDist: 40 },
      lastCombatEventAt: -Infinity,
      now: 5,
    });
    const far = nextMusicPhase(createMusicDirectorState(), {
      context: 'PLAYING',
      threat: { ...calm, objectiveDist: 50 },
      lastCombatEventAt: -Infinity,
      now: 5,
    });
    expect(near.phase).toBe('ASSAULT');
    expect(far.phase).toBe('AMBIENT');
  });

  it('goes to combat when an enemy has eyes on the player, and holds it for 9 seconds', () => {
    let s = nextMusicPhase(createMusicDirectorState(), {
      context: 'PLAYING',
      threat: { nearEnemies: 1, engagedEnemies: 1, objectiveDist: null },
      lastCombatEventAt: -Infinity,
      now: 100,
    });
    expect(s.phase).toBe('COMBAT');
    s = nextMusicPhase(s, { context: 'PLAYING', threat: calm, lastCombatEventAt: -Infinity, now: 100 + COMBAT_HOLD_SEC - 0.5 });
    expect(s.phase).toBe('COMBAT');
    s = nextMusicPhase(s, { context: 'PLAYING', threat: calm, lastCombatEventAt: -Infinity, now: 100 + COMBAT_HOLD_SEC + 0.5 });
    expect(s.phase).not.toBe('COMBAT');
  });

  it('plays the resolution phase on mission victory', () => {
    const s = nextMusicPhase(createMusicDirectorState(), {
      context: 'VICTORY',
      threat: { nearEnemies: 3, engagedEnemies: 2, objectiveDist: 2 },
      lastCombatEventAt: 1,
      now: 1,
    });
    expect(s.phase).toBe('RESOLUTION');
  });
});
