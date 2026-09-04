// Web Audio implementation of CuePlayer. Every cue is synthesized on the fly with an
// OscillatorNode + GainNode — no audio files, so this is dependency-free and works offline.
// Each tone's gain is ramped up and back down (rather than switched on/off instantly), which is
// what keeps a short beep from producing an audible click at its edges.
//
// This file is intentionally thin and untested: it needs a real AudioContext to do anything
// meaningful, which isn't available in the Vitest (Node) environment. All the logic worth
// testing — which cue an event maps to, and whether a batch of cues should be suppressed as
// stale — lives in AudioBridge.ts instead, as pure functions over a fake CuePlayer.

import { PhaseType } from '../model';
import { CuePlayer, CueType } from './CuePlayer';

/** Ramp time at the start/end of every tone, in seconds. Long enough to kill clicks, short
 *  enough to be inaudible as a fade on beeps this short. */
const RAMP_SECONDS = 0.006;

/** phase-start's pitch is the whole point of this audio channel: it should be tellable apart by
 *  ear, without looking at the screen, which of run/walk/sprint/rest is starting. */
const PHASE_START_FREQUENCY_HZ: Record<PhaseType, number> = {
  sprint: 1318.51, // E6 — highest, "go hard"
  run: 880, // A5
  walk: 440, // A4
  rest: 220, // A3 — lowest, "stand down"
};

/** phase-end coincides with the very next phase-start (they're the same instant) — stacking two
 *  tones there is just noise, and phase-start is the cue that actually matters for orientation.
 *  Left wired up and easy to flip on (e.g. for a rest-only "phase-end" chime) if that changes. */
const PHASE_END_ENABLED = false;

/** A warning at this many seconds remaining, or more, is just a heads-up (single beep). Anything
 *  closer than that is the more urgent "closing in" cue (double beep). */
const WARNING_SINGLE_BEEP_MIN_SECONDS = 10;

export class WebCuePlayer implements CuePlayer {
  private ctx: AudioContext | null = null;
  private muted = false;

  unlock(): Promise<void> | void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === 'suspended') {
      return this.ctx.resume();
    }
  }

  play(cue: CueType, opts?: { phaseType?: PhaseType; secondsRemaining?: number }): void {
    if (this.muted || !this.ctx) return; // not unlocked yet, or muted — silently no-op
    const ctx = this.ctx;
    const t0 = ctx.currentTime;

    switch (cue) {
      case 'countdown':
        this.tone(t0, 1000, 0.07, 0.25, 'sine');
        break;

      case 'phase-start': {
        const frequency = PHASE_START_FREQUENCY_HZ[opts?.phaseType ?? 'run'];
        this.tone(t0, frequency, 0.2, 0.3, 'triangle');
        break;
      }

      case 'warning':
        // Both use the same 650Hz pitch — deliberately different from phase-start's tone, so the
        // two are never confused by ear — but a farther-out warning is a single beep (a heads-up)
        // and a closer one doubles up (more urgent, "it's almost time").
        this.tone(t0, 650, 0.09, 0.25, 'sine');
        if ((opts?.secondsRemaining ?? 0) < WARNING_SINGLE_BEEP_MIN_SECONDS) {
          this.tone(t0 + 0.15, 650, 0.09, 0.25, 'sine');
        }
        break;

      case 'phase-end':
        if (PHASE_END_ENABLED) this.tone(t0, 330, 0.08, 0.15, 'sine');
        break;

      case 'complete':
        // A short ascending flourish: three notes, each starting as the previous decays.
        this.tone(t0, 523.25, 0.15, 0.28, 'triangle'); // C5
        this.tone(t0 + 0.14, 659.25, 0.15, 0.28, 'triangle'); // E5
        this.tone(t0 + 0.28, 783.99, 0.3, 0.3, 'triangle'); // G5
        break;
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  dispose(): void {
    this.ctx?.close();
    this.ctx = null;
  }

  /** Schedules one ramped tone on the shared AudioContext, starting at `startTime`. */
  private tone(
    startTime: number,
    frequencyHz: number,
    durationSeconds: number,
    peakGain: number,
    type: OscillatorType,
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequencyHz, startTime);

    const rampEnd = startTime + durationSeconds;
    const sustainEnd = Math.max(startTime + RAMP_SECONDS, rampEnd - RAMP_SECONDS);
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(peakGain, startTime + RAMP_SECONDS);
    gain.gain.setValueAtTime(peakGain, sustainEnd);
    gain.gain.linearRampToValueAtTime(0, rampEnd);

    osc.connect(gain).connect(ctx.destination);
    osc.start(startTime);
    osc.stop(rampEnd + 0.02);
  }
}
