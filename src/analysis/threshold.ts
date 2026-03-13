/**
 * Threshold map: binarizes the luminance field.
 *
 * Simple global threshold — sufficient for silhouette extraction.
 * Output: Uint8Array of 0 or 255 values.
 */

export function computeThreshold(
  luminance: Uint8Array,
  output: Uint8Array,
  thresholdValue: number, // Expected range [0, 255]
): void {
  const count = luminance.length;
  if (output.length < count) {
    throw new Error(`threshold output buffer too small: ${output.length} < ${count}`);
  }

  const t = thresholdValue | 0; // Ensure integer for fast compare

  for (let i = 0; i < count; i++) {
    output[i] = (luminance[i]!) > t ? 255 : 0;
  }
}

export function allocThresholdBuffer(pixelCount: number): Uint8Array {
  return new Uint8Array(pixelCount);
}
