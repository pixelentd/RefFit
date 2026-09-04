// The glue between the engine and a CuePlayer. The decision logic here — which cue an event maps
// to, and whether a batch of cues is too stale to bother playing — is written as plain functions
// of plain data, so it's unit-tested with a recording fake CuePlayer and no real audio, DOM, or
// timers involved. The class wrapping them adds exactly two impure things: tracking wall-clock
// time between notifications, and wiring up the browser bits (user-gesture unlock, resuming on
// visibilitychange) that a real CuePlayer needs but a test never does.

import { EngineEvent, EngineResult, IntervalEngine } from '../engine';
import { PhaseType } from '../model';
import { CuePlayer, CueType } from './CuePlayer';

/** A jump bigger than this between two consecutive notifications means rAF stalled — most likely
 *  the tab/app was backgrounded — rather than a normal frame (~16ms). See decideCues() below. */
export const STALE_BATCH_THRESHOLD_MS = 1000;

export interface CueDecision {
  cue: CueType;
  phaseType?: PhaseType;
  /** Carried for 'warning', so WebCuePlayer can pick a single vs. double beep by how far out it is. */
  secondsRemaining?: number;
}

/** Pure: which cue (if any) one engine event maps to. `null` means "no sound for this" — that's
 *  true of preroll-start (silent lead-in, only its countdown ticks make noise) and paused/resumed
 *  (state changes the on-screen UI already shows; not worth a cue of their own). */
export function cueForEvent(event: EngineEvent): CueDecision | null {
  switch (event.type) {
    case 'countdown': return { cue: 'countdown' };
    case 'phase-start': return { cue: 'phase-start', phaseType: event.phase.type };
    case 'warning-cue': return { cue: 'warning', secondsRemaining: event.secondsRemaining };
    case 'phase-end': return { cue: 'phase-end' };
    case 'workout-complete': return { cue: 'complete' };
    case 'preroll-start':
    case 'paused':
    case 'resumed':
      return null;
  }
}

/**
 * Pure: which cues (if any) should actually play for one batch of events, given how many
 * wall-clock ms elapsed since the previous batch.
 *
 * A normal tick is one rAF frame apart (~16ms) and carries zero or one event. A backgrounded tab
 * stalls rAF entirely; when it resumes, the engine's next tick() correctly fires every event it
 * missed in one go (see IntervalEngine's tick() docs — that's documented, correct behavior on its
 * end). Playing that whole burst back-to-back would just be a noise spike, so past the threshold
 * we drop the batch — except we still play the single most-recent phase-start, if there is one,
 * so a beep still tells you what phase you actually landed in rather than going silent entirely.
 */
export function decideCues(events: EngineEvent[], deltaMs: number): CueDecision[] {
  if (deltaMs > STALE_BATCH_THRESHOLD_MS) {
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i];
      if (event.type === 'phase-start') return [{ cue: 'phase-start', phaseType: event.phase.type }];
    }
    return [];
  }

  const decisions: CueDecision[] = [];
  for (const event of events) {
    const decision = cueForEvent(event);
    if (decision) decisions.push(decision);
  }
  return decisions;
}

export class AudioBridge {
  private lastNotifyAt: number | null = null;
  private visibilityHandlerAttached = false;

  private readonly handleVisibilityChange = () => {
    // The AudioContext auto-suspends when backgrounded; re-arm it once we're back, so the very
    // next cue isn't silently swallowed. Still gated on the user gesture that ran unlock() once.
    if (document.visibilityState === 'visible') void this.cuePlayer.unlock();
  };

  constructor(
    private readonly cuePlayer: CuePlayer,
    /** Injectable for tests; defaults to the real wall clock. */
    private readonly now: () => number = () => performance.now(),
  ) {}

  /** Call from inside a user gesture (the Start button's click handler). Guarded for a non-DOM
   *  environment (SSR, Vitest's default Node environment) — there's no tab to background there. */
  unlock(): Promise<void> | void {
    if (!this.visibilityHandlerAttached && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
      this.visibilityHandlerAttached = true;
    }
    return this.cuePlayer.unlock();
  }

  setMuted(muted: boolean): void {
    this.cuePlayer.setMuted(muted);
  }

  /** Subscribes to the engine and plays cues for what it reports. Returns an unsubscribe function. */
  attach(engine: IntervalEngine): () => void {
    return engine.subscribe((result) => this.handleResult(result));
  }

  /** The impure half: measures the wall-clock gap since the last call, then plays whatever the
   *  pure decideCues() says to for this batch. */
  handleResult(result: EngineResult): void {
    const now = this.now();
    const deltaMs = this.lastNotifyAt === null ? 0 : now - this.lastNotifyAt;
    this.lastNotifyAt = now;

    for (const { cue, phaseType, secondsRemaining } of decideCues(result.events, deltaMs)) {
      this.cuePlayer.play(cue, { phaseType, secondsRemaining });
    }
  }

  dispose(): void {
    if (this.visibilityHandlerAttached && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }
    this.cuePlayer.dispose();
  }
}
