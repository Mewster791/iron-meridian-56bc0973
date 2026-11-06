/**
 * "Iron Bow, Broken Crown" — the one and only Iron Meridian soundtrack.
 *
 * Cinematic orchestral / revolutionary anthem for contrabass, cello and violin,
 * D minor. It is a single through-composed song that plays from the intro to
 * the final chord and then loops — it never reacts to what happens in the game.
 *
 * The track is instrumental, but every melody is the lyric set to the beat:
 * one note per syllable, STRESSED syllables (upper case) always land on a beat
 * and on a chord tone, so the strings "sing" the words.
 *
 * This module is pure data + pure functions (tested); musicEngine.ts only plays it.
 */

export const SONG_TITLE = "Iron Bow, Broken Crown";

export type Voice = "contrabass" | "cello" | "violin";
export type Articulation = "legato" | "marcato" | "staccato" | "spiccato" | "tremolo";

/** Accompaniment figures the engine knows how to play. */
export type Part =
  | "bassMarch" // aggressive staccato "boots in the mud" pulse
  | "bassDrone" // quiet bowed root under the verses
  | "bassHeartbeat" // bridge: low lub-dub
  | "bassLong" // chorus: thunderous bowed roots
  | "celloCounter" // verse 1b: sharp, urgent counter-melody
  | "celloChords" // chorus: heavy chord stabs
  | "celloJagged" // verse 2: syncopated, jagged rhythm
  | "spiccato" // pre-chorus / final chorus: fast driving bowing
  | "violinPiercing" // verse 2b: sharp, tragic high notes
  | "feverRun" // outro: violins climbing to fever pitch
  | "finalStabs"; // outro: heavy chords on each word, then the final chord

export const PART_VOICES: Record<Part, Voice[]> = {
  bassMarch: ["contrabass"],
  bassDrone: ["contrabass"],
  bassHeartbeat: ["contrabass"],
  bassLong: ["contrabass"],
  celloCounter: ["cello"],
  celloChords: ["cello"],
  celloJagged: ["cello"],
  spiccato: ["violin", "cello"],
  violinPiercing: ["violin"],
  feverRun: ["violin"],
  finalStabs: ["contrabass", "cello"],
};

export type SectionId =
  | "INTRO"
  | "VERSE_1A"
  | "VERSE_1B"
  | "PRE_CHORUS"
  | "CHORUS_1"
  | "VERSE_2A"
  | "VERSE_2B"
  | "BRIDGE"
  | "CHORUS_2"
  | "OUTRO_CLIMAX"
  | "OUTRO_FINAL"
  | "TAIL";

export interface Chord {
  name: string;
  /** Contrabass root, MIDI. */
  root: number;
  /** Pitch classes, root first. */
  pcs: number[];
}

const Dm: Chord = { name: "Dm", root: 38, pcs: [2, 5, 9] };
const Bb: Chord = { name: "Bb", root: 34, pcs: [10, 2, 5] };
const Gm: Chord = { name: "Gm", root: 31, pcs: [7, 10, 2] };
const A: Chord = { name: "A", root: 33, pcs: [9, 1, 4] };
const F: Chord = { name: "F", root: 29, pcs: [5, 9, 0] };
const C: Chord = { name: "C", root: 36, pcs: [0, 4, 7] };

export interface LineSpec {
  /** Lyric with hyphenated syllables; UPPER CASE = stressed. */
  text: string;
  /** Scale degrees (0 = D) of each stressed syllable. */
  stress: number[];
  /** Length in bars, default 2. */
  bars?: number;
  /** Optional explicit 16th-step position of every syllable, relative to the line start. */
  steps?: number[];
  /** Optional explicit scale degree of every syllable. */
  degrees?: number[];
}

interface RawNote {
  bar: number;
  step: number;
  dur: number;
  midi: number;
}

