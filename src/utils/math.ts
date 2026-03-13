/**
 * Math utilities used across analysis and render pipelines.
 */

/** Clamp value to [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Validate that a number is finite and not NaN. Used to guard uniforms. */
export function isValidUniform(value: number): boolean {
  return Number.isFinite(value);
}

/**
 * Validate and clamp a uniform value.
 * Returns fallback if the value is invalid (NaN, Infinity).
 * This prevents GPU crashes from bad control values.
 */
export function sanitizeUniform(value: number, min: number, max: number, fallback: number): number {
  if (!isValidUniform(value)) return fallback;
  return clamp(value, min, max);
}
