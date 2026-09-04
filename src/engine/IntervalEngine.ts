// The interval engine: a pure timing state machine for one workout session.
//
// It knows nothing about audio, GPS, or the DOM. start()/pause()/resume()/reset() are functions
// of the engine's own state and the `now` timestamp the caller supplies (performance.now(), in
// practice); tick(now) is the pure core that advances to `now` and reports which events fall in
// that span. The engine owns no timer or loop of its own — see runner.ts for a thin
// requestAnimationFrame driver that calls tick() every frame. That split is what makes this
// deterministic and unit-testable: feed it synthetic timestamps and the output is exact.
//
// Driving off elapsed time (now - startedAt - pausedTotalMs), rather than counting accumulated
// setInterval ticks, means no drift over a long session. It also means a stalled/backgrounded
// tab is not a special case: rAF just stops calling tick() for a while, and the next call gets a
// `now` that jumped forward, so every event timestamped in between fires at once, in order, on
// that one tick(). That's correct behavior for this pure engine — it is simply reporting "this
// is everything that happened between the two timestamps you gave me". Whether a cue is too
// stale to be worth playing is a judgment call for the audio layer built on top, not this one.

import { Workout } from '../model';
import { buildSchedule, Schedule } from './timeline';
import { computeSnapshot, idleSnapshot } from './snapshot';
import { EngineEvent, EngineResult, EngineSnapshot } from './types';

export class IntervalEngine {
  private readonly schedule: Schedule;
  private started = false;
  private startedAt = 0;
  private pausedTotalMs = 0;
  private pauseStartedAt: number | null = null;
  /** Index of the next not-yet-fired entry in schedule.timeline (which is sorted). */
  private nextEventIndex = 0;
  /** The snapshot to keep returning from tick() while paused. */
  private frozenSnapshot: EngineSnapshot | null = null;
  private readonly listeners = new Set<(result: EngineResult) => void>();

  constructor(workout: Workout) {
    this.schedule = buildSchedule(workout);
  }

  get isPaused(): boolean {
    return this.pauseStartedAt !== null;
  }

  /**
   * Convenience for UI code: called with the result of every start()/pause()/resume()/reset()/
   * tick(). tick() itself stays the pure core (its return value never depends on whether anyone
   * subscribed) — this just fans that same value out. Returns an unsubscribe function.
   */
  subscribe(listener: (result: EngineResult) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Begins the session at time `now`. Resets any previous run (safe to call again to restart). */
  start(now: number): EngineResult {
    this.started = true;
    this.startedAt = now;
    this.pausedTotalMs = 0;
    this.pauseStartedAt = null;
    this.nextEventIndex = 0;
    this.frozenSnapshot = null;
    // Fires t=0 events (preroll-start, or phase-start(0) if there's no lead-in) and, for a
    // zero-rep/empty-phases workout, the single workout-complete built into its schedule.
    return this.emit(this.advance(0));
  }

  /** Returns to the pre-start state. Does not fire any event — there's nothing to announce. */
  reset(): EngineResult {
    this.started = false;
    this.startedAt = 0;
    this.pausedTotalMs = 0;
    this.pauseStartedAt = null;
    this.nextEventIndex = 0;
    this.frozenSnapshot = null;
    return this.emit({ snapshot: idleSnapshot(this.schedule), events: [] });
  }

  pause(now: number): EngineResult {
    if (!this.started || this.isPaused) return this.emit({ snapshot: this.peek(now), events: [] });

    // Fire anything that occurred up to the freeze point before actually freezing the clock.
    const { snapshot, events } = this.advance(this.elapsedAt(now));
    this.pauseStartedAt = now;
    this.frozenSnapshot = { ...snapshot, isPaused: true };
    return this.emit({ snapshot: this.frozenSnapshot, events: [...events, { type: 'paused' }] });
  }

  resume(now: number): EngineResult {
    if (!this.isPaused) return this.emit({ snapshot: this.peek(now), events: [] });

    this.pausedTotalMs += now - this.pauseStartedAt!;
    this.pauseStartedAt = null;
    this.frozenSnapshot = null;
    const snapshot = computeSnapshot(this.schedule, this.elapsedAt(now), false);
    return this.emit({ snapshot, events: [{ type: 'resumed' }] });
  }

  /** The pure core. Advances to `now` and returns the events crossed since the last tick/start. */
  tick(now: number): EngineResult {
    if (!this.started) return { snapshot: idleSnapshot(this.schedule), events: [] };
    if (this.isPaused) return { snapshot: this.frozenSnapshot!, events: [] }; // no timeline events while paused
    return this.emit(this.advance(this.elapsedAt(now)));
  }

  /** Fires every timeline entry up to and including `elapsedMs`, then computes the snapshot there. */
  private advance(elapsedMs: number): EngineResult {
    const clamped = Math.min(Math.max(elapsedMs, 0), this.schedule.totalMs);
    const { timeline } = this.schedule;
    const events: EngineEvent[] = [];
    while (this.nextEventIndex < timeline.length && timeline[this.nextEventIndex].atMs <= clamped) {
      events.push(timeline[this.nextEventIndex].event);
      this.nextEventIndex++;
    }
    const snapshot = computeSnapshot(this.schedule, clamped, this.isPaused);
    return { snapshot, events };
  }

  private elapsedAt(now: number): number {
    return now - this.startedAt - this.pausedTotalMs;
  }

  /** A read-only snapshot for the no-op branches of pause()/resume() — never advances the cursor. */
  private peek(now: number): EngineSnapshot {
    if (!this.started) return idleSnapshot(this.schedule);
    if (this.isPaused) return this.frozenSnapshot!;
    return computeSnapshot(this.schedule, this.elapsedAt(now), false);
  }

  private emit(result: EngineResult): EngineResult {
    this.listeners.forEach((listener) => listener(result));
    return result;
  }
}