export interface SectionSpec {
  id: SectionId;
  /** The song's own label for this section. */
  title: string;
  bars: number;
  /** Tempo at the start and end of the section (linear ramp between). */
  bpm: [number, number];
  /** One chord per bar. */
  chords: Chord[];
  /** Instrument carrying the melody. */
  voice: Voice;
  articulation: Articulation;
  /** MIDI note of scale degree 0 (D) for the melody. */
  base: number;
  lines: LineSpec[];
  /** Instrumental (non-lyric) melody notes. */
  extraNotes?: RawNote[];
  /** Melody doubled at this interval (semitones). */
  doubling?: number;
  parts: Part[];
  /** Loudness at the start and end of the section. */
  dynamics: [number, number];
}

// ---------------------------------------------------------------------------
// The song
// ---------------------------------------------------------------------------

/** Solo cello: a dark, weeping melody over the marching bass. */
const INTRO_LAMENT: RawNote[] = [
  { bar: 2, step: 0, dur: 12, midi: 57 },
  { bar: 2, step: 12, dur: 4, midi: 55 },
  { bar: 3, step: 0, dur: 8, midi: 53 },
  { bar: 3, step: 8, dur: 4, midi: 52 },
  { bar: 3, step: 12, dur: 4, midi: 53 },
  { bar: 4, step: 0, dur: 12, midi: 62 },
  { bar: 4, step: 12, dur: 4, midi: 60 },
  { bar: 5, step: 0, dur: 8, midi: 58 },
  { bar: 5, step: 8, dur: 4, midi: 57 },
  { bar: 5, step: 12, dur: 4, midi: 55 },
  { bar: 6, step: 0, dur: 12, midi: 57 },
  { bar: 6, step: 12, dur: 4, midi: 58 },
  { bar: 7, step: 0, dur: 16, midi: 57 },
];

const VERSE_A_CONTOUR = [
  [0, 2, 4, 2],
  [5, 3, 1, -1],
  [4, 2, 7, 4],
  [3, 5, 4, 1],
];
const VERSE_B_CONTOUR = [
  [7, 5, 3, 7],
  [4, 7, 9, 7],
  [5, 9, 7, 5],
  [8, 6, 4, 1],
];
const verse = (texts: string[], contour: number[][]): LineSpec[] =>
  texts.map((text, i) => ({ text, stress: contour[i] }));

const VERSE_A_CHORDS = [Dm, Dm, Bb, A, Dm, Dm, Gm, A];
const VERSE_B_CHORDS = [Gm, Gm, Dm, Dm, Bb, Bb, A, A];
const CHORUS_CHORDS = [Dm, Bb, F, C, Dm, Bb, Gm, A, Bb, C, Gm, A];

const CHORUS_LINES: LineSpec[] = [
  {
    text: "RISE! take BACK the SOIL from the PAR-a-site's HAND!",
    stress: [0, 2, 4, 5, 7],
    steps: [0, 6, 8, 11, 12, 16, 18, 20, 22, 23, 24],
  },
  { text: "BREAK through the I-ron that SHACK-led the LAND!", stress: [6, 4, 3, 1] },
  { text: "the THIEVES in the PAL-ace have RUN out of TIME,", stress: [0, 2, 4, 5] },
  { text: "their CROWNS are a DEBT, and their RULE is a CRIME!", stress: [7, 5, 4, 1] },
  { text: "with a STRIKE of the BOW, let the TYR-an-ny FALL,", stress: [5, 7, 6, 8] },
  { text: "the MOTH-er-land WAKES to the RAL-ly-ing CALL!", stress: [7, 3, 4, 6] },
];

