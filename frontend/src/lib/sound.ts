/**
 * The LeiriTech sound system.
 *
 * Sounds are SYNTHESISED at runtime through the Web Audio API rather than
 * shipped as audio files. That keeps the bundle unchanged, and — more to
 * the point — lets every cue share one harmonic basis so two sounds firing
 * close together never clash.
 *
 * The design rules, in order of importance:
 *
 *  1. **Off by default.** This is business software. Nobody consented to
 *     noise by opening a work tool; sound is opt-in, in Settings.
 *  2. **Feedback, not decoration.** A cue fires because something actually
 *     happened — saved, completed, failed. Never on page load, never on
 *     hover, never to make the app feel "alive".
 *  3. **Quiet and short.** Every cue is under 400ms and peaks well below
 *     unity gain. A lowpass filter rolls off the top end so nothing is
 *     ever sharp through laptop speakers.
 *  4. **Adult.** Sine and triangle partials tuned to a pentatonic set
 *     (D–E–F#–A–B). No square-wave arcades, no cartoon slides.
 *
 * Browsers refuse to start audio before a user gesture, so the context is
 * created lazily on the first cue and resumed if it was suspended.
 */

export type SoundCue =
  | "click"
  | "navigate"
  | "open"
  | "close"
  | "success"
  | "taskComplete"
  | "notification"
  | "warning"
  | "error"
  | "timerStart"
  | "timerStop"
  | "proposalSent"
  | "projectComplete";

export const SOUND_ENABLED_KEY = "leiritech.sound.enabled";
export const SOUND_VOLUME_KEY = "leiritech.sound.volume";

/** Pentatonic on D — every cue draws from these, so nothing ever clashes. */
const N = {
  D3: 146.83,
  A3: 220.0,
  D4: 293.66,
  E4: 329.63,
  Fs4: 369.99,
  A4: 440.0,
  B4: 493.88,
  D5: 587.33,
  Fs5: 739.99,
  A5: 880.0,
} as const;

type Partial_ = {
  /** Hz */
  f: number;
  /** seconds from cue start */
  at: number;
  /** seconds */
  dur: number;
  /** relative level, 0..1 */
  gain?: number;
  type?: OscillatorType;
};

/**
 * Each cue is a tiny score. Rising intervals read as progress or success;
 * falling ones as dismissal; a flattened minor second as error.
 */
const SCORES: Record<SoundCue, Partial_[]> = {
  click: [{ f: N.D5, at: 0, dur: 0.045, gain: 0.35 }],
  navigate: [{ f: N.A4, at: 0, dur: 0.06, gain: 0.3 }],
  open: [
    { f: N.D4, at: 0, dur: 0.07, gain: 0.32 },
    { f: N.A4, at: 0.035, dur: 0.09, gain: 0.26 },
  ],
  close: [
    { f: N.A4, at: 0, dur: 0.06, gain: 0.28 },
    { f: N.D4, at: 0.03, dur: 0.08, gain: 0.22 },
  ],
  success: [
    { f: N.D4, at: 0, dur: 0.09, gain: 0.34 },
    { f: N.Fs4, at: 0.055, dur: 0.1, gain: 0.3 },
    { f: N.A4, at: 0.11, dur: 0.16, gain: 0.26 },
  ],
  taskComplete: [
    { f: N.A4, at: 0, dur: 0.07, gain: 0.34 },
    { f: N.D5, at: 0.05, dur: 0.14, gain: 0.28 },
  ],
  notification: [
    { f: N.Fs5, at: 0, dur: 0.07, gain: 0.24 },
    { f: N.D5, at: 0.07, dur: 0.11, gain: 0.2 },
  ],
  warning: [
    { f: N.E4, at: 0, dur: 0.1, gain: 0.3, type: "triangle" },
    { f: N.E4, at: 0.13, dur: 0.12, gain: 0.24, type: "triangle" },
  ],
  error: [
    { f: N.D4, at: 0, dur: 0.13, gain: 0.32, type: "triangle" },
    { f: 277.18 /* C#4 — a semitone under, deliberately sour */, at: 0.07, dur: 0.17, gain: 0.26, type: "triangle" },
  ],
  timerStart: [
    { f: N.D4, at: 0, dur: 0.06, gain: 0.3 },
    { f: N.A4, at: 0.045, dur: 0.08, gain: 0.24 },
  ],
  timerStop: [
    { f: N.A4, at: 0, dur: 0.06, gain: 0.3 },
    { f: N.D4, at: 0.045, dur: 0.1, gain: 0.24 },
  ],
  /* The two "moments" — a deal sent, a project delivered. Still quiet,
     but with enough of an arc to register as an event worth marking. */
  proposalSent: [
    { f: N.D4, at: 0, dur: 0.09, gain: 0.32 },
    { f: N.A4, at: 0.06, dur: 0.1, gain: 0.28 },
    { f: N.D5, at: 0.12, dur: 0.2, gain: 0.24 },
  ],
  projectComplete: [
    { f: N.D4, at: 0, dur: 0.1, gain: 0.3 },
    { f: N.Fs4, at: 0.07, dur: 0.11, gain: 0.28 },
    { f: N.A4, at: 0.14, dur: 0.12, gain: 0.26 },
    { f: N.D5, at: 0.21, dur: 0.26, gain: 0.22 },
    { f: N.A5, at: 0.21, dur: 0.26, gain: 0.08 },
  ],
};

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function ensureContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
    master = ctx.createGain();
    // A lowpass keeps every cue soft on laptop speakers — the difference
    // between "premium" and "notification from a 2009 web app".
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2600;
    lp.Q.value = 0.6;
    master.connect(lp).connect(ctx.destination);
    master.gain.value = 0.5;
    return ctx;
  } catch {
    return null;
  }
}

function readEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SOUND_ENABLED_KEY) === "true";
  } catch {
    return false; // private window, blocked storage — stay silent
  }
}

function readVolume(): number {
  if (typeof window === "undefined") return 0.5;
  try {
    const raw = window.localStorage.getItem(SOUND_VOLUME_KEY);
    const n = raw === null ? 0.5 : Number.parseFloat(raw);
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5;
  } catch {
    return 0.5;
  }
}

export function isSoundEnabled(): boolean {
  return readEnabled();
}

export function getSoundVolume(): number {
  return readVolume();
}

export function setSoundEnabled(on: boolean): void {
  try {
    window.localStorage.setItem(SOUND_ENABLED_KEY, String(on));
  } catch {
    /* storage blocked — the setting simply will not persist */
  }
  window.dispatchEvent(new CustomEvent("leiritech:sound-settings"));
}

export function setSoundVolume(v: number): void {
  const clamped = Math.min(1, Math.max(0, v));
  try {
    window.localStorage.setItem(SOUND_VOLUME_KEY, String(clamped));
  } catch {
    /* as above */
  }
  if (master) master.gain.value = clamped;
  window.dispatchEvent(new CustomEvent("leiritech:sound-settings"));
}

/**
 * Play a cue. A no-op when sound is off, when the browser has no Web Audio,
 * or on the server — callers never need to guard.
 */
export function playSound(cue: SoundCue): void {
  if (!readEnabled()) return;
  const audio = ensureContext();
  if (!audio || !master) return;
  // Autoplay policy: the context starts suspended until a gesture.
  if (audio.state === "suspended") void audio.resume().catch(() => {});

  master.gain.value = readVolume();
  const now = audio.currentTime;

  for (const p of SCORES[cue]) {
    const osc = audio.createOscillator();
    const g = audio.createGain();
    osc.type = p.type ?? "sine";
    osc.frequency.value = p.f;

    const start = now + p.at;
    const peak = (p.gain ?? 0.3) * 0.22; // headroom: cues stay well under unity
    // Fast attack, exponential decay — a struck tone, not a beep.
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, start + p.dur);

    osc.connect(g).connect(master);
    osc.start(start);
    osc.stop(start + p.dur + 0.02);
  }
}

/** Preview a cue regardless of the enabled flag — for the Settings control. */
export function previewSound(cue: SoundCue): void {
  const wasEnabled = readEnabled();
  if (!wasEnabled) {
    try {
      window.localStorage.setItem(SOUND_ENABLED_KEY, "true");
      playSound(cue);
      window.localStorage.setItem(SOUND_ENABLED_KEY, "false");
      return;
    } catch {
      return;
    }
  }
  playSound(cue);
}
