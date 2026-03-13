/**
 * VideoSource: manages the HTMLVideoElement lifecycle.
 *
 * Responsibilities:
 * - Attach / detach a MediaStream to a video element
 * - Wait for the video to be "ready" (readyState >= HAVE_CURRENT_DATA)
 * - Expose dimensions once known
 * - Detect stream-ended events (e.g. camera unplugged)
 *
 * WHY separate from CameraManager:
 * The video element lifecycle and stream acquisition are orthogonal concerns.
 * VideoSource handles the DOM side; CameraManager handles the media side.
 */

import { logger } from '../utils/logger';

export type StreamEndedCallback = () => void;

export class VideoSource {
  private readonly videoEl: HTMLVideoElement;
  private onStreamEnded: StreamEndedCallback | null = null;
  private endedHandler: (() => void) | null = null;

  constructor(videoEl: HTMLVideoElement) {
    this.videoEl = videoEl;
  }

  /** Attach a media stream and wait until video metadata is loaded. */
  async attach(stream: MediaStream): Promise<void> {
    this.detach(); // Clean up previous stream if any

    this.videoEl.srcObject = stream;

    // Listen for track-ended event (camera disconnected / browser revoked access)
    const track = stream.getVideoTracks()[0];
    if (track) {
      this.endedHandler = () => {
        logger.warn('VideoSource', 'Video track ended unexpectedly');
        this.onStreamEnded?.();
      };
      track.addEventListener('ended', this.endedHandler);
    }

    // Wait for video to have enough data to read frames.
    // readyState >= HAVE_CURRENT_DATA (2) means at least one frame is available.
    await this.waitForReady();

    try {
      await this.videoEl.play();
    } catch (err) {
      // Autoplay policy can block play() in some contexts.
      // Our video is muted so this should always succeed in Chrome.
      logger.warn('VideoSource', 'video.play() threw:', err);
    }

    logger.info('VideoSource', `Video ready: ${this.width}×${this.height}`);
  }

  /**
   * Wait for video to reach HAVE_CURRENT_DATA or higher readyState.
   * Uses 'loadeddata' event + timeout fallback.
   */
  private waitForReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Already ready
      if (this.videoEl.readyState >= 2) {
        resolve();
        return;
      }

      const onLoaded = () => {
        cleanup();
        resolve();
      };

      const onError = (e: Event) => {
        cleanup();
        reject(new Error(`Video element error: ${String(e)}`));
      };

      const timeoutId = setTimeout(() => {
        cleanup();
        // Don't reject — the video might still work in older states.
        logger.warn('VideoSource', 'Timeout waiting for video readyState, proceeding anyway');
        resolve();
      }, 8000);

      const cleanup = () => {
        this.videoEl.removeEventListener('loadeddata', onLoaded);
        this.videoEl.removeEventListener('error', onError);
        clearTimeout(timeoutId);
      };

      this.videoEl.addEventListener('loadeddata', onLoaded);
      this.videoEl.addEventListener('error', onError);
    });
  }

  /** Stop the stream and clear the video element. */
  detach(): void {
    if (this.videoEl.srcObject instanceof MediaStream) {
      // Stop all tracks
      const stream = this.videoEl.srcObject;
      const track = stream.getVideoTracks()[0];
      if (track && this.endedHandler) {
        track.removeEventListener('ended', this.endedHandler);
        this.endedHandler = null;
      }
    }
    this.videoEl.srcObject = null;
    this.videoEl.pause();
  }

  /** Set callback for when the stream ends unexpectedly. */
  setStreamEndedCallback(cb: StreamEndedCallback): void {
    this.onStreamEnded = cb;
  }

  get videoElement(): HTMLVideoElement {
    return this.videoEl;
  }

  get width(): number {
    return this.videoEl.videoWidth;
  }

  get height(): number {
    return this.videoEl.videoHeight;
  }

  /** True if video has a frame available for reading. */
  get hasFrame(): boolean {
    return this.videoEl.readyState >= 2 && !this.videoEl.paused && this.width > 0;
  }
}