export const SECTIONS: SectionSpec[] = [
  {
    id: "INTRO",
    title: "Intro",
    bars: 8,
    bpm: [92, 92],
    chords: [Dm, Dm, Dm, Dm, Bb, Bb, A, A],
    voice: "cello",
    articulation: "legato",
    base: 50,
    lines: [],
    extraNotes: INTRO_LAMENT,
    parts: ["bassMarch"],
    dynamics: [0.55, 0.7],
  },
  {
    id: "VERSE_1A",
    title: "Verse 1",
    bars: 8,
    bpm: [92, 92],
    chords: VERSE_A_CHORDS,
    voice: "cello",
    articulation: "legato",
    base: 50,
    lines: verse(
      [
        "DEEP in the SOIL, the I-ron grows COLD,",
        "UN-der the WEIGHT of a CROWN bought and SOLD.",
        "they SIT in high TOW-ers, they DINE on our TEARS,",
        "they LOCK up our VOIC-es and FEED on our FEARS.",
      ],
      VERSE_A_CONTOUR,
    ),
    parts: ["bassMarch", "bassDrone"],
    dynamics: [0.7, 0.76],
  },
  {
    id: "VERSE_1B",
    title: "Verse 1 (cello rises)",
    bars: 8,
    bpm: [92, 92],
    chords: VERSE_B_CHORDS,
    voice: "cello",
    articulation: "legato",
    base: 50,
    lines: verse(
      [
        "but THRONES made of STONE are des-TINED to CRACK,",
        "the DIRT in our FIN-ger-nails is CLAW-ing its way BACK.",
        "they BLEED the ho-RI-zon, they POI-son the SPRING,",
        "but a SI-lent COUN-try is a DAN-ger-ous THING.",
      ],
      VERSE_B_CONTOUR,
    ),
    parts: ["bassMarch", "bassDrone", "celloCounter"],
    dynamics: [0.78, 0.85],
  },
  {
    id: "PRE_CHORUS",
    title: "Pre-chorus",
    bars: 10,
    bpm: [92, 104],
    chords: [Bb, Bb, C, C, Gm, Gm, A, A, A, A],
    voice: "cello",
    articulation: "legato",
    base: 50,
    lines: [
      { text: "LIS-ten CLOSE to the WOOD and the WIRE,", stress: [2, 5, 7, 9] },
      { text: "EV-ery BREATH is a SPARK for the FIRE.", stress: [6, 8, 10, 8] },
      { text: "they have TAK-en the HAR-vest, the HOUSE, and the NAME,", stress: [7, 10, 7, 5] },
      { text: "but they LEFT us the ASH...", stress: [4, 6] },
      { text: "and we're BRING-ing the FLAME.", stress: [8, 11] },
    ],
    parts: ["bassMarch", "spiccato"],
    dynamics: [0.8, 1],
  },
  {
    id: "CHORUS_1",
    title: "Chorus",
    bars: 12,
    bpm: [104, 104],
    chords: CHORUS_CHORDS,
    voice: "violin",
    articulation: "marcato",
    base: 74,
    lines: CHORUS_LINES,
    parts: ["bassLong", "celloChords"],
    dynamics: [1, 1],
  },
  {
    id: "VERSE_2A",
    title: "Verse 2",
    bars: 8,
    bpm: [104, 104],
    chords: VERSE_A_CHORDS,
    voice: "cello",
    articulation: "marcato",
    base: 50,
    lines: verse(
      [
        "they CALL it a PEACE when they SI-lence the STREET,",
        "they COUNT up their GOLD at the COST of de-FEAT.",
        "un-WOR-thy to RULE, they are HOL-low and BLIND,",
        "LEAV-ing noth-ing but CHAINS and SHAD-ows be-HIND.",
      ],
      VERSE_A_CONTOUR,
    ),
    parts: ["bassMarch", "celloJagged"],
    dynamics: [0.85, 0.88],
  },
  {
    id: "VERSE_2B",
    title: "Verse 2 (violins enter)",
    bars: 8,
    bpm: [104, 104],
    chords: VERSE_B_CHORDS,
    voice: "cello",
    articulation: "marcato",
    base: 50,
    lines: verse(
      [
        "but the BLOOD of the FAL-len still CRIES from the STONE,",
        "a NA-tion a-LIVE can-not BLEED for a THRONE.",
        "the MAS-ters will LEARN what the DOWN-trod-den KNOW:",
        "the HIGH-er the TOW-er, the HARD-er the BLOW.",
      ],
      VERSE_B_CONTOUR,
    ),
    parts: ["bassMarch", "celloJagged", "violinPiercing"],
    dynamics: [0.9, 0.95],
  },
  {
    id: "BRIDGE",
    title: "Bridge",
    bars: 12,
    bpm: [104, 104],
    chords: [Dm, Dm, Bb, Bb, Gm, Gm, Bb, Bb, Gm, Gm, A, A],
    voice: "violin",
    articulation: "tremolo",
    base: 62,
    lines: [
      { text: "no MOD-ern ma-CHINES. no MER-cy. no GRACE.", stress: [4, 2, 4, 0] },
      { text: "just the STRENGTH of our HANDS to re-CLAIM this PLACE.", stress: [5, 7, 9, 7] },
      { text: "can you HEAR it?", stress: [7] },
      { text: "the BREAK-ing of CHAINS?", stress: [7, 9] },
      { text: "the ICE is now MELT-ing...", stress: [10, 12] },
      { text: "to FLOOD through our VEINS!", stress: [11, 13] },
    ],
    parts: ["bassHeartbeat"],
    dynamics: [0.3, 0.95],
  },
  {
    id: "CHORUS_2",
    title: "Chorus (maximum intensity)",
    bars: 12,
    bpm: [104, 104],
    chords: CHORUS_CHORDS,
    voice: "violin",
    articulation: "marcato",
    base: 74,
    lines: CHORUS_LINES,
    doubling: -12,
    parts: ["bassLong", "bassMarch", "celloChords", "spiccato"],
    dynamics: [1.1, 1.15],
  },
  {
    id: "OUTRO_CLIMAX",
    title: "Outro (fever pitch)",
    bars: 4,
    bpm: [104, 104],
    chords: [Dm, Bb, F, C],
    voice: "violin",
    articulation: "marcato",
    base: 74,
    lines: [
      { text: "the CROWN hits the FLOOR.", stress: [9, 11] },
      { text: "the PEO-ple are FREE.", stress: [9, 12] },
    ],
    parts: ["bassLong", "celloChords", "feverRun"],
    dynamics: [1.15, 1.25],
  },
  {
    id: "OUTRO_FINAL",
    title: "Outro (final chord)",
    bars: 6,
    bpm: [104, 104],
    chords: [Bb, A, Dm, Dm, Dm, Dm],
    voice: "cello",
    articulation: "marcato",
    base: 50,
    lines: [
      {
        text: "the LAND be-LONGS... to US.",
        stress: [5, 4, 7],
        bars: 6,
        steps: [4, 8, 12, 16, 30, 32],
        degrees: [4, 5, 4, 4, 6, 7],
      },
    ],
    parts: ["finalStabs"],
    dynamics: [1.2, 1.2],
  },
  {
    id: "TAIL",
    title: "Silence before the song starts again",
    bars: 4,
    bpm: [104, 104],
    chords: [Dm, Dm, Dm, Dm],
    voice: "cello",
    articulation: "legato",
    base: 50,
    lines: [],
    parts: [],
    dynamics: [0, 0],
  },
];

