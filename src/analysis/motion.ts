/**
 * Motion detection via frame differencing.
 *
 * Algorithm: |current_luminance[i] - previous_luminance[i]|
 * Normalized to [0, 255].
 *
 * This is the simplest motion estimator. It is O(n) and allocation-free.
 *
 * Known limitation: in low-light scenes, noise dominates the signal.
 * Mitigation: motionSensitivity parameter scales up the threshold,
 * and we apply a noise floor (values below floor are clamped to 0).
 *
 * motionSensitivity range: [0.5, 5.0]
 * - Low value (0.5): only large, fast movements register
 * - High value (5.0): even subtle movements register (also picks up noise)
 */

export function computeMotion(
  current: Uint8Array,
  previous: Uint8Array,
  output: Uint8Array,
  sensitivity: number, // [0.5, 5.0]
  noiseFloor: number = 8, // Absolute luminance units — below this is treated as noise
): void {
  const count = current.length;
  if (output.length < count || previous.length < count) {
    throw new Error('motion: buffer size mismatch');
  }

  const clampedSensitivity = Math.max(0.5, Math.min(10, sensitivity));

  for (let i = 0; i < count; i++) {
    const diff = Math.abs((current[i]!) - (previous[i]!));
    const amplified = (diff - noiseFloor) * clampedSensitivity;
    output[i] = amplified > 0 ? Math.min(255, amplified | 0) : 0;
  }
}

export function allocMotionBuffer(pixelCount: number): Uint8Array {
  return new Uint8Array(pixelCount);
}

/**
 * Copy current luminance into previous buffer for next frame.
 * Must be called AFTER computeMotion and before the next frame's luminance compute.
 */
export function swapMotionBuffers(
  current: Uint8Array,
  previous: Uint8Array,
): void {
  previous.set(current);
}
