/**
 * "Iron Meridian" — adaptive dystopian cyber-industrial orchestral score.
 *
 * Fully procedural (Web Audio), 90 BPM march in D minor. Four phases cross-fade
 * as the music director (musicDirector.ts) reports tension changes:
 *
 *   Phase 1  AMBIENT     ambient synth hums + distant metallic taps
 *            "Shadows stretch across the iron wire / Beneath the grid, a quiet, growing fire."
 *   Phase 2  ASSAULT     heavy industrial drums + distorted rolling bassline
 *            "Brick by brick, we break the monolith / Take the streets they built the empire with."
 *   Phase 3  COMBAT      piercing strings, booming lows, 16th-note drivers
 *            "Stand your ground against the steel brigade! / Reclaim the districts where the ghosts were made!"
 *   Phase 4  RESOLUTION  instruments drop out, cold echoing reverb tail
 *            "The sector falls silent. The iron belongs to us now."
 *
 * The track is instrumental, but every lead rhythm is a lyric line set to the
 * 16th-note grid: each syllable is a note, stressed syllables (UPPER CASE) are
 * accented and land on chord tones, so the phrases "speak" the words.
 */

import {
  MUSIC_BPM,
  NEAR_ENEMY_RANGE,
  createMusicDirectorState,
  nextMusicPhase,
  type MusicContext,
  type MusicDirectorState,
  type MusicPhase,
  type ThreatSnapshot,
} from './musicDirector';

// ---------------------------------------------------------------------------
// Composition data
// ---------------------------------------------------------------------------

interface Syllable {
  text: string;
  /** Position on a 32-step (two bar) 16th-note grid. */
  slot: number;
  stressed: boolean;
  /** Melodic contour: index into the current chord's tones (0 = root, 3 = root an octave up). */
  tone: number;
}

/** Build a motif from "SHA-dows STRETCH ..." text and matching slot / tone arrays. */
const motif = (line: string, slots: number[], tones: number[]): Syllable[] => {
  const syl = line.replace(/[!.,]/g, '').split(/[\s-]+/).filter(Boolean);
  return syl.map((text, i) => ({
    text,
    slot: slots[i],
    stressed: text === text.toUpperCase() && /[A-Z]/.test(text),
    tone: tones[i] ?? 0,
  }));
};

const SIXTEENTH = 60 / MUSIC_BPM / 4;

// Phase 1 — distant metal taps, spread wide and slow.
const LYRIC_SHADOWS = motif(
  'SHA-dows STRETCH a-CROSS the I-ron WIRE',
  [0, 3, 6, 10, 12, 15, 18, 21, 24],
  [4, 2, 5, 2, 4, 1, 3, 2, 5]
);
const LYRIC_GRID = motif(
  'be-NEATH the GRID a QUI-et GROW-ing FIRE',
  [0, 2, 5, 8, 12, 14, 17, 20, 23, 26],
  [1, 3, 1, 4, 2, 4, 2, 5, 3, 6]
);
// Phase 2 — the bassline hook.
const LYRIC_BRICK = motif(
  'BRICK by BRICK we BREAK the MON-o-lith TAKE the STREETS they BUILT the EM-pire WITH',
  [0, 2, 4, 7, 8, 10, 12, 13, 14, 16, 18, 20, 23, 24, 26, 28, 29, 30],
  [0, 3, 0, 2, 0, 3, 1, 0, 3, 0, 3, 0, 2, 1, 3, 2, 1, 0]
);
// Phase 3 — the string lead.
const LYRIC_STAND = motif(
  'STAND your GROUND a-GAINST the STEEL bri-GADE re-CLAIM the DIS-tricts WHERE the GHOSTS were MADE',
  [0, 3, 4, 6, 7, 9, 10, 12, 13, 16, 17, 19, 20, 22, 24, 25, 26, 28, 29],
  [3, 2, 3, 4, 4, 3, 5, 4, 5, 2, 3, 2, 4, 3, 4, 3, 5, 4, 3]
);
// Phase 4 — final stabs, on an 8th-note grid (half speed), then silence.
const LYRIC_SECTOR = motif(
  'the SEC-tor FALLS SI-lent the I-ron be-LONGS to US NOW',
  [0, 1, 2, 4, 6, 7, 12, 13, 14, 16, 17, 19, 20, 22],
  [0, 4, 3, 2, 1, 0, 0, 3, 2, 1, 2, 1, 0, 0]
);

