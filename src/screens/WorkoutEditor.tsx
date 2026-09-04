import { useState } from 'react';
import {
  makePhase,
  phaseDisplayName,
  targetPaceMetersPerSecond,
  totalDistanceMeters,
  totalDurationSeconds,
  totalPhaseCount,
  tracksDistance,
  Phase,
  PhaseType,
  Workout,
} from '../model';
import { formatMinSec } from '../format';

interface Props {
  workout: Workout;
  onSave: (workout: Workout) => void;
  onCancel: () => void;
}

const PHASE_TYPES: PhaseType[] = ['run', 'walk', 'sprint', 'rest'];
const WARNING_MARKS = [10, 5, 3];

export function WorkoutEditor({ workout, onSave, onCancel }: Props) {
  // Edit a draft copy; the original (and storage) is only touched on Save.
  const [draft, setDraft] = useState<Workout>(() => structuredClone(workout));

  function updatePhase(id: string, patch: Partial<Phase>) {
    setDraft((d) => ({
      ...d,
      phases: d.phases.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
  }

  function toggleWarning(phase: Phase, mark: number) {
    const has = phase.warningsAtSecondsRemaining.includes(mark);
    const next = has
      ? phase.warningsAtSecondsRemaining.filter((m) => m !== mark)
      : [...phase.warningsAtSecondsRemaining, mark].sort((a, b) => b - a);
    updatePhase(phase.id, { warningsAtSecondsRemaining: next });
  }

  function addPhase() {
    setDraft((d) => ({ ...d, phases: [...d.phases, makePhase({ type: 'run' })] }));
  }

  function deletePhase(id: string) {
    setDraft((d) => ({ ...d, phases: d.phases.filter((p) => p.id !== id) }));
  }

  function movePhase(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= draft.phases.length) return;
    setDraft((d) => {
      const phases = [...d.phases];
      [phases[index], phases[target]] = [phases[target], phases[index]];
      return { ...d, phases };
    });
  }

  const canSave = draft.name.trim().length > 0 && draft.phases.length > 0;

  return (
    <div className="screen">
      <header className="screen-header">
        <button onClick={onCancel}>Cancel</button>
        <h1>{draft.name || 'Workout'}</h1>
        <button onClick={() => onSave(draft)} disabled={!canSave}>Save</button>
      </header>

      <section className="details">
        <label>
          Name
          <input
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          />
        </label>
        <label>
          Lead-in (seconds)
          <input
            type="number"
            min={0}
            value={draft.leadInSeconds}
            onChange={(e) => setDraft((d) => ({ ...d, leadInSeconds: Number(e.target.value) }))}
          />
        </label>
        <label>
          Repeat count
          <input
            type="number"
            min={1}
            value={draft.repeatCount}
            onChange={(e) => setDraft((d) => ({ ...d, repeatCount: Number(e.target.value) }))}
          />
        </label>
      </section>

      <section className="phases">
        <h2>Phases (per rep)</h2>
        {draft.phases.map((p, i) => (
          <div key={p.id} className="phase-row">
            <select
              value={p.type}
              onChange={(e) => updatePhase(p.id, { type: e.target.value as PhaseType })}
            >
              {PHASE_TYPES.map((t) => (
                <option key={t} value={t}>{phaseDisplayName(t)}</option>
              ))}
            </select>

            <label className="inline">
              Duration (s)
              <input
                type="number"
                min={1}
                value={p.durationSeconds}
                onChange={(e) => updatePhase(p.id, { durationSeconds: Number(e.target.value) })}
              />
            </label>

            {tracksDistance(p.type) && (
              <label className="inline">
                Distance (m)
                <input
                  type="number"
                  min={0}
                  value={p.distanceMeters}
                  onChange={(e) => updatePhase(p.id, { distanceMeters: Number(e.target.value) })}
                />
              </label>
            )}

            {tracksDistance(p.type) && (
              <span className="pace">{targetPaceMetersPerSecond(p).toFixed(2)} m/s</span>
            )}

            <span className="warnings">
              {WARNING_MARKS.map((mark) => (
                <label key={mark} className="warning-toggle">
                  <input
                    type="checkbox"
                    checked={p.warningsAtSecondsRemaining.includes(mark)}
                    onChange={() => toggleWarning(p, mark)}
                  />
                  {mark}s
                </label>
              ))}
            </span>

            <div className="phase-actions">
              <button onClick={() => movePhase(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
              <button onClick={() => movePhase(i, 1)} disabled={i === draft.phases.length - 1} aria-label="Move down">↓</button>
              <button onClick={() => deletePhase(p.id)} aria-label="Delete phase">🗑</button>
            </div>
          </div>
        ))}
        <button onClick={addPhase}>+ Add phase</button>
      </section>

      <section className="summary">
        <span>{(totalDistanceMeters(draft) / 1000).toFixed(2)} km</span>
        <span>{formatMinSec(totalDurationSeconds(draft))}</span>
        <span>{totalPhaseCount(draft)} phases</span>
      </section>
    </div>
  );
}
