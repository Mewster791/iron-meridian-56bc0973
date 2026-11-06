/**
 * Unified Soundtrack Engine for Iron Meridian.
 *
 * Supports:
 *  - "Iron Crown Rising (Version 1)" — cinematic brass & orchestral score (audio file) [DEFAULT]
 *  - "Iron Crown Rising (Version 2)" — alternate atmospheric mix (audio file)
 *  - "Iron Bow, Broken Crown" — procedural string chamber score synthesized live via Web Audio
 *
 * Features live in-browser playback, seamless loop, track switching, and offline WAV render export
 * so players can download the original synthesized song or imported music files for offline listening.
 */

import {
  IRON_BOW,
  chordTones,
  locate,
  songDurationSec,
  type Articulation,
  type Chord,
  type Part,
  type ScoreNote,
  type SectionId,
  type Voice,
} from "./ironBowScore";

const MASTER_LEVEL = 0.55;
const MUTE_KEY = "iron-meridian:music-muted";
const TRACK_KEY = "iron-meridian:music-track";
const LOOKAHEAD_SEC = 0.15;

const midiHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

export type SoundtrackId = "iron-crown-1" | "iron-crown-2" | "iron-bow-original";

export interface SoundtrackTrack {
  id: SoundtrackId;
  title: string;
  artist: string;
  versionLabel: string;
  type: "file" | "procedural";
  fileUrl?: string;
  description: string;
}

export const SOUNDTRACK_TRACKS: SoundtrackTrack[] = [
  {
    id: "iron-crown-1",
    title: "Iron Crown Rising",
    versionLabel: "Version 1 (Orchestral Theme)",
    artist: "Iron Meridian Soundtrack",
    type: "file",
    fileUrl: "/assets/aistudio/Iron-Crown-Rising1_52046830.mp3",
    description: "Full cinematic arrangement with driving brass, percussion, and choral motifs",
  },
  {
    id: "iron-crown-2",
    title: "Iron Crown Rising",
    versionLabel: "Version 2 (Atmospheric Mix)",
    artist: "Iron Meridian Soundtrack",
    type: "file",
    fileUrl: "/assets/aistudio/Iron-Crown-Rising_2__bda0a63c.mp3",
    description: "Atmospheric mix with acoustic textures, cold hall resonance, and deep bass",
  },
  {
    id: "iron-bow-original",
    title: "Iron Bow, Broken Crown",
    versionLabel: "Original Procedural Score",
    artist: "Chamber String Ensemble",
    type: "procedural",
    description: "Procedural synthesis performing the through-composed chamber score",
  },
];

interface VoiceSpec {
  detunes: number[];
  highpass: number;
  lowpass: number;
  bodyHz: number;
  bodyGain: number;
  vibratoHz: number;
  vibratoCents: number;
  level: number;
  pan: number;
  reverbSend: number;
}

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
  trackId: SoundtrackId;
  playing: boolean;
  muted: boolean;
  section: SectionId;
  bar: number;
  bpm: number;
}

class UnifiedMusicEngine {
  private currentTrack: SoundtrackId = "iron-crown-1";
  private muted = false;
  private started = false;

  // File audio playback
  private audioEl: HTMLAudioElement | null = null;

  // Procedural Web Audio playback
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private reverb!: ConvolverNode;
  private buses!: Record<Voice, GainNode>;
  private noise!: AudioBuffer;
  private timer: number | null = null;
  private nextTime = 0;
  private step = 0;

  private listeners: Array<() => void> = [];

  constructor() {
    if (typeof window !== "undefined") {
      try {
        this.muted = window.localStorage.getItem(MUTE_KEY) === "1";
        const savedTrack = window.localStorage.getItem(TRACK_KEY) as SoundtrackId;
        if (savedTrack && SOUNDTRACK_TRACKS.some((t) => t.id === savedTrack)) {
          this.currentTrack = savedTrack;
        }
      } catch {
        /* storage unavailable */
      }
    }
  }

