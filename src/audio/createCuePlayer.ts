// Picks the right CuePlayer for the platform we're running on.

import { Capacitor } from '@capacitor/core';
import { PhaseType } from '../model';
import { CuePlayer, CueType } from './CuePlayer';
import { WebCuePlayer } from './WebCuePlayer';

/**
 * Half-2 stub. On a real device this should own an AVAudioSession configured for
 * `.playback` + `.duckOthers`, so a beep ducks Amazon Music instead of fighting with it (or
 * getting muted by the silent switch, which `.playback` also fixes). Building that needs a
 * native Capacitor plugin and a device to test it on — out of scope here.
 *
 * For now it just delegates straight to WebCuePlayer: a WKWebView plays Web Audio fine, so beeps
 * are already audible on-device today. They just don't duck anything yet.
 *
 * TODO(Half 2): replace the body of this class with a native AVAudioSession plugin call, falling
 * back to WebCuePlayer only if that plugin isn't available.
 */
class NativeCuePlayerStub implements CuePlayer {
  private readonly web = new WebCuePlayer();

  unlock(): Promise<void> | void {
    return this.web.unlock();
  }

  play(cue: CueType, opts?: { phaseType?: PhaseType }): void {
    this.web.play(cue, opts);
  }

  setMuted(muted: boolean): void {
    this.web.setMuted(muted);
  }

  dispose(): void {
    this.web.dispose();
  }
}

export function createCuePlayer(): CuePlayer {
  switch (Capacitor.getPlatform()) {
    case 'ios':
    case 'android':
      return new NativeCuePlayerStub();
    case 'web':
    default:
      return new WebCuePlayer();
  }
}
