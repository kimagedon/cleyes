/**
 * Application state machine.
 *
 * States:
 *   idle → requesting-camera → running
 *   running → paused → running
 *   * → camera-error → requesting-camera
 *   * → fatal-render-error | unsupported-browser
 */

import type { CameraError } from '../camera/permissions';
import type { VisualModeName } from '../render/renderer';
import { sanitizeUniform } from '../utils/math';

export type AppState =
  | 'idle'
  | 'requesting-camera'
  | 'camera-ready'
  | 'running'
  | 'paused'
  | 'camera-error'
  | 'unsupported-browser'
  | 'fatal-render-error';

/** All user-controllable parameters. */
export interface RenderParams {
  visualMode: VisualModeName;
  mirror: boolean;
  invert: boolean;
  analysisWidth: number;
  analysisHeight: number;
  thresholdValue: number;    // [0, 255]
  motionSensitivity: number; // [0.5, 5.0]
  temporalDecay: number;     // [0.5, 0.99]
  pixelSize: number;         // [2, 32]
  glitchIntensity: number;   // [0, 1]
  showDebugOverlay: boolean;
  freezeFrame: boolean;
}

export const DEFAULT_RENDER_PARAMS: RenderParams = {
  visualMode: 'rgbDissolve',
  mirror: true,
  invert: false,
  analysisWidth: 160,
  analysisHeight: 90,
  thresholdValue: 100,
  motionSensitivity: 1.5,
  temporalDecay: 0.92,
  pixelSize: 8,
  glitchIntensity: 0.1,
  showDebugOverlay: false,
  freezeFrame: false,
};

/** Clamp all numeric params to valid ranges. Prevents NaN from reaching GPU. */
export function sanitizeParams(params: RenderParams): RenderParams {
  return {
    ...params,
    analysisWidth: Math.round(sanitizeUniform(params.analysisWidth, 40, 720, 160)),
    analysisHeight: Math.round(sanitizeUniform(params.analysisHeight, 22, 405, 90)),
    thresholdValue: sanitizeUniform(params.thresholdValue, 0, 255, 100),
    motionSensitivity: sanitizeUniform(params.motionSensitivity, 0.1, 10, 1.5),
    temporalDecay: sanitizeUniform(params.temporalDecay, 0.5, 0.9999, 0.92),
    pixelSize: sanitizeUniform(params.pixelSize, 1, 64, 8),
    glitchIntensity: sanitizeUniform(params.glitchIntensity, 0, 1, 0.1),
  };
}

export class AppStateManager {
  private state: AppState = 'idle';
  private cameraError: CameraError | null = null;
  private listeners: Array<(state: AppState, error?: CameraError) => void> = [];

  get current(): AppState {
    return this.state;
  }

  get error(): CameraError | null {
    return this.cameraError;
  }

  transition(next: AppState, error?: CameraError): void {
    const prev = this.state;
    this.state = next;
    this.cameraError = error ?? null;
    this.listeners.forEach((l) => l(next, error));

    if (import.meta.env.MODE !== 'production') {
      // eslint-disable-next-line no-console
      console.debug(`[AppState] ${prev} → ${next}${error ? ` (${error.type})` : ''}`);
    }
  }

  subscribe(listener: (state: AppState, error?: CameraError) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }
}