  public subscribe(cb: () => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  private notify(): void {
    for (const cb of this.listeners) cb();
  }

  public getTrack(): SoundtrackId {
    return this.currentTrack;
  }

  public setTrack(trackId: SoundtrackId): void {
    if (this.currentTrack === trackId) return;
    this.currentTrack = trackId;
    try {
      window.localStorage.setItem(TRACK_KEY, trackId);
    } catch {
      /* ignore */
    }

    if (this.started && !this.muted) {
      this.stopCurrent();
      this.playCurrent();
    } else {
      this.stopCurrent();
    }
    this.notify();
  }

  public start(): void {
    if (typeof window === "undefined") return;
    if (this.muted) return;
    this.started = true;
    this.playCurrent();
    this.notify();
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    try {
      window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch {
      /* ignore */
    }

    if (muted) {
      this.stopCurrent();
    } else {
      this.started = true;
      this.playCurrent();
    }
    this.notify();
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public getStatus(): MusicStatus {
    const track = SOUNDTRACK_TRACKS.find((t) => t.id === this.currentTrack) ?? SOUNDTRACK_TRACKS[0];
    const pos = locate(IRON_BOW, this.step);
    return {
      title: track.title,
      trackId: this.currentTrack,
      playing: this.started && !this.muted,
      muted: this.muted,
      section: this.currentTrack === "iron-bow-original" ? pos.section.id : "INTRO",
      bar: this.currentTrack === "iron-bow-original" ? pos.bar : 1,
      bpm: this.currentTrack === "iron-bow-original" ? Math.round(pos.bpm) : 104,
    };
  }

  private stopCurrent(): void {
    // Stop file audio
    if (this.audioEl) {
      this.audioEl.pause();
      this.audioEl.currentTime = 0;
    }
    // Stop procedural audio
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    if (this.ctx && this.master) {
      try {
        this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      } catch {
        /* ignore */
      }
    }
  }

  private playCurrent(): void {
    if (!this.started || this.muted) return;
    const track = SOUNDTRACK_TRACKS.find((t) => t.id === this.currentTrack) ?? SOUNDTRACK_TRACKS[0];

    if (track.type === "file" && track.fileUrl) {
      if (!this.audioEl) {
        this.audioEl = new Audio();
        this.audioEl.loop = true;
        this.audioEl.preload = "auto";
      }
      if (
        this.audioEl.src !== window.location.origin + track.fileUrl &&
        !this.audioEl.src.endsWith(track.fileUrl)
      ) {
        this.audioEl.src = track.fileUrl;
      }
      this.audioEl.volume = 0.58;
      this.audioEl.play().catch(() => {
        // Autoplay may be blocked until user gesture
      });
    } else {
      // Procedural synthesizer
      this.startProcedural();
    }
  }

  private startProcedural(): void {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.buildGraph(this.ctx);
      document.addEventListener("visibilitychange", this.onVisibility);
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    const now = this.ctx.currentTime;
    this.master.gain.setValueAtTime(0, now);
    this.master.gain.linearRampToValueAtTime(MASTER_LEVEL, now + 1.2);
    this.nextTime = now + 0.1;
    this.step = 0;
    if (this.timer === null) {
      this.timer = window.setInterval(this.tick, 25);
    }
  }

  private onVisibility = (): void => {
    if (document.hidden) {
      if (this.audioEl && !this.muted) this.audioEl.pause();
      if (this.ctx) this.ctx.suspend().catch(() => {});
    } else if (!this.muted && this.started) {
      if (this.currentTrack !== "iron-bow-original") {
        this.audioEl?.play().catch(() => {});
      } else if (this.ctx) {
        this.ctx.resume().catch(() => {});
        this.nextTime = this.ctx.currentTime + 0.1;
      }
    }
  };

  private buildGraph(ctx: BaseAudioContext): {
    master: GainNode;
    buses: Record<Voice, GainNode>;
    noise: AudioBuffer;
  } {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.015;
    comp.release.value = 0.3;
    comp.connect(ctx.destination);

    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(comp);

    const reverb = ctx.createConvolver();
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
    reverb.buffer = ir;
    const reverbReturn = ctx.createGain();
    reverbReturn.gain.value = 0.9;
    reverb.connect(reverbReturn);
    reverbReturn.connect(master);

    const bus = (voice: Voice): GainNode => {
      const spec = VOICES[voice];
      const g = ctx.createGain();
      g.gain.value = 1;
      const pan = (ctx as AudioContext).createStereoPanner
        ? (ctx as AudioContext).createStereoPanner()
        : null;
      if (pan) {
        pan.pan.value = spec.pan;
        g.connect(pan);
        pan.connect(master);
        const send = ctx.createGain();
        send.gain.value = spec.reverbSend;
        pan.connect(send);
        send.connect(reverb);
      } else {
        g.connect(master);
        const send = ctx.createGain();
        send.gain.value = spec.reverbSend;
        g.connect(send);
        send.connect(reverb);
      }
      return g;
    };
    const buses = { contrabass: bus("contrabass"), cello: bus("cello"), violin: bus("violin") };

    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    if (ctx === this.ctx) {
      this.master = master;
      this.reverb = reverb;
      this.buses = buses;
      this.noise = noise;
    }

    return { master, buses, noise };
  }

  private tick = (): void => {
    if (!this.ctx || this.muted || this.currentTrack !== "iron-bow-original") return;
    const now = this.ctx.currentTime;
    if (this.nextTime < now - 0.25) this.nextTime = now + 0.05;
    while (this.nextTime < now + LOOKAHEAD_SEC) {
      const sixteenth = 60 / locate(IRON_BOW, this.step).bpm / 4;
      this.scheduleStep(this.ctx, this.buses, this.noise, this.step, this.nextTime, sixteenth);
      this.nextTime += sixteenth;
      this.step = (this.step + 1) % IRON_BOW.totalSteps;
    }
  };

  private scheduleStep(
    ctx: BaseAudioContext,
    buses: Record<Voice, GainNode>,
    noise: AudioBuffer,
    step: number,
    t: number,
    sixteenth: number,
  ): void {
    const pos = locate(IRON_BOW, step);
    const notes = IRON_BOW.melodyByStep.get(step) ?? [];

    for (const n of notes) this.playMelody(ctx, buses, noise, n, t, sixteenth);

    for (const part of pos.section.parts) {
      this.playPart(ctx, buses, noise, part, {
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

  private playMelody(
    ctx: BaseAudioContext,
    buses: Record<Voice, GainNode>,
    noise: AudioBuffer,
    n: ScoreNote,
    t: number,
    sixteenth: number,
  ): void {
    const dur = n.dur * sixteenth;
    const len = n.articulation === "legato" ? dur * 1.04 : dur;
    const vel = (n.stressed ? 0.95 : 0.7) * n.velocity;
    this.bowed(ctx, buses, noise, t, n.midi, len, vel, n.voice, n.articulation);
  }

  private playPart(
    ctx: BaseAudioContext,
    buses: Record<Voice, GainNode>,
    noise: AudioBuffer,
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
    },
  ): void {
    const { t, s, bar, chord, dyn, sixteenth: x } = c;
    switch (part) {
      case "bassMarch": {
        if (s % 2 !== 0) return;
        const accent = s % 8 === 0 ? 1 : s % 4 === 0 ? 0.75 : 0.55;
        const m = s === 6 || s === 14 ? chord.root + 12 : chord.root;
        this.bowed(ctx, buses, noise, t, m, x * 1.2, accent * 0.85 * dyn, "contrabass", "staccato");
        return;
      }
      case "bassDrone":
        if (s === 0)
          this.bowed(ctx, buses, noise, t, chord.root, x * 16, 0.42 * dyn, "contrabass", "legato");
        return;
      case "bassHeartbeat":
        if (s === 0)
          this.bowed(
            ctx,
            buses,
            noise,
            t,
            chord.root,
            x * 2.2,
            0.85 * dyn + 0.2,
            "contrabass",
            "marcato",
          );
        if (s === 3)
          this.bowed(
            ctx,
            buses,
            noise,
            t,
            chord.root,
            x * 2,
            0.6 * dyn + 0.15,
            "contrabass",
            "marcato",
          );
        return;
      case "bassLong":
        if (s === 0) {
          this.bowed(ctx, buses, noise, t, chord.root, x * 16, 0.95 * dyn, "contrabass", "marcato");
          this.bowed(
            ctx,
            buses,
            noise,
            t,
            chord.root + 12,
            x * 16,
            0.5 * dyn,
            "contrabass",
            "marcato",
          );
        }
        return;
      case "celloCounter": {
        if (s % 4 !== 2) return;
        const tones = chordTones(chord, 43, 4);
        this.bowed(
          ctx,
          buses,
          noise,
          t,
          tones[(s >> 2) % 4],
          x * 1.6,
          0.55 * dyn,
          "cello",
          "marcato",
        );
        return;
      }
      case "celloChords": {
        if (s !== 0 && s !== 6 && s !== 8) return;
        const len = s === 0 ? 5 : s === 6 ? 1.6 : 6;
        const vel = (s === 0 ? 0.75 : 0.6) * dyn;
        for (const m of chordTones(chord, 45, 3))
          this.bowed(ctx, buses, noise, t, m, x * len, vel, "cello", "marcato");
        return;
      }
      case "celloJagged": {
        const hits = [0, 3, 6, 10, 12];
        const i = hits.indexOf(s);
        if (i < 0) return;
        const tones = chordTones(chord, 43, 3);
        this.bowed(
          ctx,
          buses,
          noise,
          t,
          tones[i % 2 === 0 ? 0 : 2],
          x * 1.4,
          (i === 0 ? 0.75 : 0.55) * dyn,
          "cello",
          "staccato",
        );
        return;
      }
      case "spiccato": {
        const v = chordTones(chord, 62, 3);
        this.bowed(
          ctx,
          buses,
          noise,
          t,
          v[[0, 1, 2, 1][s % 4]],
          x * 0.8,
          (s % 4 === 0 ? 0.5 : 0.34) * dyn,
          "violin",
          "spiccato",
        );
        if (s % 2 === 0)
          this.bowed(
            ctx,
            buses,
            noise,
            t,
            chord.root + 12,
            x * 0.8,
            0.4 * dyn,
            "cello",
            "spiccato",
          );
        return;
      }
      case "violinPiercing": {
        if (s !== 0 && s !== 8) return;
        const tones = chordTones(chord, 79, 3);
        this.bowed(
          ctx,
          buses,
          noise,
          t,
          tones[(bar + (s ? 1 : 0)) % 3],
          x * 6,
          0.5 * dyn,
          "violin",
          "marcato",
        );
        return;
      }
      case "feverRun": {
        const tones = chordTones(chord, 69 + bar * 3, 4);
        this.bowed(
          ctx,
          buses,
          noise,
          t,
          tones[s % 4],
          x * 0.8,
          (0.32 + bar * 0.08) * dyn,
          "violin",
          "spiccato",
        );
        return;
      }
      case "finalStabs": {
        for (const n of c.melodyHere) {
          if (!n.stressed && n.dur < 8) continue;
          const len = n.dur * x;
          const vel = Math.min(1, n.velocity);
          this.bowed(ctx, buses, noise, t, chord.root, len, vel, "contrabass", "marcato");
          this.bowed(
            ctx,
            buses,
            noise,
            t,
            chord.root + 12,
            len,
            vel * 0.6,
            "contrabass",
            "marcato",
          );
          for (const m of chordTones(chord, 45, 3))
            this.bowed(ctx, buses, noise, t, m, len, vel * 0.7, "cello", "marcato");
        }
        return;
      }
    }
  }

  private bowed(
    ctx: BaseAudioContext,
    buses: Record<Voice, GainNode>,
    noise: AudioBuffer,
    t: number,
    midi: number,
    dur: number,
    vel: number,
    voice: Voice,
    art: Articulation,
  ): void {
    if (vel <= 0.001 || dur <= 0) return;
    const spec = VOICES[voice];
    const f = midiHz(midi);

    let attack = 0.06;
    let release = 0.28;
    let len = dur;
    let accent = 1;
    switch (art) {
      case "legato":
        attack = voice === "contrabass" ? 0.1 : 0.08;
        release = 0.35;
        break;
      case "marcato":
        attack = 0.014;
        release = 0.22;
        accent = 1.35;
        break;
      case "staccato":
        attack = 0.008;
        release = 0.09;
        len = Math.min(dur, 0.13);
        break;
      case "spiccato":
        attack = 0.005;
        release = 0.06;
        len = Math.min(dur, 0.08);
        break;
      case "tremolo":
        attack = 0.05;
        release = 0.3;
        break;
    }
    const level = vel * spec.level;
    const sustainEnd = t + Math.max(attack, len - 0.02);
    const stopAt = sustainEnd + release + 0.05;

    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = spec.highpass;
    const body = ctx.createBiquadFilter();
    body.type = "peaking";
    body.frequency.value = spec.bodyHz;
    body.gain.value = spec.bodyGain;
    body.Q.value = 1;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 0.7;
    const bright = Math.min(spec.lowpass * (0.65 + vel * 0.5), 12000);
    lp.frequency.setValueAtTime(bright * (art === "legato" ? 0.7 : 1.15), t);
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
    if (art === "tremolo") {
      const trem = ctx.createGain();
      trem.gain.value = 0.55;
      const lfo = ctx.createOscillator();
      lfo.type = "triangle";
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
    out.connect(buses[voice]);

    let vibDepth: GainNode | null = null;
    if (len > 0.25 && art !== "staccato" && art !== "spiccato") {
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
      o.type = "sawtooth";
      o.frequency.value = f;
      o.detune.value = d + (Math.random() - 0.5) * 4;
      if (vibDepth) vibDepth.connect(o.detune);
      o.connect(hp);
      o.start(t);
      o.stop(stopAt);
    }

    if (art !== "legato" && art !== "tremolo") {
      const n = ctx.createBufferSource();
      n.buffer = noise;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = Math.min(f * 4, 6000);
      bp.Q.value = 1.4;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(level * 0.5 * accent, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      n.connect(bp);
      bp.connect(g);
      g.connect(buses[voice]);
      n.start(t, Math.random() * 1.5);
      n.stop(t + 0.08);
    }
  }

  /**
   * Renders the complete procedural "Iron Bow, Broken Crown" score into a 16-bit stereo PCM WAV Blob.
   * Can be downloaded immediately by the user.
   */
  public async renderOriginalScoreWav(): Promise<Blob> {
    const totalDuration = songDurationSec(IRON_BOW) + 4.5;
    const sampleRate = 44100;
    const totalSamples = Math.ceil(totalDuration * sampleRate);

    const offlineCtx = new OfflineAudioContext(2, totalSamples, sampleRate);
    const { master, buses, noise } = this.buildGraph(offlineCtx);

    // Schedule the full score from start to finish
    let schedTime = 0.1;
    master.gain.setValueAtTime(0, 0);
    master.gain.linearRampToValueAtTime(MASTER_LEVEL, 1.2);

    for (let s = 0; s < IRON_BOW.totalSteps; s++) {
      const sixteenth = 60 / locate(IRON_BOW, s).bpm / 4;
      this.scheduleStep(offlineCtx, buses, noise, s, schedTime, sixteenth);
      schedTime += sixteenth;
    }

    // Let the hall reverb decay into silence
    master.gain.setValueAtTime(MASTER_LEVEL, schedTime);
    master.gain.linearRampToValueAtTime(0.0001, schedTime + 3.8);

    const renderedBuffer = await offlineCtx.startRendering();
    return audioBufferToWav(renderedBuffer);
  }

  /**
   * Downloads the currently selected track or original score to the player's device.
   */
  public async downloadTrack(trackId: SoundtrackId): Promise<void> {
    const track = SOUNDTRACK_TRACKS.find((t) => t.id === trackId);
    if (!track) return;

    if (track.type === "file" && track.fileUrl) {
      const a = document.createElement("a");
      a.href = track.fileUrl;
      a.download = `${track.title.replace(/\s+/g, "_")}_${trackId === "iron-crown-1" ? "Version_1" : "Version_2"}.mp3`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else {
      // Export WAV from OfflineAudioContext
      const wavBlob = await this.renderOriginalScoreWav();
      const url = URL.createObjectURL(wavBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Iron_Bow_Broken_Crown_Original_Synthesizer_Score.wav";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
  }
}

function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const length = buffer.length;
  const dataSize = length * blockAlign;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;
  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");

  // fmt subchunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // SubChunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // ByteRate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);

  // data subchunk
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  // Write 16-bit interleaved PCM samples
  let offset = 44;
  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < numChannels; c++) {
      let sample = channels[c][i];
      sample = Math.max(-1, Math.min(1, sample));
      const s = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, s, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

export const musicEngine = new UnifiedMusicEngine();
