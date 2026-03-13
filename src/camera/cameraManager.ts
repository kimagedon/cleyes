/**
 * CameraManager: high-level camera lifecycle controller.
 *
 * Orchestrates: permission request → stream acquisition → VideoSource attach → ready state.
 * Handles errors and exposes a clean API to the rest of the app.
 */

import { logger } from '../utils/logger';
import { CameraError, releaseStream, requestCameraStream } from './permissions';
import { VideoSource } from './videoSource';

export type CameraState = 'idle' | 'requesting' | 'ready' | 'error' | 'stopped';

export interface CameraManagerEvents {
  onStateChange: (state: CameraState, error?: CameraError) => void;
  onStreamEnded: () => void;
}

export class CameraManager {
  private state: CameraState = 'idle';
  private stream: MediaStream | null = null;
  private readonly videoSource: VideoSource;
  private events: CameraManagerEvents;

  constructor(videoEl: HTMLVideoElement, events: CameraManagerEvents) {
    this.videoSource = new VideoSource(videoEl);
    this.events = events;

    this.videoSource.setStreamEndedCallback(() => {
      logger.warn('CameraManager', 'Stream ended unexpectedly');
      this.setState('error');
      this.events.onStreamEnded();
    });
  }

  private setState(state: CameraState, error?: CameraError): void {
    this.state = state;
    this.events.onStateChange(state, error);
    logger.info('CameraManager', 'State →', state);
  }

  async start(deviceId?: string): Promise<void> {
    // Allow restart with a different device even if already ready
    if (this.state === 'ready' || this.state === 'requesting') {
      this.stop();
    }

    this.setState('requesting');

    try {
      this.stream = await requestCameraStream(deviceId);
      await this.videoSource.attach(this.stream);
      this.setState('ready');
    } catch (err) {
      const cameraError = err instanceof CameraError
        ? err
        : new CameraError('unknown', String(err), err);
      this.setState('error', cameraError);
    }
  }

  stop(): void {
    if (this.stream) {
      releaseStream(this.stream);
      this.stream = null;
    }
    this.videoSource.detach();
    this.setState('stopped');
  }

  get videoSource_(): VideoSource {
    return this.videoSource;
  }

  get currentState(): CameraState {
    return this.state;
  }

  get isReady(): boolean {
    return this.state === 'ready';
  }
}
