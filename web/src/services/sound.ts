/**
 * Sound effects, synthesized at runtime with the Web Audio API.
 *
 * There are no audio files: every cue is a few oscillators and noise
 * bursts shaped by envelopes, so there is nothing to license, download,
 * or cache. Settings live in localStorage (per browser, not in the save).
 */
import { cueReady, type SoundCue } from '../ui/soundCues';

export interface SoundSettings {
    enabled: boolean;
    /** 0..1 master volume. */
    volume: number;
}

const SETTINGS_KEY = 'rpg_loom_sound_v1';
const DEFAULTS: SoundSettings = { enabled: true, volume: 0.5 };

let settings: SoundSettings = loadSettings();
const listeners = new Set<(s: SoundSettings) => void>();

function loadSettings(): SoundSettings {
    try {
        const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(SETTINGS_KEY) : null;
        if (!raw) return { ...DEFAULTS };
        const parsed = JSON.parse(raw);
        return {
            enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULTS.enabled,
            volume: typeof parsed.volume === 'number' ? Math.min(1, Math.max(0, parsed.volume)) : DEFAULTS.volume,
        };
    } catch {
        return { ...DEFAULTS };
    }
}

export function getSoundSettings(): SoundSettings {
    return settings;
}

export function setSoundSettings(patch: Partial<SoundSettings>): void {
    settings = { ...settings, ...patch };
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch { /* storage full or blocked: keep the in-memory value */ }
    if (master && ctx) master.gain.setTargetAtTime(settings.volume, ctx.currentTime, 0.02);
    listeners.forEach(fn => fn(settings));
}

export function onSoundSettingsChange(fn: (s: SoundSettings) => void): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
}

// ---- Audio graph ----

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

function getContext(): AudioContext | null {
    if (ctx) return ctx;
    const Ctor = typeof window !== 'undefined'
        ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
        : undefined;
    if (!Ctor) return null;
    try {
        ctx = new Ctor();
    } catch {
        return null;
    }
    master = ctx.createGain();
    master.gain.value = settings.volume;
    // Gentle limiter so overlapping cues never clip.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 6;
    master.connect(comp).connect(ctx.destination);
    return ctx;
}

/**
 * Browsers keep audio suspended until a user gesture. Call once at startup;
 * the first click/keypress anywhere resumes the context.
 */
