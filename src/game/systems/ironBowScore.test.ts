import { describe, expect, it } from 'vitest';
import { IRON_BOW, PART_VOICES, SECTIONS, locate, songDurationSec, syllables } from './ironBowScore';

describe('Iron Bow, Broken Crown', () => {
  it('follows the song structure: intro, verse 1, pre-chorus, chorus, verse 2, bridge, chorus, outro', () => {
    expect(IRON_BOW.sections.map((s) => s.id)).toEqual([
      'INTRO',
      'VERSE_1A',
      'VERSE_1B',
      'PRE_CHORUS',
      'CHORUS_1',
      'VERSE_2A',
      'VERSE_2B',
      'BRIDGE',
      'CHORUS_2',
      'OUTRO_CLIMAX',
      'OUTRO_FINAL',
      'TAIL',
    ]);
  });

  it('sets every lyric line of the song (8 + 5 + 6 + 8 + 6 + 6 + 3 = 42)', () => {
    const lines = SECTIONS.flatMap((s) => s.lines);
    expect(lines).toHaveLength(42);
    expect(lines[0].text.toLowerCase()).toContain('deep in the soil');
    expect(lines[lines.length - 1].text.toLowerCase()).toContain('to us');
  });

  it('gives every stressed syllable its own melody note', () => {
    for (const sec of SECTIONS) {
      for (const line of sec.lines) {
        if (line.degrees) continue;
        expect(syllables(line.text).filter((s) => s.stressed).length, line.text).toBe(line.stress.length);
      }
    }
  });

  it('lands every stressed syllable on a beat', () => {
    const offBeat = IRON_BOW.melody.filter((n) => n.stressed && n.step % 4 !== 0);
    expect(offBeat).toEqual([]);
  });

  it('only uses contrabass, cello and violin', () => {
    const voices = new Set<string>([
      ...IRON_BOW.melody.map((n) => n.voice),
      ...SECTIONS.flatMap((s) => s.parts.flatMap((p) => PART_VOICES[p])),
    ]);
    expect([...voices].sort()).toEqual(['cello', 'contrabass', 'violin']);
  });

  it('starts at 92 BPM, accelerates through the pre-chorus and stays at 104 from the chorus on', () => {
    const at = (id: string, frac: number) => {
      const s = IRON_BOW.sections.find((x) => x.id === id)!;
      return locate(IRON_BOW, s.startStep + Math.floor(s.steps * frac)).bpm;
    };
    expect(at('INTRO', 0)).toBe(92);
    expect(at('VERSE_1B', 0.5)).toBe(92);
    expect(at('PRE_CHORUS', 0.5)).toBeGreaterThan(92);
    expect(at('PRE_CHORUS', 0.5)).toBeLessThan(104);
    expect(at('CHORUS_1', 0)).toBe(104);
    expect(at('VERSE_2A', 0.5)).toBe(104);
  });

  it('plays the same chorus melody both times, carried by the violin', () => {
    const chorus = (id: string) =>
      IRON_BOW.melody.filter((n) => n.section === id && !n.doubled).map((n) => [n.midi, n.lyric]);
    expect(chorus('CHORUS_1').length).toBeGreaterThan(40);
    expect(chorus('CHORUS_2')).toEqual(chorus('CHORUS_1'));
    expect(IRON_BOW.melody.filter((n) => n.section === 'CHORUS_1').every((n) => n.voice === 'violin')).toBe(true);
  });

  it('drops the bridge to a whisper and builds back up', () => {
    const bridge = IRON_BOW.sections.find((s) => s.id === 'BRIDGE')!;
    expect(bridge.dynamics[0]).toBeLessThan(0.5);
    expect(bridge.dynamics[1]).toBeGreaterThan(0.9);
    expect(bridge.voice).toBe('violin');
    expect(bridge.articulation).toBe('tremolo');
    expect(bridge.parts).toEqual(['bassHeartbeat']);
  });

  it('ends on "US" — a D held for four bars over the final chord', () => {
    const last = IRON_BOW.melody.filter((n) => n.section === 'OUTRO_FINAL').at(-1)!;
    expect(last.lyric).toBe('US');
    expect(last.midi % 12).toBe(2);
    expect(last.dur).toBe(64);
  });

  it('lasts roughly four minutes before looping', () => {
    const sec = songDurationSec(IRON_BOW);
    expect(sec).toBeGreaterThan(200);
    expect(sec).toBeLessThan(300);
  });
});
