// Thin requestAnimationFrame driver for IntervalEngine. This is the one place that owns a loop
// or timer — the engine itself deliberately doesn't (see IntervalEngine.ts). It exists purely so
// browser UI code (the Run screen) has something to press "start" on; it is not used by, and not
// needed for, the engine's unit tests, which drive tick() directly with synthetic timestamps.

import { IntervalEngine } from './IntervalEngine';
import { EngineResult } from './types';

export class EngineRunner {
  private frameId: number | null = null;

  /** Subscribes to the engine immediately, so `onResult` also sees the very first start() event. */
  constructor(private readonly engine: IntervalEngine, onResult: (result: EngineResult) => void) {
    this.engine.subscribe(onResult);
  }

  start(): void {
    this.engine.start(performance.now());
    this.loop();
  }

  pause(): void {
    this.engine.pause(performance.now());
  }

  resume(): void {
    this.engine.resume(performance.now());
  }

  /** Cancels the rAF loop. Does not reset the engine — call engine.reset() separately if wanted. */
  stop(): void {
    if (this.frameId !== null) cancelAnimationFrame(this.frameId);
    this.frameId = null;
  }

  private loop = (): void => {
    const { snapshot } = this.engine.tick(performance.now());
    // The workout is over — no more events will ever fire, so stop spending frames on it.
    if (snapshot.status === 'complete') {
      this.frameId = null;
      return;
    }
    this.frameId = requestAnimationFrame(this.loop);
  };
}