// ---------------------------------------------------------------------------
// Lyric setting
// ---------------------------------------------------------------------------

export interface Syllable {
  text: string;
  stressed: boolean;
}

export const syllables = (line: string): Syllable[] =>
  line
    .replace(/[!?.,;:]/g, " ")
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((text) => ({ text, stressed: /[A-Z]/.test(text) && text === text.toUpperCase() }));

const mod = (n: number, m: number) => ((n % m) + m) % m;
const NATURAL_MINOR = [0, 2, 3, 5, 7, 8, 10];

/** D-minor scale degree → MIDI; the 7th is raised (C#) over an A-major chord. */
export const degreeToMidi = (deg: number, base: number, chord: Chord): number => {
  const idx = mod(deg, 7);
  let m = base + NATURAL_MINOR[idx] + 12 * Math.floor(deg / 7);
  if (idx === 6 && chord.pcs.includes(1)) m += 1;
  return m;
};

export const snapToChord = (midi: number, chord: Chord): number => {
  for (let d = 0; d <= 6; d++) {
    if (chord.pcs.includes(mod(midi + d, 12))) return midi + d;
    if (chord.pcs.includes(mod(midi - d, 12))) return midi - d;
  }
  return midi;
};

/** Chord tones at or above `low`, ascending. */
export const chordTones = (chord: Chord, low: number, count: number): number[] => {
  const out: number[] = [];
  for (let m = low; out.length < count && m < low + 60; m++)
    if (chord.pcs.includes(mod(m, 12))) out.push(m);
  return out;
};

