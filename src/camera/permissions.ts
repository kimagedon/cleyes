/**
 * Camera permission handling.
 *
 * Wraps getUserMedia errors into typed domain errors so the rest of the
 * app can react specifically without parsing raw DOMException names.
 *
 * Reference: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
 * Error types: NotAllowedError, NotFoundError, NotReadableError, OverconstrainedError,
 *              AbortError, SecurityError, TypeError
 */

import { logger } from '../utils/logger';

export type CameraErrorType =
  | 'permissions-denied'
  | 'no-device'
  | 'device-in-use'
  | 'overconstrained'
  | 'unsupported-api'
  | 'unknown';

export class CameraError extends Error {
  constructor(
    public readonly type: CameraErrorType,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'CameraError';
  }
}

/**
 * Map a raw getUserMedia error to a typed CameraError.
 * DOMException name strings are from the W3C spec.
 */
export function classifyMediaError(err: unknown): CameraError {
  if (!(err instanceof Error)) {
    return new CameraError('unknown', 'Unknown camera error', err);
  }
  const name = (err as DOMException).name ?? err.constructor.name;
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return new CameraError('permissions-denied', 'Camera access denied by user or browser policy', err);
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return new CameraError('no-device', 'No camera device found', err);
    case 'NotReadableError':
    case 'TrackStartError':
      return new CameraError('device-in-use', 'Camera is already in use or hardware error', err);
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return new CameraError('overconstrained', 'Camera constraints could not be satisfied', err);
    case 'TypeError':
      return new CameraError('unsupported-api', 'getUserMedia API not available', err);
    default:
      return new CameraError('unknown', `Camera error: ${err.message}`, err);
  }
}

/**
 * Check if the browser supports getUserMedia at all.
 * This check is synchronous and safe to call at startup.
 */
export function isGetUserMediaSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices !== 'undefined' &&
    typeof navigator.mediaDevices.getUserMedia === 'function'
  );
}

/**
 * Request a camera stream with sensible constraints.
 *
 * Design decisions:
 * - We do NOT hardcode exact resolution constraints (e.g. {width: {exact: 1280}})
 *   because "exact" constraints fail on many devices. Instead we use "ideal".
 * - We request 30fps ideal — enough for our analysis pipeline.
 * - facingMode: 'user' requests the front camera on mobile.
 *
 * Returns a MediaStream or throws a typed CameraError.
 */
export async function requestCameraStream(deviceId?: string): Promise<MediaStream> {
  if (!isGetUserMediaSupported()) {
    throw new CameraError(
      'unsupported-api',
      'navigator.mediaDevices.getUserMedia is not available in this browser',
    );
  }

  const videoConstraints: MediaTrackConstraints = {
    width: { ideal: 1280, max: 1920 },
    height: { ideal: 720, max: 1080 },
    frameRate: { ideal: 30 },
  };

  if (deviceId) {
    videoConstraints.deviceId = { exact: deviceId };
  } else {
    videoConstraints.facingMode = 'user';
  }

  const constraints: MediaStreamConstraints = {
    video: videoConstraints,
    audio: false,
  };

  try {
    logger.info('Camera', 'Requesting camera stream with constraints:', constraints);
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    logger.info('Camera', 'Stream acquired:', stream.getVideoTracks()[0]?.getSettings());
    return stream;
  } catch (err) {
    const cameraError = classifyMediaError(err);
    logger.error('Camera', 'Stream request failed:', cameraError.type, cameraError.message);
    throw cameraError;
  }
}

/**
 * Enumerate available video input devices.
 * Must be called after getUserMedia grant for labels to be populated.
 */
export async function enumerateCameras(): Promise<MediaDeviceInfo[]> {
  if (!isGetUserMediaSupported()) return [];
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === 'videoinput');
  } catch (err) {
    logger.warn('Camera', 'Failed to enumerate devices:', err);
    return [];
  }
}

/** Stop all tracks in a MediaStream and release the camera. */
export function releaseStream(stream: MediaStream): void {
  stream.getTracks().forEach((track) => {
    track.stop();
    logger.debug('Camera', 'Stopped track:', track.label);
  });
}
