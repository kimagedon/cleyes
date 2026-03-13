/**
 * Timing utilities for the render and analysis loops.
 */

/**
 * Simple FPS counter using a rolling window.
 * More stable than per-frame delta because it averages over N frames.
 */
export class FPSCounter {
  private readonly windowSize: number;
  private timestamps: number[] = [];
  private _fps = 0;

  constructor(windowSize = 60) {
    this.windowSize = windowSize;
  }

  tick(timestamp: number): void {
    this.timestamps.push(timestamp);
    if (this.timestamps.length > this.windowSize) {
      this.timestamps.shift();
    }
    if (this.timestamps.length >= 2) {
      const oldest = this.timestamps[0]!;
      const newest = this.timestamps[this.timestamps.length - 1]!;
      const elapsed = newest - oldest;
      this._fps = ((this.timestamps.length - 1) / elapsed) * 1000;
    }
  }

  get fps(): number {
    return this._fps;
  }
}

/**
 * Stopwatch for measuring code section duration.
 * Usage: const t = stopwatch(); doWork(); const ms = t();
 */
export function stopwatch(): () => number {
  const start = performance.now();
  return () => performance.now() - start;
}