interface SetSyllable extends Syllable {
  pos: number;
  deg: number;
}

/** Place each syllable on the 16th grid: stresses on beats, unstressed syllables lead into them. */
export function setLine(line: LineSpec): SetSyllable[] {
  const syl = syllables(line.text);
  const n = syl.length;
  const slots = (line.bars ?? 2) * 16;
  const S = syl.map((s, i) => (s.stressed ? i : -1)).filter((i) => i >= 0);
  const k = S.length;
  const pos: number[] = new Array(n).fill(0);
  const deg: number[] = new Array(n).fill(0);
  const stressDeg = (i: number) => line.stress[Math.min(i, line.stress.length - 1)] ?? 0;

  if (k > 0) {
    const spacing = k >= 4 ? Math.max(4, Math.floor(slots / k / 4) * 4) : 8;
    S.forEach((si, i) => {
      pos[si] = i * spacing;
      deg[si] = stressDeg(i);
    });
    // Pickup syllables before the first stress.
    const m0 = S[0];
    const d0 = m0 <= 2 ? 2 : 1;
    for (let j = 0; j < m0; j++) {
      pos[j] = -d0 * (m0 - j);
      deg[j] = stressDeg(0) - (m0 - j);
    }
    for (let i = 0; i < k; i++) {
      const from = S[i] + 1;
      const to = i + 1 < k ? S[i + 1] : n;
      const m = to - from;
      for (let j = 0; j < m; j++) {
        const idx = from + j;
        if (i + 1 < k) {
          const d = 2 * m < spacing ? 2 : 1;
          pos[idx] = pos[S[i + 1]] - d * (m - j);
          const a = stressDeg(i);
          const b = stressDeg(i + 1);
          deg[idx] = Math.round(a + ((b - a) * (j + 1)) / (m + 1));
        } else {
          pos[idx] = pos[S[i]] + 4 + 2 * j;
          deg[idx] = stressDeg(i) - (j + 1);
        }
      }
    }
  }
  if (line.steps) line.steps.forEach((p, i) => (pos[i] = p));
  if (line.degrees) line.degrees.forEach((d, i) => (deg[i] = d));
  return syl.map((s, i) => ({ ...s, pos: pos[i], deg: deg[i] }));
}

// ---------------------------------------------------------------------------
// Build the full timeline
// ---------------------------------------------------------------------------

export interface SongSection extends SectionSpec {
  startStep: number;
  steps: number;
}

export interface ScoreNote {
  /** Absolute 16th-note step in the song. */
  step: number;
  /** Length in 16th steps. */
  dur: number;
  midi: number;
  velocity: number;
  voice: Voice;
  articulation: Articulation;
  section: SectionId;
  lyric?: string;
  stressed: boolean;
  /** True for the octave doubling, not the sung line itself. */
  doubled?: boolean;
}

export interface Song {
  title: string;
  sections: SongSection[];
  totalSteps: number;
  melody: ScoreNote[];
  melodyByStep: Map<number, ScoreNote[]>;
}

