import { phaseDisplayName, totalDistanceMeters, tracksDistance, Workout } from '../model';

interface Props {
  workouts: Workout[];
  onSelect: (id: string) => void;
  onRun: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onReorder: (next: Workout[]) => void;
}

/** e.g. "Run 17s/75m + Walk 17s/25m". */
function phaseBreakdown(w: Workout): string {
  return w.phases
    .map((p) => {
      const distance = tracksDistance(p.type) ? `/${p.distanceMeters}m` : '';
      return `${phaseDisplayName(p.type)} ${p.durationSeconds}s${distance}`;
    })
    .join(' + ');
}

export function WorkoutLibrary({ workouts, onSelect, onRun, onNew, onDelete, onReorder }: Props) {
  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= workouts.length) return;
    const next = [...workouts];
    [next[index], next[target]] = [next[target], next[index]];
    onReorder(next);
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <span style={{ width: '2.5rem' }} />
        <h1>RefFit</h1>
        <button onClick={onNew}>New</button>
      </header>

      {workouts.length === 0 && <p className="empty">No workouts yet — tap New to create one.</p>}

      <ul className="workout-list">
        {workouts.map((w, i) => (
          <li key={w.id} className="workout-row">
            <button className="workout-main" onClick={() => onSelect(w.id)}>
              <span className="workout-name">{w.name}</span>
              <span className="workout-summary">
                {phaseBreakdown(w)} × {w.repeatCount} · {(totalDistanceMeters(w) / 1000).toFixed(1)} km
              </span>
            </button>
            <div className="workout-actions">
              <button onClick={() => onRun(w.id)} aria-label="Run">▶</button>
              <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
              <button onClick={() => move(i, 1)} disabled={i === workouts.length - 1} aria-label="Move down">↓</button>
              <button onClick={() => onDelete(w.id)} aria-label="Delete">🗑</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
