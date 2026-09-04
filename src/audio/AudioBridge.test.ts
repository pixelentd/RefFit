import { describe, expect, it } from 'vitest';
import { makePhase, PhaseType } from '../model';
import { EngineEvent, EngineResult } from '../engine';
import { AudioBridge, cueForEvent, decideCues, STALE_BATCH_THRESHOLD_MS } from './AudioBridge';
import { CuePlayer, CueType } from './CuePlayer';

/** A recording fake — no real audio I/O, just a log of what it was asked to play. */
class FakeCuePlayer implements CuePlayer {
  readonly playCalls: { cue: CueType; phaseType?: PhaseType; secondsRemaining?: number }[] = [];
  unlockCalls = 0;
  disposeCalls = 0;
  muted: boolean | null = null;

  unlock(): void {
    this.unlockCalls++;
  }

  play(cue: CueType, opts?: { phaseType?: PhaseType; secondsRemaining?: number }): void {
    this.playCalls.push({ cue, phaseType: opts?.phaseType, secondsRemaining: opts?.secondsRemaining });
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  dispose(): void {
    this.disposeCalls++;
  }
}

const runPhase = makePhase({ type: 'run', durationSeconds: 17, distanceMeters: 75 });
const walkPhase = makePhase({ type: 'walk', durationSeconds: 17, distanceMeters: 25 });

/** AudioBridge only reads .events — a minimal stand-in snapshot keeps fixtures short. */
function resultOf(events: EngineEvent[]): EngineResult {
  return { snapshot: {} as EngineResult['snapshot'], events };
}

describe('cueForEvent', () => {
  it('maps each cue-worthy event, carrying phaseType only for phase-start', () => {
    expect(cueForEvent({ type: 'countdown', secondsRemaining: 3 })).toEqual({ cue: 'countdown' });
    expect(cueForEvent({ type: 'phase-start', phaseIndex: 0, phase: runPhase, repNumber: 1 })).toEqual({
      cue: 'phase-start',
      phaseType: 'run',
    });
    expect(cueForEvent({ type: 'phase-start', phaseIndex: 1, phase: walkPhase, repNumber: 1 })).toEqual({
      cue: 'phase-start',
      phaseType: 'walk',
    });
    expect(cueForEvent({ type: 'workout-complete' })).toEqual({ cue: 'complete' });
  });

  it('carries secondsRemaining through for warning-cue — WebCuePlayer picks single vs. double beep by it', () => {
    expect(cueForEvent({ type: 'warning-cue', phaseIndex: 0, secondsRemaining: 10 })).toEqual({
      cue: 'warning',
      secondsRemaining: 10,
    });
    expect(cueForEvent({ type: 'warning-cue', phaseIndex: 0, secondsRemaining: 5 })).toEqual({
      cue: 'warning',
      secondsRemaining: 5,
    });
  });

  it('still maps phase-end to a cue — the no-op silencing it lives in WebCuePlayer, not here', () => {
    expect(cueForEvent({ type: 'phase-end', phaseIndex: 0 })).toEqual({ cue: 'phase-end' });
  });

  it('has no cue for preroll-start, paused, or resumed', () => {
    expect(cueForEvent({ type: 'preroll-start' })).toBeNull();
    expect(cueForEvent({ type: 'paused' })).toBeNull();
    expect(cueForEvent({ type: 'resumed' })).toBeNull();
  });
});

describe('decideCues — staleness suppression', () => {
  const missedBatch: EngineEvent[] = [
    { type: 'phase-end', phaseIndex: 0 },
    { type: 'phase-start', phaseIndex: 1, phase: walkPhase, repNumber: 1 },
    { type: 'warning-cue', phaseIndex: 1, secondsRemaining: 5 },
    { type: 'phase-end', phaseIndex: 1 },
    { type: 'phase-start', phaseIndex: 2, phase: runPhase, repNumber: 2 },
  ];

  it('plays every mapped cue for a normal (sub-threshold) delta', () => {
    const decisions = decideCues(missedBatch, 16);
    expect(decisions.map((d) => d.cue)).toEqual(['phase-end', 'phase-start', 'warning', 'phase-end', 'phase-start']);
  });

  it('collapses a stale batch down to just the most recent phase-start', () => {
    const decisions = decideCues(missedBatch, STALE_BATCH_THRESHOLD_MS + 1);
    expect(decisions).toEqual([{ cue: 'phase-start', phaseType: 'run' }]);
  });

  it('drops the whole batch when a stale jump contains no phase-start at all', () => {
    const noPhaseStart: EngineEvent[] = [
      { type: 'warning-cue', phaseIndex: 0, secondsRemaining: 5 },
      { type: 'phase-end', phaseIndex: 0 },
    ];
    expect(decideCues(noPhaseStart, STALE_BATCH_THRESHOLD_MS + 1)).toEqual([]);
  });

  it('treats a delta exactly at the threshold as normal — only strictly-over suppresses', () => {
    expect(decideCues(missedBatch, STALE_BATCH_THRESHOLD_MS)).toHaveLength(5);
  });
});

describe('AudioBridge', () => {
  it('plays cues immediately for a normal event stream, using an injected clock', () => {
    const player = new FakeCuePlayer();
    let now = 0;
    const bridge = new AudioBridge(player, () => now);

    bridge.handleResult(resultOf([{ type: 'preroll-start' }, { type: 'countdown', secondsRemaining: 3 }]));
    now = 16;
    bridge.handleResult(resultOf([{ type: 'countdown', secondsRemaining: 2 }]));
    now = 32;
    bridge.handleResult(resultOf([{ type: 'phase-start', phaseIndex: 0, phase: runPhase, repNumber: 1 }]));

    expect(player.playCalls).toEqual([
      { cue: 'countdown', phaseType: undefined },
      { cue: 'countdown', phaseType: undefined },
      { cue: 'phase-start', phaseType: 'run' },
    ]);
  });

  it('never treats the very first notification as a stale jump, however large `now` starts', () => {
    const player = new FakeCuePlayer();
    const bridge = new AudioBridge(player, () => 999_999); // huge — but there's no "previous" yet

    bridge.handleResult(resultOf([{ type: 'countdown', secondsRemaining: 3 }]));

    expect(player.playCalls).toEqual([{ cue: 'countdown', phaseType: undefined }]);
  });

  it('suppresses a burst from a backgrounded-tab clock jump, keeping only the latest phase-start', () => {
    const player = new FakeCuePlayer();
    let now = 0;
    const bridge = new AudioBridge(player, () => now);

    bridge.handleResult(resultOf([{ type: 'phase-start', phaseIndex: 0, phase: runPhase, repNumber: 1 }]));
    expect(player.playCalls).toHaveLength(1);

    // Tab gets backgrounded; rAF stalls; the engine's next tick fires everything it missed —
    // several warnings, phase-ends and phase-starts — in one go.
    now += STALE_BATCH_THRESHOLD_MS + 500;
    bridge.handleResult(
      resultOf([
        { type: 'warning-cue', phaseIndex: 0, secondsRemaining: 5 },
        { type: 'phase-end', phaseIndex: 0 },
        { type: 'phase-start', phaseIndex: 1, phase: walkPhase, repNumber: 1 },
        { type: 'phase-end', phaseIndex: 1 },
        { type: 'phase-start', phaseIndex: 2, phase: runPhase, repNumber: 2 },
      ]),
    );

    expect(player.playCalls).toHaveLength(2);
    expect(player.playCalls[1]).toEqual({ cue: 'phase-start', phaseType: 'run' });

    // Normal cadence resumes afterwards — no lingering suppression.
    now += 16;
    bridge.handleResult(resultOf([{ type: 'warning-cue', phaseIndex: 2, secondsRemaining: 5 }]));
    expect(player.playCalls).toHaveLength(3);
    expect(player.playCalls[2]).toEqual({ cue: 'warning', phaseType: undefined, secondsRemaining: 5 });
  });

  it('setMuted() and dispose() delegate straight to the CuePlayer', () => {
    const player = new FakeCuePlayer();
    const bridge = new AudioBridge(player, () => 0);

    bridge.setMuted(true);
    bridge.dispose();

    expect(player.muted).toBe(true);
    expect(player.disposeCalls).toBe(1);
  });
});
