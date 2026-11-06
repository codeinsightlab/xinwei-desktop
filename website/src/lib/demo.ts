import { fixture } from '../content/demo.ts';

export type Playback = 'idle' | 'running' | 'paused';
export interface DemoState {
  playback: Playback;
  session: 'active' | 'closed';
  second: number;
  atDayBoundary: boolean;
}

export function derive(second: number) {
  const time = Math.min(fixture.lastSecond, Math.max(0, Math.floor(second)));
  const paidSeconds = fixture.periods.reduce((n, [start, end]) => n + Math.max(0, Math.min(time, end) - start), 0);
  const minor = Math.floor(paidSeconds * fixture.salaryMinor / (fixture.monthHours * 3600));
  const goalMinor = 80_000;
  return {
    minor, goalMinor, monthMinor: fixture.priorRecordedMinor + minor,
    progress: paidSeconds / (8 * 3600) * 100,
    remainingSeconds: Math.max(0, fixture.endSecond - time),
    overtimeSeconds: Math.max(0, time - fixture.endSecond),
    timeStatus: time >= fixture.endSecond ? 'after' : 'planned',
  } as const;
}

/** Monotonic source is injected. Pausing commits elapsed time once, never timer ticks. */
export class DemoClock {
  private baseSecond: number = fixture.initialSecond;
  private anchor = 0;
  private playback: Playback = 'idle';
  private session: DemoState['session'] = 'active';
  constructor(private readonly now: () => number) {}

  read(): DemoState {
    const elapsed = this.playback === 'running' ? Math.max(0, this.now() - this.anchor) / 1000 : 0;
    const second = Math.min(fixture.lastSecond, this.baseSecond + elapsed);
    if (second >= fixture.lastSecond && this.playback === 'running') {
      this.baseSecond = fixture.lastSecond;
      this.playback = 'paused';
    }
    return { second, playback: this.playback, session: this.session, atDayBoundary: second >= fixture.lastSecond };
  }
  play() {
    const state = this.read();
    if (state.session === 'closed' || state.atDayBoundary || state.playback === 'running') return;
    this.anchor = this.now();
    this.playback = 'running';
  }
  pause() {
    if (this.playback !== 'running') return;
    this.baseSecond = this.read().second;
    this.playback = 'paused';
  }
  finish() { this.pause(); this.session = 'closed'; }
  reset() { this.baseSecond = fixture.initialSecond; this.playback = 'idle'; this.session = 'active'; }
}

export function money(minor: number) { return (minor / 100).toFixed(2); }
export function hhmm(seconds: number) {
  const minutes = Math.ceil(Math.max(0, seconds) / 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
export function clockLabel(seconds: number) {
  return `${String(Math.floor(seconds / 3600)).padStart(2,'0')}:${String(Math.floor(seconds / 60) % 60).padStart(2,'0')}`;
}