interface Chord {
  /** Bass root, MIDI. */
  root: number;
  intervals: [number, number, number];
}
/** i – VI – iv – V in D minor (harmonic minor dominant for the cold pull home). Two bars each. */
const PROGRESSION: Chord[] = [
  { root: 38, intervals: [0, 3, 7] }, // Dm
  { root: 34, intervals: [0, 4, 7] }, // Bb
  { root: 31, intervals: [0, 3, 7] }, // Gm
  { root: 33, intervals: [0, 4, 7] }, // A
];

const chordTone = (chord: Chord, index: number, octaveOffset: number): number => {
  const oct = Math.floor(index / 3);
  return chord.root + octaveOffset + chord.intervals[((index % 3) + 3) % 3] + oct * 12;
};

const midiHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

type LayerName = 'pad' | 'taps' | 'drums' | 'bass' | 'strings' | 'outro';

const LAYER_SEND: Record<LayerName, number> = {
  pad: 0.35,
  taps: 0.9,
  drums: 0.16,
  bass: 0.06,
  strings: 0.32,
  outro: 1,
};

const PHASE_MIX: Record<MusicPhase, Record<LayerName, number>> = {
  AMBIENT: { pad: 0.6, taps: 0.75, drums: 0, bass: 0, strings: 0, outro: 0 },
  ASSAULT: { pad: 0.38, taps: 0.35, drums: 0.85, bass: 0.7, strings: 0, outro: 0 },
  COMBAT: { pad: 0.3, taps: 0.2, drums: 1, bass: 0.85, strings: 0.72, outro: 0 },
  RESOLUTION: { pad: 0, taps: 0, drums: 0, bass: 0, strings: 0, outro: 1 },
};

const MASTER_LEVEL = 0.34;
const MUTE_KEY = 'iron-meridian:music-muted';

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

interface Layer {
  gain: GainNode;
  send: GainNode;
}

class AdaptiveScoreEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private reverbReturn!: GainNode;
  private reverb!: ConvolverNode;
  private layers!: Record<LayerName, Layer>;
  private noise!: AudioBuffer;
  private distCurve!: Float32Array<ArrayBuffer>;
  private padFilter!: BiquadFilterNode;
  private padVoices: OscillatorNode[][] = [];
  private hum!: OscillatorNode;

  private muted = false;
  private started = false;
  private timer: number | null = null;
  private nextTime = 0;
  private step = 0;

  private context: MusicContext = 'HOME';
  private threat: ThreatSnapshot = { nearEnemies: 0, engagedEnemies: 0, objectiveDist: null };
  private lastCombatEventAt = -Infinity;
  private director: MusicDirectorState = createMusicDirectorState();

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        this.muted = window.localStorage.getItem(MUTE_KEY) === '1';
      } catch {
        /* storage unavailable */
      }
    }
  }

  // ---- public API --------------------------------------------------------

  /** Must be called from a user gesture (browser autoplay rules). Safe to call repeatedly. */
  public start(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.buildGraph();
      document.addEventListener('visibilitychange', this.onVisibility);
    }
    if (this.muted) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    if (!this.started) {
      this.started = true;
      const now = this.ctx.currentTime;
      this.master.gain.setValueAtTime(0, now);
      this.master.gain.linearRampToValueAtTime(MASTER_LEVEL, now + 3);
      this.applyMix(this.director.phase, 0.5);
      this.nextTime = now + 0.1;
      this.step = 0;
      this.timer = window.setInterval(this.tick, 25);
    }
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    try {
      window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (!this.ctx) {
      if (!muted) this.start();
      return;
    }
    const now = this.ctx.currentTime;
    if (muted) {
      this.master.gain.setTargetAtTime(0, now, 0.15);
      window.setTimeout(() => {
        if (this.muted) this.ctx?.suspend().catch(() => {});
      }, 600);
    } else {
      this.ctx.resume().catch(() => {});
      if (!this.started) this.start();
      else {
        this.master.gain.setTargetAtTime(MASTER_LEVEL, now, 0.4);
        this.nextTime = this.ctx.currentTime + 0.1;
      }
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setContext(context: MusicContext): void {
    this.context = context;
    this.updateDirector();
  }

  /** Called every frame by the 3D arena. */
  public reportThreat(threat: ThreatSnapshot): void {
    this.threat = threat;
  }

  /** Player fired — only counts as combat when hostiles are close. */
  public notePlayerFired(): void {
    if (this.threat.nearEnemies > 0) this.lastCombatEventAt = performance.now() / 1000;
  }

  public notePlayerHit(): void {
    this.lastCombatEventAt = performance.now() / 1000;
  }

  public getPhase(): MusicPhase {
    return this.director.phase;
  }

  // ---- graph -------------------------------------------------------------

  private buildGraph(): void {
    const ctx = this.ctx!;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;
    comp.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(comp);

    // Cold, long hall: 5 s stereo impulse with a bright, slowly darkening tail.
    this.reverb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 5);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const tNorm = i / len;
        const white = Math.random() * 2 - 1;
        const smoothing = 0.15 + tNorm * 0.7; // darker as it decays
        lp = lp * smoothing + white * (1 - smoothing);
        d[i] = lp * Math.pow(1 - tNorm, 3.4);
      }
    }
    this.reverb.buffer = ir;
    this.reverbReturn = ctx.createGain();
    this.reverbReturn.gain.value = 0.8;
    this.reverb.connect(this.reverbReturn);
    this.reverbReturn.connect(this.master);

    const mk = (name: LayerName): Layer => {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(this.master);
      const send = ctx.createGain();
      send.gain.value = LAYER_SEND[name];
      gain.connect(send);
      send.connect(this.reverb);
      return { gain, send };
    };
    this.layers = {
      pad: mk('pad'),
      taps: mk('taps'),
      drums: mk('drums'),
      bass: mk('bass'),
      strings: mk('strings'),
      outro: mk('outro'),
    };

    // Shared white noise
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    // Bass distortion curve
    const n = 1024;
    this.distCurve = new Float32Array(new ArrayBuffer(n * 4));
    const k = 28;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      this.distCurve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
    }

    // Ambient pad — 3 chord voices x 2 detuned saws, through a slowly breathing lowpass.
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 520;
    this.padFilter.Q.value = 2.2;
    const padGain = ctx.createGain();
    padGain.gain.value = 0.07;
    this.padFilter.connect(padGain);
    padGain.connect(this.layers.pad.gain);

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 240;
    lfo.connect(lfoDepth);
    lfoDepth.connect(this.padFilter.frequency);
    lfo.start();

    const first = PROGRESSION[0];
    for (let v = 0; v < 3; v++) {
      const voice: OscillatorNode[] = [];
      for (const detune of [-9, 7]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.detune.value = detune;
        osc.frequency.value = midiHz(chordTone(first, v, 12));
        osc.connect(this.padFilter);
        osc.start();
        voice.push(osc);
      }
      this.padVoices.push(voice);
    }

    // Low electrical hum under everything.
    this.hum = ctx.createOscillator();
    this.hum.type = 'sine';
    this.hum.frequency.value = midiHz(first.root);
    const humGain = ctx.createGain();
    humGain.gain.value = 0.16;
    this.hum.connect(humGain);
    humGain.connect(this.layers.pad.gain);
    this.hum.start();
  }

  private onVisibility = (): void => {
    if (!this.ctx) return;
    if (document.hidden) this.ctx.suspend().catch(() => {});
    else if (!this.muted && this.started) {
      this.ctx.resume().catch(() => {});
      this.nextTime = this.ctx.currentTime + 0.1;
    }
  };

  private applyMix(phase: MusicPhase, timeConstant: number): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const mix = PHASE_MIX[phase];
    (Object.keys(mix) as LayerName[]).forEach((name) => {
      const g = this.layers[name].gain.gain;
      g.cancelScheduledValues(now);
      g.setTargetAtTime(mix[name], now, timeConstant);
    });
    this.reverbReturn.gain.setTargetAtTime(phase === 'RESOLUTION' ? 1.35 : 0.8, now, 0.4);
  }

  // ---- director ------------------------------------------------------------

  private updateDirector(): void {
    const prev = this.director.phase;
    this.director = nextMusicPhase(this.director, {
      context: this.context,
      threat: this.threat,
      lastCombatEventAt: this.lastCombatEventAt,
      now: performance.now() / 1000,
    });
    const phase = this.director.phase;
    if (phase === prev || !this.ctx || !this.started) return;

    if (phase === 'RESOLUTION') {
      this.applyMix(phase, 0.12);
      this.playResolution();
      return;
    }
    if (prev === 'RESOLUTION') {
      // Restart the theme from the top of the progression.
      this.step = 0;
      this.nextTime = this.ctx.currentTime + 0.15;
      this.applyMix(phase, 1.2);
      return;
    }
    const rising = (phase === 'COMBAT') || (phase === 'ASSAULT' && prev === 'AMBIENT');
    this.applyMix(phase, rising ? 0.18 : 1.6);
    if (phase === 'COMBAT' && prev !== 'COMBAT') {
      const t = this.nextTime;
      this.boom(t, 1, this.layers.drums.gain);
      this.clang(t, 1);
    }
  }

  private tick = (): void => {
    if (!this.ctx || this.muted) return;
    this.updateDirector();
    const now = this.ctx.currentTime;
    if (this.nextTime < now - 0.25) this.nextTime = now + 0.05; // recovered from a stall
    while (this.nextTime < now + 0.12) {
      this.scheduleStep(this.step, this.nextTime);
      this.nextTime += SIXTEENTH;
      this.step++;
    }
  };

  // ---- sequencing ----------------------------------------------------------

  private scheduleStep(step: number, t: number): void {
    const phase = this.director.phase;
    if (phase === 'RESOLUTION') return;

    const bar = Math.floor(step / 16);
    const s16 = step % 16;
    const s32 = step % 32;
    const chord = PROGRESSION[Math.floor(bar / 2) % PROGRESSION.length];
    const lastBarOfPhrase = bar % 4 === 3;

    if (s32 === 0) this.setPadChord(chord, t);

    // ---- Phase 1 layer: distant metallic taps ("Shadows stretch across the iron wire")
    const tapLine = Math.floor(step / 32) % 2 === 0 ? LYRIC_SHADOWS : LYRIC_GRID;
    for (const syl of tapLine) {
      if (syl.slot !== s32) continue;
      if (Math.random() > (syl.stressed ? 0.9 : 0.45)) continue;
      const pitch = midiHz(chordTone(chord, syl.tone, 48));
      this.metalTap(t, syl.stressed ? 0.55 : 0.25, pitch, syl.stressed ? 1.1 : 0.5);
      if (syl.text === 'FIRE') this.padSwell(t);
    }

    if (phase === 'AMBIENT') return;
    const combat = phase === 'COMBAT';

    // ---- Phase 2: industrial march drums
    if (s16 === 0 || s16 === 8) this.kick(t, 1);
    if (combat && (s16 === 3 || s16 === 10 || s16 === 11)) this.kick(t, 0.75);
    if (!combat && s16 === 10 && bar % 2 === 1) this.kick(t, 0.55);

    const fill = lastBarOfPhrase && s16 >= (combat ? 8 : 12);
    if (fill) {
      this.tom(t, 0.7 + (s16 - 8) * 0.03, 150 - (s16 - 8) * 9);
    } else if (s16 === 4 || s16 === 12) {
      this.clang(t, combat ? 1 : 0.8);
    }
    if (combat && s16 === 14) this.metalTap(t, 0.35, 260, 0.25, this.layers.drums.gain);

    if (combat) this.hat(t, s16 % 4 === 0 ? 0.32 : s16 % 2 === 0 ? 0.22 : 0.14);
    else if (s16 % 2 === 0) this.hat(t, s16 % 4 === 0 ? 0.28 : 0.16);

    // ---- Phase 2: rolling distorted bass ("Brick by brick, we break the monolith")
    const bassHit = LYRIC_BRICK.find((s) => s.slot === s32);
    if (bassHit) {
      const m = chordTone(chord, bassHit.tone, 0);
      this.bassNote(t, m, bassHit.stressed ? SIXTEENTH * 1.8 : SIXTEENTH * 0.9, bassHit.stressed ? 0.95 : 0.6);
    } else if (combat || s16 % 2 === 0) {
      const m = chord.root + (combat && s16 % 2 === 1 ? 12 : 0);
      this.bassNote(t, m, SIXTEENTH * 0.75, combat ? 0.42 : 0.34);
    }

    if (!combat) return;

    // ---- Phase 3: booming lows + piercing strings ("Stand your ground against the steel brigade!")
    if (s32 === 0) this.boom(t, 0.9, this.layers.drums.gain);
    if (s32 === 16) this.boom(t, 0.55, this.layers.drums.gain);

    // String tremolo bed, root/fifth alternating in octave 4.
    this.stringNote(t, chordTone(chord, s16 % 2 === 0 ? 0 : 2, 24), SIXTEENTH * 0.9, 0.12, true);

    const idx = LYRIC_STAND.findIndex((s) => s.slot === s32);
    if (idx >= 0) {
      const syl = LYRIC_STAND[idx];
      const nextSlot = idx + 1 < LYRIC_STAND.length ? LYRIC_STAND[idx + 1].slot : 32;
      const dur = (nextSlot - syl.slot) * SIXTEENTH * 0.94;
      this.stringNote(t, chordTone(chord, syl.tone, 36), dur, syl.stressed ? 0.42 : 0.26, false);
    }
  }

  private setPadChord(chord: Chord, t: number): void {
    this.padVoices.forEach((voice, v) => {
      const f = midiHz(chordTone(chord, v, 12));
      voice.forEach((osc) => osc.frequency.setTargetAtTime(f, t, 0.35));
    });
    this.hum.frequency.setTargetAtTime(midiHz(chord.root), t, 0.5);
  }

  /** "a quiet, growing fire" — the pad filter blooms open and settles back. */
  private padSwell(t: number): void {
    const f = this.padFilter.frequency;
    f.cancelScheduledValues(t);
    f.setValueAtTime(520, t);
    f.linearRampToValueAtTime(1500, t + 1.4);
    f.linearRampToValueAtTime(520, t + 4);
  }

  /** Phase 4: cut, final impact, the last line spoken in stabs, then a cold open-fifth tail. */
  private playResolution(): void {
    const ctx = this.ctx!;
    const out = this.layers.outro.gain;
    const t0 = ctx.currentTime + 0.08;
    const dm = PROGRESSION[0];

    this.boom(t0, 1, out);
    this.clang(t0, 0.9, out);
    [0, 1, 2].forEach((i) => this.stringNote(t0, chordTone(dm, i, 24), 1.4, 0.22, false, out));

    const eighth = SIXTEENTH * 2;
    const start = t0 + 1.6;
    LYRIC_SECTOR.forEach((syl, i) => {
      const t = start + syl.slot * eighth;
      const fade = 1 - (i / LYRIC_SECTOR.length) * 0.6;
      if (syl.text === 'NOW') return;
      this.metalTap(t, (syl.stressed ? 0.5 : 0.2) * fade, midiHz(chordTone(dm, syl.tone + 3, 48)), syl.stressed ? 1.6 : 0.6, out);
      if (syl.stressed) this.stringNote(t, chordTone(dm, syl.tone, 36), eighth * 1.6, 0.16 * fade, false, out);
    });

    // "...belongs to us NOW" — open fifth D–A–E, no third: cold, unresolved, echoing out.
    const tNow = start + LYRIC_SECTOR[LYRIC_SECTOR.length - 1].slot * eighth;
    [50, 57, 64, 69].forEach((m) => this.stringNote(tNow, m, 4.5, 0.13, false, out, 1.2));
    this.boom(tNow, 0.5, out);
  }

  // ---- instruments ---------------------------------------------------------

  private noiseSource(t: number): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    src.start(t, Math.random() * 1.5);
    return src;
  }

  private envGain(t: number, peak: number, attack: number, decay: number): GainNode {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  /** Inharmonic struck-metal partials (pipes, rebar, wire). */
  private metalTap(t: number, vel: number, baseHz: number, decay: number, dest?: AudioNode): void {
    const ctx = this.ctx!;
    const env = this.envGain(t, vel * 0.09, 0.002, decay);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = Math.min(baseHz * 0.8, 1800);
    hp.connect(env);
    env.connect(dest ?? this.layers.taps.gain);
    [1, 1.483, 2.17, 2.93, 3.71].forEach((r) => {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = baseHz * r;
      o.connect(hp);
      o.start(t);
      o.stop(t + decay + 0.05);
    });
  }

  private kick(t: number, vel: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    const g = this.envGain(t, vel * 0.9, 0.003, 0.42);
    const shaper = ctx.createWaveShaper();
    shaper.curve = this.distCurve;
    o.connect(shaper);
    shaper.connect(g);
    g.connect(this.layers.drums.gain);
    o.start(t);
    o.stop(t + 0.5);
  }

  /** Industrial snare: noise crack plus a struck steel plate. */
  private clang(t: number, vel: number, dest?: AudioNode): void {
    const ctx = this.ctx!;
    const target = dest ?? this.layers.drums.gain;
    const n = this.noiseSource(t);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1500;
    bp.Q.value = 1.1;
    const g = this.envGain(t, vel * 0.55, 0.002, 0.22);
    n.connect(bp);
    bp.connect(g);
    g.connect(target);
    n.stop(t + 0.3);
    this.metalTap(t, vel * 1.4, 210, 0.38, target);
  }

  private hat(t: number, vel: number): void {
    const ctx = this.ctx!;
    const n = this.noiseSource(t);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7200;
    const g = this.envGain(t, vel * 0.32, 0.001, 0.045);
    n.connect(hp);
    hp.connect(g);
    g.connect(this.layers.drums.gain);
    n.stop(t + 0.08);
  }

  private tom(t: number, vel: number, hz: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(hz, t);
    o.frequency.exponentialRampToValueAtTime(hz * 0.55, t + 0.2);
    const g = this.envGain(t, vel * 0.6, 0.002, 0.26);
    o.connect(g);
    g.connect(this.layers.drums.gain);
    o.start(t);
    o.stop(t + 0.3);
  }

  /** Sub-bass impact with a low rumble. */
  private boom(t: number, vel: number, dest: AudioNode): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(62, t);
    o.frequency.exponentialRampToValueAtTime(27, t + 1.6);
    const g = this.envGain(t, vel * 0.85, 0.01, 2.2);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + 2.4);

    const n = this.noiseSource(t);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 140;
    const ng = this.envGain(t, vel * 0.5, 0.02, 1.4);
    n.connect(lp);
    lp.connect(ng);
    ng.connect(dest);
    n.stop(t + 1.6);
  }

  private bassNote(t: number, midi: number, dur: number, vel: number): void {
    const ctx = this.ctx!;
    const f = midiHz(midi);
    const shaper = ctx.createWaveShaper();
    shaper.curve = this.distCurve;
    shaper.oversample = '2x';
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 4;
    lp.frequency.setValueAtTime(1300 * vel + 200, t);
    lp.frequency.exponentialRampToValueAtTime(220, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel * 0.3, t + 0.006);
    g.gain.setValueAtTime(vel * 0.3, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
    shaper.connect(lp);
    lp.connect(g);
    g.connect(this.layers.bass.gain);
    [-6, 6].forEach((detune) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = detune;
      o.connect(shaper);
      o.start(t);
      o.stop(t + dur + 0.08);
    });
  }

  /** Bowed-string ensemble: three detuned saws with vibrato and a bright presence peak. */
  private stringNote(
    t: number,
    midi: number,
    dur: number,
    vel: number,
    tremolo: boolean,
    dest?: AudioNode,
    attack = tremolo ? 0.008 : 0.05
  ): void {
    const ctx = this.ctx!;
    const f = midiHz(midi);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 280;
    const peak = ctx.createBiquadFilter();
    peak.type = 'peaking';
    peak.frequency.value = 2900;
    peak.gain.value = 7;
    peak.Q.value = 1.1;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 6500;
    const g = ctx.createGain();
    const level = vel * 0.11;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(level, t + attack);
    g.gain.setValueAtTime(level, t + Math.max(attack, dur - 0.05));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + (tremolo ? 0.04 : 0.35));
    hp.connect(peak);
    peak.connect(lp);
    lp.connect(g);
    g.connect(dest ?? this.layers.strings.gain);

    const stopAt = t + dur + 0.45;
    let vib: OscillatorNode | null = null;
    let vibDepth: GainNode | null = null;
    if (!tremolo) {
      vib = ctx.createOscillator();
      vib.frequency.value = 5.4;
      vibDepth = ctx.createGain();
      vibDepth.gain.setValueAtTime(0, t);
      vibDepth.gain.linearRampToValueAtTime(9, t + Math.min(0.4, dur));
      vib.connect(vibDepth);
      vib.start(t);
      vib.stop(stopAt);
    }
    const detunes = tremolo ? [-5, 5] : [-11, 0, 10];
    detunes.forEach((d) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = d;
      if (vibDepth) vibDepth.connect(o.detune);
      o.connect(hp);
      o.start(t);
      o.stop(stopAt);
    });
  }
}

export const musicEngine = new AdaptiveScoreEngine();
export { NEAR_ENEMY_RANGE };
export type { MusicContext, MusicPhase };
