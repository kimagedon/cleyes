/**
 * InputSourceManager — camera input wrapper.
 *
 * The camera video element is injected by bootstrap after the camera is ready.
 * This module provides a uniform getDrawable() interface for the render loop.
 */

import { logger } from '../utils/logger';

export class InputSourceManager {
  private cameraVideo: HTMLVideoElement | null = null;

  /** Inject the camera's video element. */
  setCameraSource(video: HTMLVideoElement): void {
    this.cameraVideo = video;
  }

  /** Returns the video element for FrameSampler, or null if not ready. */
  getDrawable(): HTMLVideoElement | null {
    return this.cameraVideo;
  }

  /** Whether the camera has a frame available to sample. */
  isReady(): boolean {
    const v = this.cameraVideo;
    return v !== null && v.readyState >= 2 && v.videoWidth > 0;
  }

  dispose(): void {
    this.cameraVideo = null;
    logger.info('InputSource', 'Disposed');
  }
}
