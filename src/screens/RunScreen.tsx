import { useEffect, useState } from 'react';
import { EngineRunner, EngineEvent, EngineResult, EngineSnapshot, IntervalEngine } from '../engine';
import { AudioBridge, createCuePlayer } from '../audio';
import { useScreenWakeLock } from '../hooks/useScreenWakeLock';
import { phaseDisplayName, Workout } from '../model';
import { formatMinSec } from '../format';

interface Props {
  workout: Workout;
  onExit: () => void;
}

interface LogEntry {
  key: number;
  atWorkoutElapsedSeconds: number;
  event: EngineEvent;
}

const MAX_LOG_ENTRIES = 300;

/** One-line description of an event, for the scrolling log — this is a dev harness, not the
 *  final run UI, so plain text stands in for what will eventually be an audio cue. */
function describeEvent(event: EngineEvent): string {
  switch (event.type) {
    case 'preroll-start': return 'Preroll start';
    case 'countdown': return `Countdown: ${event.secondsRemaining}`;
    case 'phase-start': return `Phase start — rep ${event.repNumber}, ${phaseDisplayName(event.phase.type)}`;
    case 'warning-cue': return `Warning cue — ${event.secondsRemaining}s remaining (phase ${event.phaseIndex})`;
    case 'phase-end': return `Phase end (phase ${event.phaseIndex})`;
    case 'workout-complete': return 'Workout complete';
    case 'paused': return 'Paused';
    case 'resumed': return 'Resumed';
  }
}

/**
 * Timing harness for watching the engine run, on Windows, with zero audio: a live snapshot plus
 * a scrolling event log. Not the final run UI — no cues, no GPS, just the engine's own output.
 */
export function RunScreen({ workout, onExit }: Props) {
  // engine/runner are created once per mount; the parent remounts this screen (via key={workout.id})
  // when the selected workout changes, so a fresh engine per workout is exactly what we want.
  const [engine] = useState(() => new IntervalEngine(workout));
  const [snapshot, setSnapshot] = useState<EngineSnapshot>(() => engine.tick(performance.now()).snapshot);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [muted, setMutedState] = useState(false);

  const [runner] = useState(() => {
    let nextKey = 0;
    const onResult = ({ snapshot, events }: EngineResult) => {
      setSnapshot(snapshot);
      if (events.length === 0) return;
      setLog((prev) => {
        const additions = events.map((event) => ({
          key: nextKey++,
          atWorkoutElapsedSeconds: snapshot.workoutElapsedSeconds,
          event,
        }));
        return [...prev, ...additions].slice(-MAX_LOG_ENTRIES);
      });
    };
    return new EngineRunner(engine, onResult);
  });

  // One CuePlayer + AudioBridge per mount, same lifetime as the engine/runner above.
  const [cuePlayer] = useState(() => createCuePlayer());
  const [audioBridge] = useState(() => new AudioBridge(cuePlayer));

  // Subscribes the audio bridge to the engine's own event stream — independent of, and in
  // addition to, the runner's subscription above that drives the on-screen snapshot/log.
  useEffect(() => audioBridge.attach(engine), [audioBridge, engine]);

  // Stop the rAF loop on unmount (e.g. navigating back to the library) so it doesn't keep
  // ticking a screen that's no longer shown, and release the audio resources with it.
  useEffect(() => () => runner.stop(), [runner]);
  useEffect(() => () => audioBridge.dispose(), [audioBridge]);

  function handleStart() {
    setLog([]);
    // Must happen inside this click handler, synchronously — this is the user gesture that
    // browsers (iOS Safari especially) require before they'll let audio actually play.
    audioBridge.unlock();
    runner.start();
  }

  function toggleMuted() {
    const next = !muted;
    setMutedState(next);
    audioBridge.setMuted(next);
  }

  function handleReset() {
    runner.stop();
    engine.reset();
    setLog([]);
  }

  const canStart = snapshot.status === 'idle' || snapshot.status === 'complete';

  // Hold the screen awake for exactly as long as a workout is actually running — the hook
  // itself acquires/releases as this flips, including on pause/resume and on unmount.
  const shouldHoldWakeLock = !canStart && !snapshot.isPaused;
  const wakeLock = useScreenWakeLock(shouldHoldWakeLock);
  const showWakeLockHint = shouldHoldWakeLock && !wakeLock.isActive;

  return (
    <div className="screen run-screen">
      <header className="screen-header">
        <button onClick={onExit}>Back</button>
        <h1>{workout.name}</h1>
        <span style={{ width: '3.5rem' }} />
      </header>

      <div className="run-status">
        <span className="run-status-badge">{statusLabel(snapshot)}</span>
        {snapshot.repNumber !== null && (
          <span>rep {snapshot.repNumber} / {snapshot.totalReps}</span>
        )}
      </div>

      {showWakeLockHint && (
        <p className="wake-lock-hint">
          {wakeLock.isSupported
            ? 'Trying to keep your screen on…'
            : "Your browser can't keep the screen on automatically — keep it on manually so the beeps keep playing."}
        </p>
      )}

      <div className="run-countdown">{snapshot.phaseRemainingSeconds}</div>
      <ProgressBar progress={snapshot.phaseProgress} label="phase" />

      <div className="run-workout-time">
        {formatMinSec(snapshot.workoutElapsedSeconds)} / {formatMinSec(snapshot.workoutTotalSeconds)}
        {' '}(-{formatMinSec(snapshot.workoutRemainingSeconds)})
      </div>
      <ProgressBar progress={snapshot.workoutProgress} label="workout" />

      <div className="run-controls">
        {canStart && <button onClick={handleStart}>Start</button>}
        {!canStart && !snapshot.isPaused && <button onClick={() => runner.pause()}>Pause</button>}
        {!canStart && snapshot.isPaused && <button onClick={() => runner.resume()}>Resume</button>}
        <button onClick={handleReset} disabled={snapshot.status === 'idle'}>Reset</button>
        <button onClick={toggleMuted} aria-pressed={muted}>{muted ? 'Unmute' : 'Mute'}</button>
      </div>

      <h2>Event log</h2>
      <ul className="event-log">
        {log.length === 0 && <li className="empty">Nothing yet — tap Start.</li>}
        {log.map(({ key, atWorkoutElapsedSeconds, event }) => (
          <li key={key}>
            <span className="event-log-time">{formatMinSec(atWorkoutElapsedSeconds)}</span>
            {describeEvent(event)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function statusLabel(snapshot: EngineSnapshot): string {
  switch (snapshot.status) {
    case 'idle': return 'Idle';
    case 'preroll': return 'Get ready';
    case 'active': return snapshot.currentPhase ? phaseDisplayName(snapshot.currentPhase.type) : 'Active';
    case 'complete': return 'Complete';
  }
}

function ProgressBar({ progress, label }: { progress: number; label: string }) {
  return (
    <div className="progress-bar" aria-label={`${label} progress`}>
      <div className="progress-bar-fill" style={{ width: `${Math.min(1, Math.max(0, progress)) * 100}%` }} />
    </div>
  );
}