export function installAudioUnlock(): () => void {
    const unlock = () => {
        if (!settings.enabled) return;
        const c = getContext();
        if (c && c.state === 'suspended') void c.resume();
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    return () => {
        window.removeEventListener('pointerdown', unlock, true);
        window.removeEventListener('keydown', unlock, true);
    };
}

function noise(c: AudioContext): AudioBuffer {
    if (noiseBuffer) return noiseBuffer;
    const len = Math.floor(c.sampleRate * 0.5);
    noiseBuffer = c.createBuffer(1, len, c.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    // Fixed LCG so the texture is the same every session (and no Math.random).
    let seed = 0x2f6b1d;
    for (let i = 0; i < len; i++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        data[i] = seed / 0x80000000 - 1;
    }
    return noiseBuffer;
}

interface Tone {
    freq: number;
    /** Glide to this frequency over the note. */
    to?: number;
    type?: OscillatorType;
    start?: number;
    dur: number;
    gain?: number;
}

function tone(c: AudioContext, t0: number, n: Tone) {
    const osc = c.createOscillator();
    const g = c.createGain();
    const start = t0 + (n.start ?? 0);
    const peak = n.gain ?? 0.3;
    osc.type = n.type ?? 'sine';
    osc.frequency.setValueAtTime(n.freq, start);
    if (n.to) osc.frequency.exponentialRampToValueAtTime(n.to, start + n.dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, start + n.dur);
    osc.connect(g).connect(master!);
    osc.start(start);
    osc.stop(start + n.dur + 0.02);
}

interface Burst {
    start?: number;
    dur: number;
    gain?: number;
    filter: BiquadFilterType;
    freq: number;
    to?: number;
}

function burst(c: AudioContext, t0: number, b: Burst) {
    const src = c.createBufferSource();
    src.buffer = noise(c);
    const f = c.createBiquadFilter();
    const g = c.createGain();
    const start = t0 + (b.start ?? 0);
    f.type = b.filter;
    f.frequency.setValueAtTime(b.freq, start);
    if (b.to) f.frequency.exponentialRampToValueAtTime(b.to, start + b.dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(b.gain ?? 0.3, start + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, start + b.dur);
    src.connect(f).connect(g).connect(master!);
    src.start(start);
    src.stop(start + b.dur + 0.02);
}

// Pitches (Hz) for a D-dorian-ish palette that suits the woodcut look.
const D4 = 293.66, E4 = 329.63, F4 = 349.23, G4 = 392.0, A4 = 440.0, C5 = 523.25, D5 = 587.33, F5 = 698.46, A5 = 880.0;

const VOICES: Record<SoundCue, (c: AudioContext, t: number) => void> = {
    hit: (c, t) => {
        burst(c, t, { dur: 0.09, gain: 0.22, filter: 'bandpass', freq: 1800, to: 600 });
        tone(c, t, { freq: 160, to: 80, type: 'triangle', dur: 0.08, gain: 0.18 });
    },
    encounter: (c, t) => {
        // Steel drawn from a scabbard.
        burst(c, t, { dur: 0.35, gain: 0.16, filter: 'highpass', freq: 2500, to: 6000 });
        tone(c, t, { freq: 1240, type: 'triangle', start: 0.12, dur: 0.3, gain: 0.05 });
    },
    victory: (c, t) => {
        tone(c, t, { freq: D4, type: 'triangle', dur: 0.18, gain: 0.22 });
        tone(c, t, { freq: A4, type: 'triangle', start: 0.09, dur: 0.18, gain: 0.22 });
        tone(c, t, { freq: D5, type: 'triangle', start: 0.18, dur: 0.4, gain: 0.24 });
    },
    defeat: (c, t) => {
        tone(c, t, { freq: A4, to: F4, type: 'sawtooth', dur: 0.35, gain: 0.08 });
        tone(c, t, { freq: F4, to: D4 * 0.75, type: 'sawtooth', start: 0.28, dur: 0.7, gain: 0.08 });
        burst(c, t, { dur: 0.25, gain: 0.12, filter: 'lowpass', freq: 400 });
    },
    loot: (c, t) => {
        // Soft pouch rustle + a small pluck.
        burst(c, t, { dur: 0.08, gain: 0.08, filter: 'bandpass', freq: 3000 });
        tone(c, t, { freq: G4, type: 'triangle', start: 0.03, dur: 0.15, gain: 0.12 });
        tone(c, t, { freq: D5, type: 'triangle', start: 0.08, dur: 0.18, gain: 0.08 });
    },
    coin: (c, t) => {
        tone(c, t, { freq: 1975, type: 'square', dur: 0.07, gain: 0.05 });
        tone(c, t, { freq: 2637, type: 'square', start: 0.06, dur: 0.22, gain: 0.05 });
    },
    questAccept: (c, t) => {
        // Parchment unrolled.
        burst(c, t, { dur: 0.22, gain: 0.1, filter: 'bandpass', freq: 1200, to: 2600 });
        tone(c, t, { freq: E4, type: 'sine', start: 0.08, dur: 0.3, gain: 0.14 });
    },
    questReady: (c, t) => {
        tone(c, t, { freq: A4, type: 'sine', dur: 0.25, gain: 0.18 });
        tone(c, t, { freq: D5, type: 'sine', start: 0.12, dur: 0.4, gain: 0.18 });
    },
    questComplete: (c, t) => {
        [D4, F4, A4, D5].forEach((f, i) => tone(c, t, { freq: f, type: 'triangle', start: i * 0.08, dur: 0.6 - i * 0.05, gain: 0.16 }));
        tone(c, t, { freq: A5, type: 'sine', start: 0.32, dur: 0.6, gain: 0.08 });
    },
    levelUp: (c, t) => {
        [D4, G4, C5, F5].forEach((f, i) => tone(c, t, { freq: f, type: 'triangle', start: i * 0.09, dur: 0.45, gain: 0.17 }));
        tone(c, t, { freq: A5, type: 'sine', start: 0.36, dur: 0.9, gain: 0.12 });
        burst(c, t, { start: 0.36, dur: 0.6, gain: 0.05, filter: 'highpass', freq: 6000 });
    },
    error: (c, t) => {
        tone(c, t, { freq: 180, type: 'square', dur: 0.09, gain: 0.05 });
        tone(c, t, { freq: 150, type: 'square', start: 0.1, dur: 0.12, gain: 0.05 });
    },
};

const lastPlayedAt: Partial<Record<SoundCue, number>> = {};

/** Play a cue if sound is on, the context is unlocked, and its cooldown has passed. */
export function playCue(cue: SoundCue): void {
    if (!settings.enabled || settings.volume <= 0) return;
    const c = getContext();
    if (!c || c.state !== 'running' || !master) return;
    const now = performance.now();
    if (!cueReady(cue, now, lastPlayedAt)) return;
    lastPlayedAt[cue] = now;
    try {
        VOICES[cue](c, c.currentTime + 0.01);
    } catch (e) {
        console.warn('Sound cue failed', cue, e);
    }
}

/** Preview from Settings: bypasses cooldowns and unlocks the context (it runs in a click). */
export function previewCue(cue: SoundCue): void {
    const c = getContext();
    if (!c || !master) return;
    if (c.state === 'suspended') void c.resume();
    VOICES[cue](c, c.currentTime + 0.03);
}
