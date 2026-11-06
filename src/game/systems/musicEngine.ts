/**
 * Plays "Iron Bow, Broken Crown" — the single Iron Meridian soundtrack.
 *
 * Fully procedural Web Audio (no audio files): a contrabass, a cello and a
 * violin section synthesised from bowed-string voices in a cold concert hall.
 * The score itself (melody, chords, tempo, dynamics, accompaniment figures)
 * lives in ironBowScore.ts; this engine only performs it.
 *
 * The song is the same everywhere — home screen, map, missions, debriefs. It
 * never reacts to enemies, gunfire or menus: it plays from the intro to the
 * final chord, rests for the tail, then starts again from the top.
 */

import {
  IRON_BOW,
  chordTones,
  locate,
  type Articulation,
  type Chord,
  type Part,
  type ScoreNote,
  type SectionId,
  type Voice,
} from './ironBowScore';

const MASTER_LEVEL = 0.4;
const MUTE_KEY = 'iron-meridian:music-muted';
const LOOKAHEAD_SEC = 0.15;

const midiHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

interface VoiceSpec {
  /** Detune (cents) of each sawtooth in the section. */
  detunes: number[];
  highpass: number;
  lowpass: number;
  /** Body resonance. */
  bodyHz: number;
  bodyGain: number;
  vibratoHz: number;
  vibratoCents: number;
  level: number;
  pan: number;
  reverbSend: number;
}

/** Orchestral seating: violins left, cello centre-right, contrabass right. */
const VOICES: Record<Voice, VoiceSpec> = {
  contrabass: {
    detunes: [-7, 6],
    highpass: 28,
    lowpass: 900,
    bodyHz: 110,
    bodyGain: 6,
    vibratoHz: 4.6,
    vibratoCents: 6,
    level: 0.2,
    pan: 0.35,
    reverbSend: 0.22,
  },
  cello: {
    detunes: [-9, 0, 8],
    highpass: 60,
    lowpass: 2600,
    bodyHz: 260,
    bodyGain: 5,
    vibratoHz: 5.2,
    vibratoCents: 11,
    level: 0.13,
    pan: 0.15,
    reverbSend: 0.34,
  },
  violin: {
    detunes: [-12, -3, 5, 13],
    highpass: 220,
    lowpass: 6400,
    bodyHz: 2900,
    bodyGain: 6,
    vibratoHz: 5.8,
    vibratoCents: 13,
    level: 0.085,
    pan: -0.35,
    reverbSend: 0.42,
  },
};

export interface MusicStatus {
  title: string;
  playing: boolean;
  muted: boolean;
  section: SectionId;
  bar: number;
  bpm: number;
}

class IronBowEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private reverb!: ConvolverNode;
  private buses!: Record<Voice, GainNode>;
  private noise!: AudioBuffer;

  private muted = false;
  private started = false;
  private timer: number | null = null;
  private nextTime = 0;
  private step = 0;

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
      this.master.gain.linearRampToValueAtTime(MASTER_LEVEL, now + 1.5);
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

  /** Where the song is right now (used by the dev hook / tests in the browser). */
  public getStatus(): MusicStatus {
    const pos = locate(IRON_BOW, this.step);
    return {
      title: IRON_BOW.title,
      playing: this.started && !this.muted,
      muted: this.muted,
      section: pos.section.id,
      bar: pos.bar,
      bpm: Math.round(pos.bpm),
    };
  }

  // ---- graph -------------------------------------------------------------

  private buildGraph(): void {
    const ctx = this.ctx!;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.015;
    comp.release.value = 0.3;
    comp.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(comp);

    // Large, cold stone hall: 4.5 s stereo tail that darkens as it decays.
    this.reverb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 4.5);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const tNorm = i / len;
        const smoothing = 0.2 + tNorm * 0.68;
        lp = lp * smoothing + (Math.random() * 2 - 1) * (1 - smoothing);
        d[i] = lp * Math.pow(1 - tNorm, 3);
      }
    }
    this.reverb.buffer = ir;
    const reverbReturn = ctx.createGain();
    reverbReturn.gain.value = 0.9;
    this.reverb.connect(reverbReturn);
    reverbReturn.connect(this.master);

    const bus = (voice: Voice): GainNode => {
      const spec = VOICES[voice];
      const g = ctx.createGain();
      g.gain.value = 1;
      const pan = ctx.createStereoPanner();
      pan.pan.value = spec.pan;
      g.connect(pan);
      pan.connect(this.master);
      const send = ctx.createGain();
      send.gain.value = spec.reverbSend;
      pan.connect(send);
      send.connect(this.reverb);
      return g;
    };
    this.buses = { contrabass: bus('contrabass'), cello: bus('cello'), violin: bus('violin') };

    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  }

  private onVisibility = (): void => {
    if (!this.ctx) return;
    if (document.hidden) this.ctx.suspend().catch(() => {});
    else if (!this.muted && this.started) {
      this.ctx.resume().catch(() => {});
      this.nextTime = this.ctx.currentTime + 0.1;
    }
  };

  // ---- sequencing ----------------------------------------------------------

  private tick = (): void => {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    if (this.nextTime < now - 0.25) this.nextTime = now + 0.05; // recovered from a stall
    while (this.nextTime < now + LOOKAHEAD_SEC) {
      const sixteenth = 60 / locate(IRON_BOW, this.step).bpm / 4;
      this.scheduleStep(this.step, this.nextTime, sixteenth);
      this.nextTime += sixteenth;
      this.step = (this.step + 1) % IRON_BOW.totalSteps;
    }
  };

  private scheduleStep(step: number, t: number, sixteenth: number): void {
    const pos = locate(IRON_BOW, step);
    const notes = IRON_BOW.melodyByStep.get(step) ?? [];

    for (const n of notes) this.playMelody(n, t, sixteenth);

    for (const part of pos.section.parts) {
      this.playPart(part, {
        t,
        s: pos.stepInBar,
        bar: pos.bar,
        rel: pos.rel,
        chord: pos.chord,
        dyn: pos.dynamics,
        sixteenth,
        melodyHere: notes.filter((n) => !n.doubled),
      });
    }
  }

  private playMelody(n: ScoreNote, t: number, sixteenth: number): void {
    const dur = n.dur * sixteenth;
    // A legato line overlaps slightly into the next note, like a bow change.
    const len = n.articulation === 'legato' ? dur * 1.04 : dur;
    const vel = (n.stressed ? 0.95 : 0.7) * n.velocity;
    this.bowed(t, n.midi, len, vel, n.voice, n.articulation);
  }

  private playPart(
    part: Part,
    c: {
      t: number;
      s: number;
      bar: number;
      rel: number;
      chord: Chord;
      dyn: number;
      sixteenth: number;
      melodyHere: ScoreNote[];
    }
  ): void {
    const { t, s, bar, chord, dyn, sixteenth: x } = c;
    switch (part) {
      // Marching boots in the mud: driving staccato eighths, accents on the beat.
      case 'bassMarch': {
        if (s % 2 !== 0) return;
        const accent = s % 8 === 0 ? 1 : s % 4 === 0 ? 0.75 : 0.55;
        const m = s === 6 || s === 14 ? chord.root + 12 : chord.root;
        this.bowed(t, m, x * 1.2, accent * 0.85 * dyn, 'contrabass', 'staccato');
        return;
      }
      case 'bassDrone':
        if (s === 0) this.bowed(t, chord.root, x * 16, 0.42 * dyn, 'contrabass', 'legato');
        return;
      // Bridge: a low lub-dub heartbeat.
      case 'bassHeartbeat':
        if (s === 0) this.bowed(t, chord.root, x * 2.2, 0.85 * dyn + 0.2, 'contrabass', 'marcato');
        if (s === 3) this.bowed(t, chord.root, x * 2, 0.6 * dyn + 0.15, 'contrabass', 'marcato');
        return;
      // Chorus: thunderous long bowed roots.
      case 'bassLong':
        if (s === 0) {
          this.bowed(t, chord.root, x * 16, 0.95 * dyn, 'contrabass', 'marcato');
          this.bowed(t, chord.root + 12, x * 16, 0.5 * dyn, 'contrabass', 'marcato');
        }
        return;
      // Verse 1b: sharp, urgent cello counter-line on the off-beats.
      case 'celloCounter': {
        if (s % 4 !== 2) return;
        const tones = chordTones(chord, 43, 4);
        this.bowed(t, tones[(s >> 2) % 4], x * 1.6, 0.55 * dyn, 'cello', 'marcato');
        return;
      }
      // Chorus: heavy chord stabs — DUM . . . . . DUM . DUM . . . . . . .
      case 'celloChords': {
        if (s !== 0 && s !== 6 && s !== 8) return;
        const len = s === 0 ? 5 : s === 6 ? 1.6 : 6;
        const vel = (s === 0 ? 0.75 : 0.6) * dyn;
        for (const m of chordTones(chord, 45, 3)) this.bowed(t, m, x * len, vel, 'cello', 'marcato');
        return;
      }
      // Verse 2: syncopated, jagged cello rhythm.
      case 'celloJagged': {
        const hits = [0, 3, 6, 10, 12];
        const i = hits.indexOf(s);
        if (i < 0) return;
        const tones = chordTones(chord, 43, 3);
        this.bowed(t, tones[i % 2 === 0 ? 0 : 2], x * 1.4, (i === 0 ? 0.75 : 0.55) * dyn, 'cello', 'staccato');
        return;
      }
      // Fast driving spiccato in violins and cellos.
      case 'spiccato': {
        const v = chordTones(chord, 62, 3);
        this.bowed(t, v[[0, 1, 2, 1][s % 4]], x * 0.8, (s % 4 === 0 ? 0.5 : 0.34) * dyn, 'violin', 'spiccato');
        if (s % 2 === 0) this.bowed(t, chord.root + 12, x * 0.8, 0.4 * dyn, 'cello', 'spiccato');
        return;
      }
      // Verse 2b: sharp, tragic high violin notes.
      case 'violinPiercing': {
        if (s !== 0 && s !== 8) return;
        const tones = chordTones(chord, 79, 3);
        this.bowed(t, tones[(bar + (s ? 1 : 0)) % 3], x * 6, 0.5 * dyn, 'violin', 'marcato');
        return;
      }
      // Outro: violins climbing to a fever pitch, one chord tone higher every bar.
      case 'feverRun': {
        const tones = chordTones(chord, 69 + bar * 3, 4);
        this.bowed(t, tones[s % 4], x * 0.8, (0.32 + bar * 0.08) * dyn, 'violin', 'spiccato');
        return;
      }
      // Outro: a heavy chord under every word, then the massive final chord under "US".
      case 'finalStabs': {
        for (const n of c.melodyHere) {
          if (!n.stressed && n.dur < 8) continue;
          const len = n.dur * x;
          const vel = Math.min(1, n.velocity);
          this.bowed(t, chord.root, len, vel, 'contrabass', 'marcato');
          this.bowed(t, chord.root + 12, len, vel * 0.6, 'contrabass', 'marcato');
          for (const m of chordTones(chord, 45, 3)) this.bowed(t, m, len, vel * 0.7, 'cello', 'marcato');
        }
        return;
      }
    }
  }

  // ---- instruments ---------------------------------------------------------

  /** One bowed note on a string section: detuned saws, body resonance, vibrato, bow noise. */
  private bowed(t: number, midi: number, dur: number, vel: number, voice: Voice, art: Articulation): void {
    if (vel <= 0.001 || dur <= 0) return;
    const ctx = this.ctx!;
    const spec = VOICES[voice];
    const f = midiHz(midi);

    let attack = 0.06;
    let release = 0.28;
    let len = dur;
    let accent = 1;
    switch (art) {
      case 'legato':
        attack = voice === 'contrabass' ? 0.1 : 0.08;
        release = 0.35;
        break;
      case 'marcato':
        attack = 0.014;
        release = 0.22;
        accent = 1.35;
        break;
      case 'staccato':
        attack = 0.008;
        release = 0.09;
        len = Math.min(dur, 0.13);
        break;
      case 'spiccato':
        attack = 0.005;
        release = 0.06;
        len = Math.min(dur, 0.08);
        break;
      case 'tremolo':
        attack = 0.05;
        release = 0.3;
        break;
    }
    const level = vel * spec.level;
    const sustainEnd = t + Math.max(attack, len - 0.02);
    const stopAt = sustainEnd + release + 0.05;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = spec.highpass;
    const body = ctx.createBiquadFilter();
    body.type = 'peaking';
    body.frequency.value = spec.bodyHz;
    body.gain.value = spec.bodyGain;
    body.Q.value = 1;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.7;
    // Brighter at the start of the stroke, mellowing as the bow settles.
    const bright = Math.min(spec.lowpass * (0.65 + vel * 0.5), 12000);
    lp.frequency.setValueAtTime(bright * (art === 'legato' ? 0.7 : 1.15), t);
    lp.frequency.setTargetAtTime(bright, t + attack, 0.08);

    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    if (accent > 1) {
      amp.gain.linearRampToValueAtTime(level * accent, t + attack);
      amp.gain.setTargetAtTime(level * 0.78, t + attack, 0.09);
    } else {
      amp.gain.linearRampToValueAtTime(level, t + attack);
    }
    amp.gain.setValueAtTime(accent > 1 ? level * 0.78 : level, sustainEnd);
    amp.gain.exponentialRampToValueAtTime(0.0001, sustainEnd + release);

    hp.connect(body);
    body.connect(lp);
    lp.connect(amp);

    let out: AudioNode = amp;
    if (art === 'tremolo') {
      // Fast bow tremolo: amplitude chopped at ~13 Hz.
      const trem = ctx.createGain();
      trem.gain.value = 0.55;
      const lfo = ctx.createOscillator();
      lfo.type = 'triangle';
      lfo.frequency.value = 13;
      const depth = ctx.createGain();
      depth.gain.value = 0.45;
      lfo.connect(depth);
      depth.connect(trem.gain);
      lfo.start(t);
      lfo.stop(stopAt);
      amp.connect(trem);
      out = trem;
    }
    out.connect(this.buses[voice]);

    // Vibrato blooms in on held notes only.
    let vibDepth: GainNode | null = null;
    if (len > 0.25 && art !== 'staccato' && art !== 'spiccato') {
      const vib = ctx.createOscillator();
      vib.frequency.value = spec.vibratoHz * (0.94 + Math.random() * 0.12);
      vibDepth = ctx.createGain();
      vibDepth.gain.setValueAtTime(0, t);
      vibDepth.gain.linearRampToValueAtTime(spec.vibratoCents, t + Math.min(0.45, len * 0.6));
      vib.connect(vibDepth);
      vib.start(t);
      vib.stop(stopAt);
    }
    for (const d of spec.detunes) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = d + (Math.random() - 0.5) * 4;
      if (vibDepth) vibDepth.connect(o.detune);
      o.connect(hp);
      o.start(t);
      o.stop(stopAt);
    }

    // Rosin "bite" of the bow on attacked notes.
    if (art !== 'legato' && art !== 'tremolo') {
      const n = ctx.createBufferSource();
      n.buffer = this.noise;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = Math.min(f * 4, 6000);
      bp.Q.value = 1.4;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(level * 0.5 * accent, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      n.connect(bp);
      bp.connect(g);
      g.connect(this.buses[voice]);
      n.start(t, Math.random() * 1.5);
      n.stop(t + 0.08);
    }
  }
}

export const musicEngine = new IronBowEngine();