export interface SongPosition {
  section: SongSection;
  /** Step within the section. */
  rel: number;
  bar: number;
  stepInBar: number;
  chord: Chord;
  bpm: number;
  dynamics: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function buildSong(specs: SectionSpec[] = SECTIONS): Song {
  const sections: SongSection[] = [];
  let start = 0;
  for (const spec of specs) {
    sections.push({ ...spec, startStep: start, steps: spec.bars * 16 });
    start += spec.bars * 16;
  }
  const totalSteps = start;
  const sectionAt = (abs: number) => {
    const s = mod(abs, totalSteps);
    return sections.find((x) => s >= x.startStep && s < x.startStep + x.steps)!;
  };
  const chordAt = (abs: number) => {
    const sec = sectionAt(abs);
    return sec.chords[Math.floor((mod(abs, totalSteps) - sec.startStep) / 16)];
  };
  const dynAt = (sec: SongSection, abs: number) =>
    lerp(
      sec.dynamics[0],
      sec.dynamics[1],
      Math.min(1, Math.max(0, (abs - sec.startStep) / sec.steps)),
    );

  const melody: ScoreNote[] = [];
  for (const sec of sections) {
    const notes: (ScoreNote & { end: number })[] = [];
    let lineBar = 0;
    for (const line of sec.lines) {
      const bars = line.bars ?? 2;
      const lineStart = sec.startStep + lineBar * 16;
      const lineEnd = lineStart + bars * 16;
      for (const s of setLine(line)) {
        const abs = lineStart + s.pos;
        const chord = chordAt(abs);
        let midi = degreeToMidi(s.deg, sec.base, chord);
        if (s.stressed && !line.degrees) midi = snapToChord(midi, chord);
        notes.push({
          step: abs,
          dur: 0,
          end: lineEnd,
          midi,
          velocity: (s.stressed ? 1 : 0.72) * dynAt(sec, abs),
          voice: sec.voice,
          articulation: sec.articulation,
          section: sec.id,
          lyric: s.text,
          stressed: s.stressed,
        });
      }
      lineBar += bars;
    }
    for (const x of sec.extraNotes ?? []) {
      const abs = sec.startStep + x.bar * 16 + x.step;
      notes.push({
        step: abs,
        dur: x.dur,
        end: abs + x.dur,
        midi: x.midi,
        velocity: 0.85 * dynAt(sec, abs),
        voice: sec.voice,
        articulation: sec.articulation,
        section: sec.id,
        stressed: false,
      });
    }
    notes.sort((a, b) => a.step - b.step);
    notes.forEach((nt, i) => {
      if (nt.dur > 0) return;
      const next = i + 1 < notes.length ? notes[i + 1].step : Infinity;
      nt.dur = Math.max(1, Math.min(next, nt.end) - nt.step);
    });
    for (const { end: _end, ...nt } of notes) {
      melody.push(nt);
      if (sec.doubling)
        melody.push({
          ...nt,
          midi: nt.midi + sec.doubling,
          velocity: nt.velocity * 0.7,
          doubled: true,
        });
    }
  }

  const melodyByStep = new Map<number, ScoreNote[]>();
  for (const nt of melody) {
    const key = mod(nt.step, totalSteps);
    const list = melodyByStep.get(key);
    if (list) list.push(nt);
    else melodyByStep.set(key, [nt]);
  }
  return { title: SONG_TITLE, sections, totalSteps, melody, melodyByStep };
}

export const IRON_BOW: Song = buildSong();

/** Where in the song a given step is (wraps around, the song loops forever). */
export function locate(song: Song, step: number): SongPosition {
  const s = mod(step, song.totalSteps);
  const section = song.sections.find((x) => s >= x.startStep && s < x.startStep + x.steps)!;
  const rel = s - section.startStep;
  const t = rel / section.steps;
  const bar = Math.floor(rel / 16);
  return {
    section,
    rel,
    bar,
    stepInBar: rel % 16,
    chord: section.chords[bar],
    bpm: lerp(section.bpm[0], section.bpm[1], t),
    dynamics: lerp(section.dynamics[0], section.dynamics[1], t),
  };
}

/** Length of one full play-through in seconds. */
export function songDurationSec(song: Song): number {
  let sec = 0;
  for (let i = 0; i < song.totalSteps; i++) sec += 60 / locate(song, i).bpm / 4;
  return sec;
}
